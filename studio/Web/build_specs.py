"""
Motionlayer Studio (Web edition) spec generator.
Copyright 2020-2026 MotionLayer P.C.

Reads every YAML spec in ``studio/Python/tinymovr/specs/`` through the avlos
deserializer (the same pipeline the firmware and Python client use), flattens
each device tree into a list of endpoint records with sequential ``ep_id``s,
computes the canonical 32-bit protocol hash, and writes the resulting payload
to ``src/specs.generated.json``.

The Vite build (``npm run build``) imports that JSON; the byte-for-byte
equivalence with the previous embedded blob is what guarantees that the
protocol hash sent by deployed firmware keeps matching this dashboard.

Run from the repo root or from this directory:

    python3 studio/Web/build_specs.py

The script is idempotent and re-runnable. The output file is gitignored
because it's deterministic from the YAML specs in the repo.

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version.
"""

from __future__ import annotations

import argparse
import enum
import json
import sys
from pathlib import Path

import yaml

from avlos.definitions.remote_attribute import RemoteAttribute
from avlos.definitions.remote_bitmask import RemoteBitmask
from avlos.definitions.remote_enum import RemoteEnum
from avlos.definitions.remote_function import RemoteFunction
from avlos.definitions.remote_node import RemoteNode
from avlos.deserializer import deserialize


REPO_ROOT = Path(__file__).resolve().parents[2]
SPECS_DIR = REPO_ROOT / "studio" / "Python" / "tinymovr" / "specs"
WEB_DIR = REPO_ROOT / "studio" / "Web"
OUTPUT_PATH = WEB_DIR / "src" / "specs.generated.json"

# Hash compatibility map mirrored from
# studio/Python/tinymovr/config/config.py. Allows older field firmware to be
# matched against a newer spec when only the dependency-driven hash differs.
HASH_ALIASES = {3526126264: [4118115615]}


def _dtype_name(dtype) -> str:
    """Map an avlos DataType enum member back to its canonical string name."""
    if dtype is None:
        return "void"
    return dtype.nickname  # e.g. DataType.UINT8 -> "uint8"


def _unit_name(unit) -> str | None:
    """Render a Pint unit object (or None) as a short user-facing string."""
    if unit is None:
        return None
    try:
        # Prefer compact symbols ("A", "V", "tick/s") over long names where Pint provides them.
        return f"{unit:~}".strip() or str(unit)
    except (TypeError, ValueError):
        return str(unit)


def _meta(node) -> dict:
    """Return a plain ``dict`` copy of an avlos node's meta map (or empty)."""
    raw = getattr(node, "meta", None) or {}
    out = {}
    for k, v in raw.items():
        if isinstance(v, (str, int, float, bool)) or v is None:
            out[k] = v
        else:
            out[k] = str(v)
    return out


def _enum_options(node: RemoteEnum) -> list[str]:
    """Return the list of option names for an enum node, in declaration order."""
    options = node.options
    # ``options`` is a dynamically-created IntEnum. Iteration order matches
    # declaration order which is what the firmware uses for the wire value.
    if isinstance(options, type) and issubclass(options, enum.Enum):
        return [m.name for m in options]
    if isinstance(options, list):
        return list(options)
    return []


def _bitmask_flags(node: RemoteBitmask) -> list[str]:
    """Return bit names for a bitmask node, ordered by bit position (LSB first)."""
    bm = node.bitmask
    if isinstance(bm, type) and issubclass(bm, enum.Flag):
        # Enum.Flag members are declared in bit-order in the YAML and avlos
        # assigns increasing 2^n values. Sort by value to be defensive.
        members = sorted(bm.__members__.items(), key=lambda kv: kv[1].value)
        return [name for name, _ in members]
    if isinstance(bm, list):
        return list(bm)
    return []


def _flatten(node, out: list[dict], prefix: str = "") -> None:
    """Walk an avlos tree and append a flat record per endpoint to ``out``."""
    if isinstance(node, RemoteNode):
        for child in node.remote_attributes.values():
            _flatten(child, out, prefix)
        return

    # All leaves expose ``name`` and ``ep_id`` (assigned by the schema counter).
    path = node.full_name  # e.g. "controller.position.setpoint"

    record: dict = {
        "path": path,
        "name": node.name,
        "ep_id": node.ep_id,
        "summary": getattr(node, "summary", None) or "",
        "meta": _meta(node),
    }

    if isinstance(node, RemoteEnum):
        record["kind"] = "enum"
        record["dtype"] = _dtype_name(node.enum_type)
        record["unit"] = None
        record["options"] = _enum_options(node)
        record["get"] = bool(node.getter_name)
        record["set"] = bool(node.setter_name)
        record["call"] = False

    elif isinstance(node, RemoteBitmask):
        record["kind"] = "bitmask"
        record["dtype"] = _dtype_name(node.flag_type)
        record["unit"] = None
        record["flags"] = _bitmask_flags(node)
        record["get"] = bool(node.getter_name)
        record["set"] = False  # avlos refuses bitmask sets, mirror that
        record["call"] = False

    elif isinstance(node, RemoteFunction):
        record["kind"] = "void_func" if node.dtype.is_void else "func"
        record["dtype"] = _dtype_name(node.dtype)
        record["unit"] = _unit_name(node.unit)
        record["args"] = [
            {
                "name": a.name,
                "dtype": _dtype_name(a.dtype),
                "unit": _unit_name(a.unit),
            }
            for a in node.arguments
        ]
        record["get"] = False
        record["set"] = False
        record["call"] = True

    elif isinstance(node, RemoteAttribute):
        record["kind"] = "attr"
        record["dtype"] = _dtype_name(node.dtype)
        record["unit"] = _unit_name(node.unit)
        record["get"] = bool(node.getter_name)
        record["set"] = bool(node.setter_name)
        record["call"] = False

    else:
        # Unknown node type (forward-compat): record with whatever we can.
        record["kind"] = "unknown"
        record["dtype"] = _dtype_name(getattr(node, "dtype", None))
        record["unit"] = _unit_name(getattr(node, "unit", None))
        record["get"] = bool(getattr(node, "getter_name", None))
        record["set"] = bool(getattr(node, "setter_name", None))
        record["call"] = bool(getattr(node, "caller_name", None))

    out.append(record)


def _version_from_filename(path: Path) -> str:
    """``tinymovr_2_6_x.yaml`` -> ``"2.6.x"``; ``dfu_1_0_x.yaml`` -> ``"1.0.x"``."""
    stem = path.stem
    parts = stem.split("_")
    if len(parts) >= 4:
        return ".".join(parts[-3:])
    return stem


def _family_from_filename(path: Path) -> str:
    """Distinguish application vs DFU specs by filename prefix."""
    return "dfu" if path.stem.startswith("dfu_") else "tinymovr"


def build_specs() -> list[dict]:
    """Process every YAML in the specs directory; return the list of records."""
    specs: list[dict] = []
    for yaml_path in sorted(SPECS_DIR.glob("*.yaml")):
        with open(yaml_path) as fh:
            description = yaml.safe_load(fh)

        node = deserialize(description)

        endpoints: list[dict] = []
        _flatten(node, endpoints)

        hash_uint32 = int(node.hash_uint32)
        spec = {
            "family": _family_from_filename(yaml_path),
            "version": _version_from_filename(yaml_path),
            "name": node.name,
            "filename": yaml_path.name,
            "hash_uint32": hash_uint32,
            "hash_low8": hash_uint32 & 0xFF,
            "endpoints": endpoints,
        }
        specs.append(spec)
    return specs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument(
        "--out",
        type=Path,
        default=OUTPUT_PATH,
        help=f"Output path for the generated JSON (default: {OUTPUT_PATH.relative_to(REPO_ROOT)}).",
    )
    args = parser.parse_args()

    specs = build_specs()

    payload = {
        "generatedFrom": "studio/Web/build_specs.py",
        "specCount": len(specs),
        "hashAliases": {str(k): v for k, v in HASH_ALIASES.items()},
        "specs": specs,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    total_eps = sum(len(s["endpoints"]) for s in specs)
    rel = args.out.resolve().relative_to(REPO_ROOT)
    print(f"Wrote {rel} ({len(specs)} specs, {total_eps} endpoints)")
    for s in specs:
        print(
            f"  - {s['filename']:<22} "
            f"hash=0x{s['hash_uint32']:08x} "
            f"low8=0x{s['hash_low8']:02x} "
            f"endpoints={len(s['endpoints'])}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
