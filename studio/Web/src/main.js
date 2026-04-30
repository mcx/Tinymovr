// Tinymovr Web Dashboard entry point.
// Order matters: styles first, then components register their custom
// elements (side-effect imports), then boot() wires the page to the
// runtime once the DOM is ready.
import '@fontsource/anonymous-pro/400.css';
import '@fontsource/anonymous-pro/700.css';
import './styles.css';

import './components/dash-card.js';
import './components/dash-stat.js';
import './components/dash-sparkline.js';
import './components/dash-gauge.js';
import './components/dash-plot.js';
import './components/tm-state-buttons.js';
import './components/tm-setpoint.js';
import './components/tm-health.js';
import './components/tm-device-tile.js';
import './components/tm-bus-tile.js';

import { boot } from './app/boot.js';

boot();
