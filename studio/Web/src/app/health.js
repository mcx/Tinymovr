// One source of truth for the channels rendered by the <tm-health> card.
// Used both at bind time (to load the spec's flag names) and at poll time
// (to publish each channel's bitmask value).
export const HEALTH_CHANNELS = [
  { key: 'sysErr',   path: 'errors',                label: 'System errors',   tone: 'bad'  },
  { key: 'sysWarn',  path: 'warnings',              label: 'System warnings', tone: 'warn' },
  { key: 'ctrlErr',  path: 'controller.errors',     label: 'Ctrl errors',     tone: 'bad'  },
  { key: 'ctrlWarn', path: 'controller.warnings',   label: 'Ctrl warnings',   tone: 'warn' },
  { key: 'motorErr', path: 'motor.errors',          label: 'Motor errors',    tone: 'bad'  },
];
