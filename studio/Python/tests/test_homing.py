"""
This unit test suite tests the Homing functionality.
"""
import time

from avlos.unit_field import get_registry

import unittest
import pytest
from tests import TMTestCase

ureg = get_registry()
A = ureg.ampere
ticks = ureg.ticks
s = ureg.second

HOMING_WARNINGS_NONE = 0
HOMING_WARNINGS_TIMEOUT = 1

CONTROLLER_MODE_POSITION = 2
CONTROLLER_MODE_HOMING = 4

ITERATIONS_PER_DIRECTION = 2
HOMING_SPEED = 4000.0
FREE_TRAVEL_S = 1.5
STALL_DWELL_EXTRA_S = 0.3
RETRACT_SETTLE_S = 0.3
INTER_ITERATION_PAUSE_S = 0.3


class TestHoming(TMTestCase):
    def test_homing(self):
        """
        Test Homing
        """
        self.check_state(0)
        self.try_calibrate()

        self.tm.controller.position_mode()
        self.check_state(2)

        self.tm.homing.home()
        time.sleep(self.tm.homing.max_homing_t.magnitude + 0.1)

        self.assertEqual(self.tm.controller.mode, 2)
        self.assertEqual(self.tm.homing.warnings, 1)
        self.tm.controller.idle()

    @pytest.mark.hitl_default
    @pytest.mark.hitl_mini
    def test_homing_retraction(self):
        """
        Regression test for the homing retraction reference bug
        (fix commit 86b19db).

        Per-iteration flow: motor runs freely for FREE_TRAVEL_S, the current
        limit is dropped to simulate an endstop, the planner detects the
        stall and installs the user-frame offset, the current limit is
        restored so the motor physically retracts to user_pos =
        -direction*retract_dist, and a sensor-frame displacement assertion
        verifies the physical motion matches expectation.

        The bug only manifests when the user-frame offset is non-zero at the
        start of homing (carried over from a previous run), so the test
        runs ITERATIONS_PER_DIRECTION>=2 iterations per direction in both
        +1 and -1 directions. See plan file for full frame analysis.
        """
        self.check_state(0)
        self.try_calibrate()

        iq_limit_normal = self.tm.controller.current.Iq_limit.magnitude
        homing_velocity_saved = self.tm.homing.velocity.magnitude
        max_homing_t_saved = self.tm.homing.max_homing_t.magnitude
        max_stall_t_saved = self.tm.homing.stall_detect.t.magnitude
        retract_dist_saved = self.tm.homing.retract_dist.magnitude
        stall_vel_saved = self.tm.homing.stall_detect.velocity.magnitude
        stall_dpos_saved = self.tm.homing.stall_detect.delta_pos.magnitude
        user_offset_saved = self.tm.sensors.user_frame.offset.magnitude
        user_multiplier_saved = self.tm.sensors.user_frame.multiplier

        iq_limit_stall = 0.1

        try:
            self.assertAlmostEqual(
                float(user_multiplier_saved),
                1.0,
                delta=1e-6,
                msg=(
                    "Test math assumes user_frame.multiplier == 1.0 "
                    f"(actual: {user_multiplier_saved}). Set it to 1.0 "
                    "before running this test."
                ),
            )

            self.tm.homing.max_homing_t = 6.0
            self.tm.homing.stall_detect.t = 0.3
            self.tm.homing.retract_dist = 1024
            self.tm.homing.stall_detect.velocity = 500
            self.tm.homing.stall_detect.delta_pos = 256

            self.tm.controller.position_mode()
            self.check_state(2)

            for direction in (+1, -1):
                for iteration in range(ITERATIONS_PER_DIRECTION):
                    self._run_homing_iteration(
                        direction=direction,
                        iteration=iteration,
                        iq_limit_normal=iq_limit_normal,
                        iq_limit_stall=iq_limit_stall,
                    )
                    time.sleep(INTER_ITERATION_PAUSE_S)
        finally:
            self.tm.controller.idle()
            self.tm.controller.current.Iq_limit = iq_limit_normal
            self.tm.homing.velocity = homing_velocity_saved
            self.tm.homing.max_homing_t = max_homing_t_saved
            self.tm.homing.stall_detect.t = max_stall_t_saved
            self.tm.homing.retract_dist = retract_dist_saved
            self.tm.homing.stall_detect.velocity = stall_vel_saved
            self.tm.homing.stall_detect.delta_pos = stall_dpos_saved
            self.tm.sensors.user_frame.offset = user_offset_saved
            self.tm.sensors.user_frame.multiplier = user_multiplier_saved

    def _run_homing_iteration(
        self, direction, iteration, iq_limit_normal, iq_limit_stall
    ):
        """
        Execute a single homing iteration in the given direction and verify
        the resulting physical displacement in the sensor frame.

        Returns nothing; raises AssertionError on failure.
        """
        retract_dist = self.tm.homing.retract_dist.magnitude
        max_homing_t = self.tm.homing.max_homing_t.magnitude
        stall_detect_t = self.tm.homing.stall_detect.t.magnitude

        sensor_pos_before = (
            self.tm.sensors.select.position_sensor.position_estimate.magnitude
        )

        self.tm.homing.velocity = direction * HOMING_SPEED
        self.tm.controller.current.Iq_limit = iq_limit_normal
        time.sleep(0.05)

        self.tm.homing.home()

        time.sleep(FREE_TRAVEL_S)

        mode_after_free = int(self.tm.controller.mode)
        self.assertEqual(
            mode_after_free,
            CONTROLLER_MODE_HOMING,
            msg=(
                f"dir={direction:+d} iter={iteration}: planner exited HOMING "
                f"during free-travel phase (mode={mode_after_free}). "
                f"FREE_TRAVEL_S ({FREE_TRAVEL_S}s) may be too long for the "
                "current stall_detect parameters, or the motor stalled "
                "without the simulated low-Iq endstop."
            ),
        )

        self.tm.controller.current.Iq_limit = iq_limit_stall
        time.sleep(stall_detect_t + STALL_DWELL_EXTRA_S)

        self.tm.controller.current.Iq_limit = iq_limit_normal

        timeout_s = max_homing_t + 2.0
        deadline = time.monotonic() + timeout_s
        while int(self.tm.controller.mode) == CONTROLLER_MODE_HOMING:
            if time.monotonic() > deadline:
                self.fail(
                    f"dir={direction:+d} iter={iteration}: homing did not "
                    f"exit within {timeout_s}s after stall induction"
                )
            time.sleep(0.05)

        warnings = int(self.tm.homing.warnings)
        self.assertEqual(
            warnings,
            HOMING_WARNINGS_NONE,
            msg=(
                f"dir={direction:+d} iter={iteration}: expected endstop "
                f"detection (warnings=0) but got warnings={warnings}"
            ),
        )
        self.assertEqual(
            int(self.tm.controller.mode), CONTROLLER_MODE_POSITION
        )

        time.sleep(RETRACT_SETTLE_S)

        sensor_pos_after = (
            self.tm.sensors.select.position_sensor.position_estimate.magnitude
        )
        sensor_displacement = sensor_pos_after - sensor_pos_before
        expected_displacement = direction * (
            FREE_TRAVEL_S * HOMING_SPEED - retract_dist
        )
        displacement_tolerance = 0.5 * FREE_TRAVEL_S * HOMING_SPEED

        self.assertAlmostEqual(
            sensor_displacement,
            expected_displacement,
            delta=displacement_tolerance,
            msg=(
                f"dir={direction:+d} iter={iteration}: sensor-frame "
                f"displacement is {sensor_displacement:.1f} ticks, expected "
                f"{expected_displacement:.1f} +-{displacement_tolerance:.1f}. "
                "A large deviation here on iteration>=1 indicates the "
                "user-frame offset was installed in the wrong reference "
                "frame during homing (regression of fix 86b19db). The "
                "magnitude of the deviation should be approximately equal "
                "to the offset carried over from the previous homing."
            ),
        )

        user_pos = self.tm.sensors.user_frame.position_estimate.magnitude
        expected_user_pos = -direction * retract_dist
        user_pos_tolerance = 0.5 * retract_dist
        self.assertAlmostEqual(
            user_pos,
            expected_user_pos,
            delta=user_pos_tolerance,
            msg=(
                f"dir={direction:+d} iter={iteration}: user-frame position "
                f"after homing is {user_pos:.1f} ticks, expected "
                f"{expected_user_pos:.1f} +-{user_pos_tolerance:.1f}. This "
                "is a self-consistency check on the planner's setpoint "
                "tracking and does NOT detect the frame-offset bug; the "
                "sensor-frame assertion above is the regression check."
            ),
        )


if __name__ == "__main__":
    unittest.main(failfast=True)
