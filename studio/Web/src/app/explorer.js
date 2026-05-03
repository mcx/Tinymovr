// Spec explorer: one row per endpoint with type-appropriate read/set/call
// actions. Rendered fresh whenever the user focuses a different device.
import { els } from './els.js';
import { formatNum } from './polling.js';

export function buildExplorer(client) {
  const spec = client.spec;
  els.explorerSub.textContent =
    `(${spec.endpoints.length} endpoints, spec ${spec.version}, hash 0x${spec.hash_uint32.toString(16)})`;

  const tree = els.explorerTree;
  tree.innerHTML = '';
  for (const ep of spec.endpoints) {
    const row = document.createElement('div');
    row.className = 'ep-row';

    const path = document.createElement('div');
    path.className = 'path';
    const summary = ep.summary ? ` — ${ep.summary}` : '';
    path.title = (ep.summary || ep.path) + ` [#${ep.ep_id} ${ep.dtype}${ep.unit ? ` ${ep.unit}` : ''}]`;
    path.innerHTML = `<strong>${ep.path}</strong><span style="opacity:0.5">${summary}</span>`;
    row.appendChild(path);

    const kind = document.createElement('span');
    kind.className = 'kind';
    kind.textContent = ep.kind;
    row.appendChild(kind);

    const value = document.createElement('div');
    value.className = 'value';
    value.textContent = '—';
    row.appendChild(value);

    const actions = document.createElement('div');
    actions.className = 'actions';

    if (ep.get) {
      const btn = document.createElement('button');
      btn.textContent = 'read';
      btn.onclick = async () => {
        try {
          const v = await client.get(ep.path);
          value.textContent = renderValue(v, ep);
        } catch (err) { value.textContent = `err: ${err.message}`; }
      };
      actions.appendChild(btn);
    }

    if (ep.set) {
      if (ep.kind === 'enum') {
        const sel = document.createElement('select');
        sel.innerHTML = '<option value="">— set —</option>'
          + ep.options.map((o, i) => `<option value="${i}">${o}</option>`).join('');
        sel.onchange = async () => {
          if (sel.value === '') return;
          try {
            await client.set(ep.path, +sel.value);
            value.textContent = ep.options[+sel.value];
          } catch (err) { value.textContent = `err: ${err.message}`; }
          sel.value = '';
        };
        actions.appendChild(sel);
      } else if (ep.dtype === 'bool') {
        const btn0 = document.createElement('button'); btn0.textContent = 'false';
        const btn1 = document.createElement('button'); btn1.textContent = 'true';
        btn0.onclick = () => client.set(ep.path, false).then(() => value.textContent = 'false');
        btn1.onclick = () => client.set(ep.path, true).then(() => value.textContent = 'true');
        actions.appendChild(btn0); actions.appendChild(btn1);
      } else {
        const inp = document.createElement('input');
        inp.type = 'number'; inp.placeholder = 'value';
        inp.step = (ep.dtype === 'float') ? 'any' : '1';
        const btn = document.createElement('button'); btn.textContent = 'set';
        btn.onclick = async () => {
          const v = parseFloat(inp.value);
          if (!Number.isFinite(v)) return;
          try {
            await client.set(ep.path, v);
            value.textContent = renderValue(v, ep);
          } catch (err) { value.textContent = `err: ${err.message}`; }
        };
        actions.appendChild(inp); actions.appendChild(btn);
      }
    }

    if (ep.call) {
      const argsInputs = [];
      for (const a of ep.args || []) {
        const inp = document.createElement('input');
        inp.type = (a.dtype === 'bool') ? 'text' : 'number';
        inp.placeholder = `${a.name}${a.unit ? ` (${a.unit})` : ''}`;
        argsInputs.push({ inp, arg: a });
        actions.appendChild(inp);
      }
      const btn = document.createElement('button'); btn.textContent = 'call';
      btn.onclick = async () => {
        const args = argsInputs.map(({ inp, arg }) => {
          if (arg.dtype === 'bool') return inp.value === 'true' || inp.value === '1';
          return parseFloat(inp.value);
        });
        try {
          const r = await client.call(ep.path, args);
          value.textContent = ep.kind === 'func' ? renderValue(r, ep) : 'ok';
        } catch (err) { value.textContent = `err: ${err.message}`; }
      };
      actions.appendChild(btn);
    }

    row.appendChild(actions);
    tree.appendChild(row);
  }
}

export function renderValue(v, ep) {
  if (v === null || v === undefined) return '—';
  if (ep.kind === 'enum' && Number.isInteger(v)) {
    return ep.options[v] ?? String(v);
  }
  if (ep.kind === 'bitmask' && Number.isInteger(v)) {
    if (!v) return '0 (none)';
    const bits = [];
    for (let i = 0; i < (ep.flags?.length || 0); i++) {
      if ((v >> i) & 1) bits.push(ep.flags[i]);
    }
    return `${v} (${bits.join(', ')})`;
  }
  if (typeof v === 'number') {
    return ep.unit ? `${formatNum(v, 6)} ${ep.unit}` : formatNum(v, 6);
  }
  return String(v);
}
