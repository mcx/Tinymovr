"""
Tinymovr Simulation Tests
Copyright Ioannis Chatzikonstantinou 2020-2023

Tests functionality of the Tinymovr Studio using a simulated Tinymovr device.

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version.
This program is distributed in the hope that it will be useful, but WITHOUT
ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
You should have received a copy of the GNU General Public License along with
this program. If not, see <http://www.gnu.org/licenses/>.
"""

import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

import yaml

from tinymovr import init_router, destroy_router
from tinymovr.channel import ResponseError
from tinymovr.config import create_device


SETTABLE_FIELDS_WITHOUT_EXPORT = {
    "tm.controller.state",
    "tm.controller.mode",
    "tm.controller.position.setpoint",
    "tm.controller.velocity.setpoint",
    "tm.controller.current.Iq_setpoint",
}


def _walk_spec(node, path=""):
    """Yield (full_path, has_setter, has_export) for every leaf in the spec."""
    name = node.get("name", "")
    full_path = f"{path}.{name}" if path else name
    if "setter_name" in node:
        meta = node.get("meta") or {}
        yield full_path, True, bool(meta.get("export", False))
    for child in node.get("remote_attributes", []):
        yield from _walk_spec(child, full_path)


class TestSimulation(unittest.TestCase):
    
    @patch("can.Bus")
    def test_response_error(self, mock_can_bus_class):
        """
        Test that an appropriate error is raised when the device receives an erroneous response.
        """
        mock_can_bus_instance = MagicMock()
        mock_can_bus_class.return_value = mock_can_bus_instance
        mock_params = MagicMock()
        mock_logger = MagicMock()
        
        init_router(mock_can_bus_class, mock_params, logger=mock_logger)
        
        with self.assertRaises(ResponseError):
            create_device(node_id=1)
        
        assert mock_can_bus_instance.send.called
        assert mock_can_bus_instance.recv.called
        
        destroy_router()

    def test_all_config_fields_have_export_flag(self):
        """
        Verify that every settable (config) field in the latest spec has
        meta: {export: True}, so JSON import/export works correctly.
        """
        spec_dir = Path(__file__).resolve().parent.parent / "tinymovr" / "specs"
        spec_path = spec_dir / "tinymovr_2_6_x.yaml"
        with open(spec_path) as f:
            spec = yaml.safe_load(f)

        missing = []
        for full_path, has_setter, has_export in _walk_spec(spec):
            if has_setter and not has_export and full_path not in SETTABLE_FIELDS_WITHOUT_EXPORT:
                missing.append(full_path)

        self.assertEqual(
            missing,
            [],
            f"Settable config fields missing meta.export=True: {missing}",
        )


if __name__ == "__main__":
    unittest.main()
