# Changelog

All notable changes to Tinymovr (firmware and Studio) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versions cover the project as a whole (firmware + Studio + supporting tooling).
Older per-component tags (`fw-v*`, `studio-v*`) predate the unified versioning and
are not used for current releases. The `studio-v*` tags have been removed; legacy
`fw-v*` tags are preserved for historical reference only.

## [Unreleased]

### Added
- WebGUI — first release. Configure, tune, and monitor Tinymovr from the browser.
- Self-contained web dashboard at `studio/Web/dashboard.html` that connects
  to Tinymovrs over a WebSerial slcan adapter, auto-discovers devices via
  CAN heartbeats, and exposes state/mode/setpoint/estimate controls plus a
  spec-driven explorer. Built with Vite + `vite-plugin-singlefile` from
  modular ES sources under `studio/Web/src/`; protocol descriptions are
  baked in at build time by `studio/Web/build_specs.py`, so endpoint IDs
  and hashes always match the deployed firmware. Hostable on GitHub Pages
  as a single HTML file with no runtime dependencies.
- MA600 magnetic position sensor support, broadening hardware compatibility.

### Changed
- New development model: core development moves to a private repository.
  Documentation, releases, examples, and migration guides remain public.

### Notes
- Version 3.0.0 will mark the first release under the new development model.
- See `MIGRATIONS.md` (to be added) for any user-facing migration notes for 3.0.

## [2.6.1] - 2026-04-12

Most recent published release. See the corresponding GitHub Release and git
history for full details.

## [2.6.0] - 2026-03-22

See the corresponding GitHub Release and git history for full details.

## Pre-2.6 History

For releases earlier than 2.6.0, refer to git tags and prior GitHub Releases:
<https://github.com/motionlayer/Tinymovr/releases>

[Unreleased]: https://github.com/motionlayer/Tinymovr/compare/2.6.1...HEAD
[2.6.1]: https://github.com/motionlayer/Tinymovr/compare/2.6.0...2.6.1
[2.6.0]: https://github.com/motionlayer/Tinymovr/releases/tag/2.6.0
