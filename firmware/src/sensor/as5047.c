
//  * This file is part of the Tinymovr-Firmware distribution
//  * (https://github.com/yconst/tinymovr-firmware).
//  * Copyright (c) 2020-2023 Ioannis Chatzikonstantinou.
//  * 
//  * This program is free software: you can redistribute it and/or modify  
//  * it under the terms of the GNU General Public License as published by  
//  * the Free Software Foundation, version 3.
//  *
//  * This program is distributed in the hope that it will be useful, but 
//  * WITHOUT ANY WARRANTY; without even the implied warranty of 
//  * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU 
//  * General Public License for more details.
//  *
//  * You should have received a copy of the GNU General Public License 
//  * along with this program. If not, see <http://www.gnu.org/licenses/>.

#include <string.h>
#include <src/system/system.h>
#include <src/utils/utils.h>
#include <src/can/can_endpoints.h>
#include <src/sensor/sensor.h>
#include <src/observer/observer.h>
#include <src/sensor/as5047.h>

bool as5047p_init_with_port(Sensor *s, const SSP_TYPE port, PAC55XX_SSP_TYPEDEF *ssp_struct) {
    AS5047PSensorConfig c = {0};
    c.ssp_port = port;
    c.ssp_struct = ssp_struct;
    return as5047p_init_with_config(s, &c);
}

bool as5047p_init_with_config(Sensor *s, const AS5047PSensorConfig *c) {
    AS5047PSensor *as = (AS5047PSensor *)s;
    as->base.get_raw_angle_func = ma7xx_get_raw_angle;
    as->base.update_func = as5047p_update; 
    as->base.prepare_func = as5047p_send_angle_cmd; 
    as->base.reset_func = as5047p_reset; 
    as->base.deinit_func = as5047p_deinit; 
    as->base.get_errors_func = as5047p_get_errors; 
    as->base.is_calibrated_func = as5047p_is_calibrated; 
    as->base.calibrate_func = as5047p_calibrate; 
    as->base.config.type = SENSOR_TYPE_AS5047;
    as->config = *c;
    ssp_init(as->config.ssp_port, SSP_MS_MASTER, 0, 0);
    delay_us(10000); // Example delay, adjust based on AS5047P datasheet

    as5047p_send_angle_cmd(s); 
    as5047p_update(s, false); 

    return true;
}

void as5047p_deinit(Sensor *s)
{
    ssp_deinit(((AS5047PSensor *)s)->config.ssp_port);
}

void as5047p_reset(Sensor *s)
{
    sensor_reset(s);
}

bool as5047p_calibrate(Sensor *s, Observer *o)
{
    return sensor_calibrate_direction_and_pole_pair_count(s, o) && sensor_calibrate_offset_and_rectification(s, o);
}
