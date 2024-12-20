/*
* This file was automatically generated using Avlos.
* https://github.com/tinymovr/avlos
*
* Any changes to this file will be overwritten when
* content is regenerated.
*/

#pragma once

typedef enum
{
    AVLOS_RET_NOACTION,
    AVLOS_RET_READ = 1,
    AVLOS_RET_WRITE = 2,
    AVLOS_RET_CALL = 3
} Avlos_Return;

typedef enum
{
    AVLOS_CMD_WRITE,
    AVLOS_CMD_READ = 1
} Avlos_Command;

typedef enum
{
    ERRORS_NONE = 0,
    ERRORS_UNDERVOLTAGE = (1 << 0)
} errors_flags;

typedef enum
{
    WARNINGS_NONE = 0,
    WARNINGS_DRIVER_FAULT = (1 << 0), 
    WARNINGS_CHARGE_PUMP_FAULT_STAT = (1 << 1), 
    WARNINGS_CHARGE_PUMP_FAULT = (1 << 2), 
    WARNINGS_DRV10_DISABLE = (1 << 3), 
    WARNINGS_DRV32_DISABLE = (1 << 4), 
    WARNINGS_DRV54_DISABLE = (1 << 5)
} warnings_flags;

typedef enum
{
    SCHEDULER_WARNINGS_NONE = 0,
    SCHEDULER_WARNINGS_CONTROL_BLOCK_REENTERED = (1 << 0)
} scheduler_warnings_flags;

typedef enum
{
    CONTROLLER_WARNINGS_NONE = 0,
    CONTROLLER_WARNINGS_VELOCITY_LIMITED = (1 << 0), 
    CONTROLLER_WARNINGS_CURRENT_LIMITED = (1 << 1), 
    CONTROLLER_WARNINGS_MODULATION_LIMITED = (1 << 2)
} controller_warnings_flags;

typedef enum
{
    CONTROLLER_ERRORS_NONE = 0,
    CONTROLLER_ERRORS_CURRENT_LIMIT_EXCEEDED = (1 << 0), 
    CONTROLLER_ERRORS_PRE_CL_I_SD_EXCEEDED = (1 << 1)
} controller_errors_flags;

typedef enum
{
    MOTOR_ERRORS_NONE = 0,
    MOTOR_ERRORS_PHASE_RESISTANCE_OUT_OF_RANGE = (1 << 0), 
    MOTOR_ERRORS_PHASE_INDUCTANCE_OUT_OF_RANGE = (1 << 1), 
    MOTOR_ERRORS_POLE_PAIRS_CALCULATION_DID_NOT_CONVERGE = (1 << 2), 
    MOTOR_ERRORS_POLE_PAIRS_OUT_OF_RANGE = (1 << 3), 
    MOTOR_ERRORS_ABNORMAL_CALIBRATION_VOLTAGE = (1 << 4)
} motor_errors_flags;

typedef enum
{
    SENSORS_SETUP_ONBOARD_ERRORS_NONE = 0,
    SENSORS_SETUP_ONBOARD_ERRORS_CALIBRATION_FAILED = (1 << 0), 
    SENSORS_SETUP_ONBOARD_ERRORS_READING_UNSTABLE = (1 << 1)
} sensors_setup_onboard_errors_flags;

typedef enum
{
    SENSORS_SETUP_EXTERNAL_SPI_ERRORS_NONE = 0,
    SENSORS_SETUP_EXTERNAL_SPI_ERRORS_CALIBRATION_FAILED = (1 << 0), 
    SENSORS_SETUP_EXTERNAL_SPI_ERRORS_READING_UNSTABLE = (1 << 1)
} sensors_setup_external_spi_errors_flags;

typedef enum
{
    SENSORS_SETUP_HALL_ERRORS_NONE = 0,
    SENSORS_SETUP_HALL_ERRORS_CALIBRATION_FAILED = (1 << 0), 
    SENSORS_SETUP_HALL_ERRORS_READING_UNSTABLE = (1 << 1)
} sensors_setup_hall_errors_flags;

typedef enum
{
    TRAJ_PLANNER_ERRORS_NONE = 0,
    TRAJ_PLANNER_ERRORS_INVALID_INPUT = (1 << 0), 
    TRAJ_PLANNER_ERRORS_VCRUISE_OVER_LIMIT = (1 << 1)
} traj_planner_errors_flags;

typedef enum
{
    HOMING_WARNINGS_NONE = 0,
    HOMING_WARNINGS_HOMING_TIMEOUT = (1 << 0)
} homing_warnings_flags;

typedef enum
{
    CONTROLLER_STATE_IDLE = 0,
    CONTROLLER_STATE_CALIBRATE = 1,
    CONTROLLER_STATE_CL_CONTROL = 2,
    CONTROLLER_STATE__MAX
} controller_state_options;

typedef enum
{
    CONTROLLER_MODE_CURRENT = 0,
    CONTROLLER_MODE_VELOCITY = 1,
    CONTROLLER_MODE_POSITION = 2,
    CONTROLLER_MODE_TRAJECTORY = 3,
    CONTROLLER_MODE_HOMING = 4,
    CONTROLLER_MODE__MAX
} controller_mode_options;

typedef enum
{
    MOTOR_TYPE_HIGH_CURRENT = 0,
    MOTOR_TYPE_GIMBAL = 1,
    MOTOR_TYPE__MAX
} motor_type_options;

typedef enum
{
    SENSORS_SETUP_EXTERNAL_SPI_TYPE_MA7XX = 0,
    SENSORS_SETUP_EXTERNAL_SPI_TYPE_AS5047 = 1,
    SENSORS_SETUP_EXTERNAL_SPI_TYPE_AMT22 = 2,
    SENSORS_SETUP_EXTERNAL_SPI_TYPE__MAX
} sensors_setup_external_spi_type_options;

typedef enum
{
    SENSORS_SETUP_EXTERNAL_SPI_RATE_1_5Mbps = 0,
    SENSORS_SETUP_EXTERNAL_SPI_RATE_3Mbps = 1,
    SENSORS_SETUP_EXTERNAL_SPI_RATE_6Mbps = 2,
    SENSORS_SETUP_EXTERNAL_SPI_RATE_8Mbps = 3,
    SENSORS_SETUP_EXTERNAL_SPI_RATE_12Mbps = 4,
    SENSORS_SETUP_EXTERNAL_SPI_RATE__MAX
} sensors_setup_external_spi_rate_options;

typedef enum
{
    SENSORS_SELECT_POSITION_SENSOR_CONNECTION_ONBOARD = 0,
    SENSORS_SELECT_POSITION_SENSOR_CONNECTION_EXTERNAL_SPI = 1,
    SENSORS_SELECT_POSITION_SENSOR_CONNECTION_HALL = 2,
    SENSORS_SELECT_POSITION_SENSOR_CONNECTION__MAX
} sensors_select_position_sensor_connection_options;

typedef enum
{
    SENSORS_SELECT_COMMUTATION_SENSOR_CONNECTION_ONBOARD = 0,
    SENSORS_SELECT_COMMUTATION_SENSOR_CONNECTION_EXTERNAL_SPI = 1,
    SENSORS_SELECT_COMMUTATION_SENSOR_CONNECTION_HALL = 2,
    SENSORS_SELECT_COMMUTATION_SENSOR_CONNECTION__MAX
} sensors_select_commutation_sensor_connection_options;
