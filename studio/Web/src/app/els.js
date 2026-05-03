// Cached DOM references plus two tiny helpers for status display and
// listener replacement. Centralising these so every app module shares a
// single source of truth keeps wiring code in the rest of `src/app/`
// short and obvious.
import { $ } from '../components/base.js';

export const els = {
  status:        $('#status'),
  statusText:    $('#status .text'),
  bitrate:       $('#bitrate'),
  picker:        $('#device-picker'),
  fleet:         $('#fleet'),
  connect:       $('#connect'),
  theme:         $('#theme'),
  telemetry:     $('#telemetry'),
  telBytes:      $('#telemetry-bytes'),
  telFrames:     $('#telemetry-frames'),
  telHb:         $('#telemetry-hb'),
  emptyText:     $('#empty-text'),
  emptySub:      $('#empty-sub'),
  unsupported:   $('#unsupported'),
  empty:         $('#empty'),
  view:          $('#device-view'),
  tileView:      $('#tile-view'),
  tileGrid:      $('#tile-grid'),
  calBanner:     $('#cal-banner'),
  calStatus:     $('#cal-status'),
  vbus:          $('#m-vbus'),
  ibus:          $('#m-ibus'),
  ibusSpark:     $('#s-ibus'),
  power:         $('#m-power'),
  powerSpark:    $('#s-power'),
  temp:          $('#m-temp'),
  health:        $('#m-health'),
  ctlState:      $('#ctl-state'),
  ctlMode:       $('#ctl-mode'),
  actSave:       $('#act-save'),
  actReset:      $('#act-reset'),
  actErase:      $('#act-erase'),
  spCurrent:     $('#sp-current'),
  spVelocity:    $('#sp-velocity'),
  spPosition:    $('#sp-position'),
  mPos:          $('#m-pos'),
  sPos:          $('#s-pos'),
  mVel:          $('#m-vel'),
  sVel:          $('#s-vel'),
  mIq:           $('#m-iq'),
  sIq:           $('#s-iq'),
  plotHost:      $('#plot-host'),
  plot:          $('#plot'),
  explorerSub:   $('#explorer-sub'),
  explorerTree:  $('#explorer-tree'),
  cfgExport:     $('#cfg-export'),
  cfgImport:     $('#cfg-import'),
  cfgImportFile: $('#cfg-import-file'),
  cfgStatus:     $('#cfg-status'),
};

export function setStatus(s, text) {
  els.status.dataset.state = s;
  els.statusText.textContent = text;
}

/* Replace (rather than accumulate) an event listener on `el`. Necessary
   because bindStaticControls runs on every device focus. */
export function setListener(el, type, fn) {
  const slot = '_h_' + type;
  if (el[slot]) el.removeEventListener(type, el[slot]);
  el[slot] = fn;
  if (fn) el.addEventListener(type, fn);
}
