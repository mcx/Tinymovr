# Tinymovr Testing Guide

**Purpose**: Testing infrastructure, practices, and requirements for Tinymovr development.

**Target Audience**: Developers and AI agents writing tests for firmware or Python client.

## Test Types

### 1. Simulation Tests (No Hardware Required)

**Purpose**: Logic validation, protocol testing, unit tests that don't require physical hardware.

**Location**: [studio/Python/tests/test_simulation.py](studio/Python/tests/test_simulation.py)

**Running**:
```bash
cd studio/Python
python -m unittest tests/test_simulation.py
```

**When to Use**:
- Testing protocol hash computation
- Validating spec parsing
- Testing serialization/deserialization logic
- Unit testing helper functions

### 2. Hardware-in-the-Loop (HITL) Tests

**Purpose**: End-to-end testing with real Tinymovr hardware.

**Requirements**:
- Tinymovr board (R3.x, R5.x, or M5.x)
- Motor connected (type depends on board)
- CAN interface (CANine, slcan, socketcan, etc.)
- Motor must be free to rotate

**Location**: [studio/Python/tests/](studio/Python/tests/)

**Running**:
```bash
cd studio/Python

# Basic hardware tests
pytest -m hitl_default

# Verbose output
pytest tests/test_board.py -v

# Specific test
pytest tests/test_board.py::TestTinymovr::test_position_control -v
```

### 3. Sensor-Specific Tests

**Purpose**: Testing specific encoder types.

**Markers**:
- `@pytest.mark.sensor_amt22` - Requires AMT22 encoder
- `@pytest.mark.sensor_as5047` - Requires AS5047 encoder
- `@pytest.mark.sensor_hall` - Requires Hall effect sensors

**Running**:
```bash
pytest -m sensor_as5047   # Only AS5047 tests
pytest -m sensor_amt22    # Only AMT22 tests
pytest -m sensor_hall     # Only Hall sensor tests
```

### 4. End-of-Line (EOL) Tests

**Purpose**: Comprehensive production testing.

**Marker**: `@pytest.mark.eol`

**Running**:
```bash
pytest -m eol
```

**Characteristics**:
- Extensive coverage
- Tests all major features
- Validates calibration accuracy
- Checks error handling
- Long duration (15+ minutes)

### 5. DFU/Bootloader Tests

**Purpose**: Firmware update and bootloader testing.

**Marker**: `@pytest.mark.dfu`

**Running**:
```bash
pytest -m dfu
```

## Test Markers Reference

### Pytest Markers

```python
import pytest

@pytest.mark.hitl_default        # Basic hardware test
@pytest.mark.sensor_amt22        # Requires AMT22 encoder
@pytest.mark.sensor_as5047       # Requires AS5047 encoder
@pytest.mark.sensor_hall         # Requires Hall sensors
@pytest.mark.eol                 # End-of-line comprehensive test
@pytest.mark.dfu                 # Bootloader/firmware update test
```

### Running Multiple Markers

```bash
# Run hitl_default AND sensor_as5047 tests
pytest -m "hitl_default or sensor_as5047"

# Run all except EOL tests
pytest -m "not eol"

# Run only AS5047 EOL tests
pytest -m "eol and sensor_as5047"
```

## Writing Tests

### Test Structure (Base Class)

All HITL tests inherit from [TMTestCase](studio/Python/tests/tm_test_case.py):

```python
import pytest
from tests.tm_test_case import TMTestCase

class TestMyFeature(TMTestCase):
    """Test suite for my feature"""

    @pytest.mark.hitl_default
    def test_feature_basic(self):
        """Test basic functionality"""
        # Verify initial state
        self.check_state(0)  # Should be IDLE

        # Calibrate if needed
        self.try_calibrate()

        # Test your feature
        self.tm.my_endpoint = 123.0
        result = self.tm.my_endpoint

        self.assertAlmostEqual(result, 123.0, delta=0.1)

    @pytest.mark.hitl_default
    def test_feature_edge_case(self):
        """Test edge case handling"""
        self.try_calibrate()

        # Test out-of-range input
        with self.assertRaises(Exception):
            self.tm.my_endpoint = 99999.0
```

### TMTestCase Helper Methods

**Key Methods**:
- `self.tm` - Device instance (automatically created in setUp)
- `self.check_state(expected_state)` - Assert controller state
- `self.try_calibrate()` - Calibrate if not already calibrated
- `self.wait_for_calibration()` - Wait for calibration to complete

**Example Usage**:
```python
# Check state
self.check_state(0)  # Verify IDLE
self.check_state(2)  # Verify CL_CONTROL

# Calibrate
self.try_calibrate()  # Only calibrates if needed

# Standard assertions
self.assertEqual(actual, expected)
self.assertAlmostEqual(actual, expected, delta=0.01)
self.assertGreater(value, threshold)
self.assertLess(value, threshold)
```

### Test Naming Conventions

**Format**: `test_<feature>_<scenario>`

**Examples**:
```python
def test_position_control_basic(self):
    """Test basic position control"""
    pass

def test_position_control_trajectory(self):
    """Test position control with trajectory planner"""
    pass

def test_calibration_resistance_range(self):
    """Test resistance calibration with out-of-range motor"""
    pass

def test_error_handling_overcurrent(self):
    """Test automatic transition to IDLE on overcurrent"""
    pass
```

### Example: Complete Test

```python
import pytest
from tests.tm_test_case import TMTestCase

class TestPositionControl(TMTestCase):
    """Test position control functionality"""

    @pytest.mark.hitl_default
    def test_position_setpoint_tracking(self):
        """Test position setpoint tracking accuracy"""
        # Setup
        self.check_state(0)
        self.try_calibrate()

        # Enter position control mode
        self.tm.controller.position_mode()
        self.check_state(2)  # CL_CONTROL

        # Test multiple setpoints
        for setpoint in [0, 5000, -5000, 10000]:
            self.tm.controller.position.setpoint = setpoint

            # Wait for settling
            time.sleep(0.5)

            # Check tracking accuracy
            position = self.tm.sensors.user_frame.position_estimate
            error = abs(position - setpoint)
            self.assertLess(error, 50, f"Tracking error too high: {error} ticks")

        # Return to idle
        self.tm.controller.idle()
        self.check_state(0)

    @pytest.mark.hitl_default
    def test_position_control_velocity_limit(self):
        """Test position control respects velocity limit"""
        self.try_calibrate()

        # Set low velocity limit
        self.tm.controller.velocity.limit = 10000  # ticks/s

        # Enter position control
        self.tm.controller.position_mode()

        # Command large position change
        self.tm.controller.position.setpoint = 50000

        # Monitor velocity during motion
        time.sleep(0.1)
        velocity = self.tm.sensors.user_frame.velocity_estimate

        # Velocity should not exceed limit
        self.assertLess(abs(velocity), 11000, "Velocity limit exceeded")
```

## Safety Testing Requirements

### For Control Loop Changes

If you modify control loop code, **all** of the following tests are required:

**Timing Tests**:
- [ ] Measure `tm.scheduler.load` < 3000 cycles (at 150 MHz)
- [ ] Test at maximum load (all features enabled)
- [ ] Verify no `SCHEDULER_WARNINGS_CONTROL_BLOCK_REENTERED`

**Multi-Board Tests**:
- [ ] Test on R5.x board (high-current)
- [ ] Test on M5.x board (gimbal)
- [ ] (Optional) Test on R3.x board if available

**Multi-Motor Tests**:
- [ ] Test with high-current motor (>5A rated)
- [ ] Test with gimbal motor (<5A rated)
- [ ] Test at different voltages (12V, 24V, 48V if applicable)

**Stability Tests**:
- [ ] Monitor for oscillations (visual and audible)
- [ ] Monitor for instability during acceleration/deceleration
- [ ] Check for overheating (>10 minute run at moderate load)
- [ ] Verify no erratic behavior at startup or shutdown

**Error Handling Tests**:
- [ ] Force overcurrent → Verify IDLE transition
- [ ] Force undervoltage → Verify IDLE transition
- [ ] Trigger watchdog → Verify IDLE transition
- [ ] Check all error flags set correctly

**Code**:
```python
# Timing test
load = tm.scheduler.load
assert load < 3000, f"Control loop overrun: {load} cycles"

# Error test
tm.controller.position_mode()
# Force error condition (e.g., set unrealistic setpoint)
time.sleep(1.0)
assert tm.controller.state == 0, "Did not transition to IDLE on error"
```

### For Calibration Changes

If you modify calibration code:

**Multi-Motor Tests**:
- [ ] Test on 5+ different motors (varying R, L, pole pairs)
- [ ] Verify calibration succeeds consistently (10+ attempts per motor)
- [ ] Check measured R/L values against known specifications
- [ ] Test with noisy power supply (introduce line noise)

**Fault Detection Tests**:
- [ ] Disconnect one phase → Verify abnormal voltage detection
- [ ] Short two phases → Verify abnormal voltage detection
- [ ] Test with wrong motor type → Verify out-of-range detection
- [ ] Test with obstructed shaft → Verify pole pair detection failure

**Code**:
```python
# Calibration accuracy test
tm.controller.calibrate()
time.sleep(5)  # Wait for completion

# Check results
R = tm.motor.R
L = tm.motor.L
pole_pairs = tm.motor.pole_pairs

# Verify within expected range (example for high-current motor)
assert 0.01 < R < 1.0, f"R out of range: {R} Ω"
assert 5e-6 < L < 1e-3, f"L out of range: {L} H"
assert 1 <= pole_pairs <= 24, f"Pole pairs out of range: {pole_pairs}"
```

### For Current Limit Changes

If you modify current limits:

**Incremental Tests**:
- [ ] Gradually increase current and verify trip at 1.5× limit
- [ ] Test at different bus voltages (12V, 24V, 48V)
- [ ] Monitor for hardware damage (smoke, overheating, burnt MOSFETs)
- [ ] Verify warning flags set correctly

**Hardware Monitoring**:
- [ ] Use thermal camera or temperature probe on MOSFETs
- [ ] Monitor bus voltage for droop under load
- [ ] Check for PCB discoloration or component damage
- [ ] Inspect motor windings for overheating

## Test Environment Setup

### Hardware Setup

**Minimal Setup** (for hitl_default):
1. Tinymovr board (R5.2 or M5.1 recommended)
2. Appropriate motor (high-current or gimbal)
3. Power supply (12-48V, adequate current rating)
4. CAN interface (CANine, PCAN-USB, etc.)
5. Motor mounted securely with free shaft rotation

**Extended Setup** (for sensor-specific tests):
- External encoder (AS5047, AMT22) with SPI connection
- Hall sensor motor with 3-wire Hall connections

### Software Setup

**Python Environment**:
```bash
cd studio/Python
pip install -e .              # Install Tinymovr client
pip install pytest            # Install test framework
```

**CAN Interface Configuration**:

**Linux (socketcan)**:
```bash
sudo ip link set can0 type can bitrate 1000000
sudo ip link set up can0
```

**CANine**:
```python
from tinymovr import init_router
from tinymovr.config import get_bus_config
import can

params = get_bus_config(["canine"], bitrate=1000000)
init_router(can.Bus, params)
```

### Device Configuration

**Before Running Tests**:
```python
from tinymovr import create_device

tm = create_device(node_id=1)

# Check firmware version
print(f"Firmware: {tm.fw_version}")
print(f"Protocol hash: {tm.protocol_hash}")

# Check board info
print(f"Board: {tm.board}")

# Erase config for clean state (optional)
tm.erase_config()
tm.reset()
```

## Debugging Failed Tests

### Common Failures

**1. Device Not Found**

**Symptom**:
```
IncompatibleSpecVersionError: Device found, but incompatible
```

**Causes**:
- Protocol hash mismatch (firmware vs. Python client)
- CAN interface not configured
- Wrong node ID
- Device not powered

**Debug**:
```python
# Check protocol hash
print(f"Device hash: {tm.protocol_hash}")
print(f"Expected: 641680925")  # Current v2.3.x hash

# Check CAN bus
import can
bus = can.Bus(interface='socketcan', channel='can0', bitrate=1000000)
print(bus.recv(timeout=1.0))  # Should see heartbeat messages
```

**2. Calibration Fails**

**Symptom**:
```
AssertionError: Motor errors: 16 (ABNORMAL_CALIBRATION_VOLTAGE)
```

**Causes**:
- Motor phases not connected
- Wrong motor type for board (gimbal on R5 board)
- Power supply unstable
- Motor shaft obstructed

**Debug**:
```python
# Read calibration details
print(f"Vbus: {tm.Vbus} V")
print(f"I_cal: {tm.motor.I_cal} A")
print(f"R: {tm.motor.R} Ω")
print(f"Motor errors: {tm.motor.errors}")

# Check expected ranges (R5 board, high-current motor)
# R should be 0.01-1.0 Ω
# L should be 5-1000 μH
```

**3. Position Control Unstable**

**Symptom**: Motor oscillates around setpoint

**Causes**:
- Gains too high
- Encoder noise
- Mechanical resonance
- Current limit too low

**Debug**:
```python
# Check gains
print(f"Position gain: {tm.controller.position.gain}")
print(f"Velocity gain: {tm.controller.velocity.gain}")

# Check limits
print(f"Current limit: {tm.controller.current.Iq_limit} A")
print(f"Velocity limit: {tm.controller.velocity.limit} ticks/s")

# Monitor loop performance
print(f"Scheduler load: {tm.scheduler.load} cycles")
```

**4. Timing Overruns**

**Symptom**:
```
SCHEDULER_WARNINGS_CONTROL_BLOCK_REENTERED
```

**Causes**:
- Control loop code too slow
- Missing `TM_RAMFUNC` annotation
- Using `double` instead of `float`
- Blocking operations in control loop

**Debug**:
```python
load = tm.scheduler.load
print(f"CPU load: {load} / 7500 cycles ({load/7500*100:.1f}%)")

# Should be <3000 cycles (40%)
# >5000 cycles indicates serious problem
```

## Continuous Integration

### Test Selection for CI

**Fast Tests** (run on every commit):
```bash
pytest -m "not hitl_default and not eol"  # Simulation tests only
```

**Hardware Tests** (run on hardware testbed):
```bash
pytest -m hitl_default  # Basic HITL tests (~5 minutes)
```

**Comprehensive Tests** (run before release):
```bash
pytest -m eol  # End-of-line tests (~20 minutes)
```

### Test Reports

Generate JUnit XML for CI integration:
```bash
pytest --junitxml=test-results.xml -v
```

Generate coverage report:
```bash
pytest --cov=tinymovr --cov-report=html
```

## Best Practices

### Do's

✓ **Always calibrate first** in HITL tests (use `self.try_calibrate()`)
✓ **Use appropriate markers** (@pytest.mark.hitl_default, etc.)
✓ **Test edge cases** (limits, errors, invalid inputs)
✓ **Check for errors** after operations
✓ **Return to IDLE** at end of test
✓ **Use descriptive test names** and docstrings
✓ **Test on multiple board revisions** for firmware changes

### Don'ts

❌ **Don't skip calibration** and expect position control to work
❌ **Don't forget markers** on hardware tests (will break CI)
❌ **Don't leave motor running** after test (always call `tm.controller.idle()`)
❌ **Don't test safety-critical code** without hardware verification
❌ **Don't modify production config** in tests (use test-specific node IDs)
❌ **Don't assume motor type** (check board revision and adjust limits)

## Test Checklist for Pull Requests

Before submitting a PR:

**Code Changes**:
- [ ] Code builds without warnings
- [ ] All existing tests pass
- [ ] New tests added for new functionality
- [ ] Tests cover edge cases and error conditions

**Hardware Changes**:
- [ ] Tested on R5.x board
- [ ] Tested on M5.x board (if applicable)
- [ ] Verified `tm.scheduler.load` < 3000 cycles
- [ ] Monitored for oscillations, instability, overheating
- [ ] No scheduler warnings

**Documentation**:
- [ ] Test docstrings describe what is being tested
- [ ] SAFETY.md updated if adding safety constraints
- [ ] TESTING.md updated if adding new test patterns

## Firmware Debugging with Segger RTT

### What is RTT

Segger Real-Time Transfer (RTT) is a debug output mechanism that writes to a RAM buffer read by the J-Link probe over SWD. Unlike UART or semihosting, RTT has negligible timing overhead (~1-2 us per printf), making it suitable for instrumenting time-critical code paths without significantly disturbing the system under observation.

The RTT library is already integrated at `firmware/src/rtt/`. No additional setup is needed beyond including the header and calling the printf function.

### Choosing the Right J-Link Tool

Three J-Link tools interact with the target. They have fundamentally different behaviors that matter:

| Tool | Halts core on connect? | Supports RTT? | Supports flashing? | Use for |
|------|----------------------|---------------|--------------------|----|
| `JLinkExe` | Yes (halts, but `g` resumes and `exit` disconnects cleanly) | No | Yes | Flashing firmware |
| `JLinkRTTLogger` | **No** | Yes (file output) | No | Capturing RTT from a running target |
| `JLinkGDBServerCL` | **Yes (and stays connected)** | Yes (via RTTClient) | Yes (via GDB) | Interactive debugging with breakpoints |

**Key principle**: The GDB server maintains an active debug connection that halts the core on attach. This prevents normal firmware operation (interrupts, CAN, etc.). For RTT capture during normal operation, use `JLinkRTTLogger` which reads RTT memory through background SWD reads without halting.

The correct workflow for "observe running firmware" is:
1. Flash with `JLinkExe` (connects, flashes, resets, releases, disconnects)
2. Capture with `JLinkRTTLogger` (connects non-intrusively, reads RTT memory)

The GDB server + RTTClient combination is only appropriate when you need breakpoints or single-stepping, and you accept that the firmware's real-time behavior is disrupted.

### RTT Instrumentation Principles

**Include the header**:
```c
#include <src/rtt/SEGGER_RTT.h>
```

**Print to channel 0**:
```c
SEGGER_RTT_printf(0, "format string\n", args...);
```

**Format specifier limitations**: RTT printf supports `%d`, `%u`, `%x`, `%s` but **not `%f`**. Convert floats to scaled integers: `(int)(value * 1000.0f)`.

**Measuring execution time**: The `DWT->CYCCNT` register is the Cortex-M4 hardware cycle counter. It is reset to 0 inside `wait_for_control_loop_interrupt()` at the start of each PWM period. Reading it at any point gives elapsed cycles since the last PWM interrupt was serviced. At 150 MHz, 1 cycle = 6.67 ns, and 7500 cycles = 50 us = one PWM period.

**Minimizing observer effect**: RTT printf takes ~1-2 us per call. To avoid skewing timing measurements in tight loops, gate output to the first N iterations:
```c
if (i < 10) {
    SEGGER_RTT_printf(0, "...\n", ...);
}
```

**Always remove instrumentation before committing.** RTT calls are for transient diagnosis only.

### Device Pack and PAC5527 Registration

The PAC5527 is not in Segger's default device database. The device definition lives in `firmware/pac55xx_device_pack/`.

- `JLinkGDBServerCL` accepts `-JLinkDevicesXMLPath firmware/pac55xx_device_pack/` on the command line (this is how the VSCode cortex-debug extension works — see `.vscode/launch.json`).
- `JLinkExe` and `JLinkRTTLogger` do **not** support `-JLinkDevicesXMLPath`. They find PAC5527 via the user-level device database at `~/.config/SEGGER/JLinkDevices/`. If these tools don't recognize `PAC5527`, copy the device pack XML there:

```bash
mkdir -p ~/.config/SEGGER/JLinkDevices/Qorvo
cp firmware/pac55xx_device_pack/JLinkDevices.xml ~/.config/SEGGER/JLinkDevices/Qorvo/
```

### Flashing Firmware

```bash
JLinkExe -device PAC5527 -if SWD -speed 4000 -CommandFile /dev/stdin << 'EOF'
h
loadfile firmware/build/tinymovr_fw.elf
r
g
sleep 1000
exit
EOF
```

The `sleep 1000` gives the firmware time to boot and initialize peripherals (CAN, ADC, timers) before JLinkExe disconnects. Without it, early SWD disconnect can sometimes leave the MCU in a partial init state.

### Capturing RTT Output

```bash
JLinkRTTLogger -device PAC5527 -if SWD -speed 4000 -RTTChannel 0 /tmp/rtt_output.txt
```

This blocks in the foreground. Start it **before** triggering the firmware operation you want to observe. It scans RAM for the RTT control block, then streams data to the output file. Kill it with Ctrl-C (or `kill` the PID) when done.

If it stays stuck on "Searching for RTT Control Block...", the firmware either hasn't booted (reflash) or doesn't link the RTT library (check that `SEGGER_RTT.o` appears in the build output).

### Triggering Device Operations

With firmware running and RTT capturing, use the Python client to trigger operations:

```bash
venv/bin/python3 -c "
import can, time
from tinymovr import init_router, destroy_router
from tinymovr.config import get_bus_config, create_device
params = get_bus_config(['canine', 'slcan_disco'], bitrate=1000000)
init_router(can.Bus, params)
tm = create_device(node_id=1)
# ... trigger operation, wait, read results ...
destroy_router()
"
```

**Always use `venv/bin/python3`** (explicit path to the project venv at the repository root). The `tinymovr` package should be installed in dev mode: `venv/bin/pip install -e studio/Python`.

### J-Link Process Management

Only one process can own the J-Link USB connection at a time. Stale processes from previous sessions are the most common source of connection failures.

**Before starting any J-Link tool**, check and clean up:
```bash
pkill -f JLink          # kill all JLink processes
sleep 2                 # USB device needs time to release
```

**Symptoms of stale processes**:
- "Could not connect to J-Link" → another process holds the USB device
- "Failed to open listener port 2331" → a GDB server is still bound to the port

### Timing Reference

| Quantity | Value |
|----------|-------|
| HCLK frequency | 150 MHz |
| 1 CPU cycle | 6.67 ns |
| 1 PWM period (20 kHz) | 50 us = 7500 cycles |
| Control loop budget | <3000 cycles (<20 us, 40% utilization) |
| Flash wait states | 6 (a cache miss costs 7 cycles per fetch) |
| `DWT->CYCCNT` reset point | Inside `wait_for_control_loop_interrupt()`, after ADC interrupt serviced |

### Architectural Note: Flash Cache Sensitivity

The PAC5527 flash has 6 wait states, mitigated by a small instruction cache. Functions **not** marked `TM_RAMFUNC` run from flash and are subject to cache behavior. When binary layout shifts (from any source change, including version strings or compiler non-determinism), function addresses change, altering cache hit/miss patterns. This can cause significant and non-obvious timing variation in flash-resident code.

This matters for debugging because:
- Adding RTT instrumentation changes the binary layout, which may itself alter the behavior you're trying to observe.
- Two builds from identical source without `-frandom-seed` may produce different binaries with different timing characteristics.
- Functions in the 20 kHz control path that run from flash are fragile to layout changes. Time-critical functions should be marked `TM_RAMFUNC` to run from RAM at zero wait states.

## References

- [CONVENTIONS.md](CONVENTIONS.md) - Code style and patterns
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [SAFETY.md](SAFETY.md) - Safety-critical constraints
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution workflow
- [studio/Python/tests/tm_test_case.py](studio/Python/tests/tm_test_case.py) - Base test class

---

**Document Status**: Living document, updated as testing practices evolve.
