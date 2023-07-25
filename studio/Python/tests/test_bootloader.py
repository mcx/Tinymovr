"""
Tinymovr Bootloader Test Class
Copyright Ioannis Chatzikonstantinou 2020-2023

Implements convenience functionality.

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

import os
import time
import can

from tinymovr import init_tee, destroy_tee
from tinymovr.config import (
    get_bus_config,
    create_device,
    tinymovr_definition,
    bl_definition,
)

import unittest


class TMTestCase(unittest.TestCase):
    def test_bootloader(self):
        params = get_bus_config(["canine", "slcan"])
        params["bitrate"] = 1000000
        self.can_bus = can.Bus(**params)
        init_tee(self.can_bus)
        tm = create_device(node_id=1, device_definition=tinymovr_definition)
        tm_hash = tm.protocol_hash
        tm.invoke_bootloader()
        time.sleep(1)
        bl = create_device(node_id=1, device_definition=bl_definition)
        bl_hash = bl.protocol_hash
        bl.reset()
        tm = create_device(node_id=1, device_definition=tinymovr_definition)
        tm_hash2 = tm.protocol_hash
        tm.reset()
        time.sleep(0.05)
        tm_hash3 = tm.protocol_hash
        self.assertEqual(tm_hash, tm_hash2)
        self.assertEqual(tm_hash, tm_hash3)
        self.assertNotEqual(tm_hash, bl_hash)

    @classmethod
    def tearDownClass(cls):
        destroy_tee()
        cls.can_bus.shutdown()


if __name__ == "__main__":
    unittest.main(failfast=True)
