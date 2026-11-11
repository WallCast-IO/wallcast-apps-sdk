// The simulator: hosts the app exactly like Studio and the players do (the shared
// app-host bridge), with a settings form from wallcast.json and a message sender.
import { createAppHost } from '/__wallcast/app-host.js';
import { resolveAppSettings } from '/__wallcast/app-platform.js';

const $ = (id) => document.getElementById(id);
const frame = $('frame');
const logBox = $('log');
let host = null;
let manifest = null;
let devFile = { config: {}, secrets: [] };
let values = {};
let size = { width: 1920, height: 1080 };

const log = (level, ...args) => {
  const line = document.createElement('div');
  line.className = level;
  line.textContent = `${new Date().toLocaleTimeString()}  ${args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ')}`;
  logBox.prepend(line);
};

const fit = () => {
  const stage = $('stage').getBoundingClientRect();
  const scale = Math.min((stage.width - 48) / size.width, (stage.height - 48) / size.height, 1);
  const screen = $('screen');
  screen.style.width = `${Math.round(size.width * scale)}px`;
  screen.style.height = `${Math.round(size.height * scale)}px`;
  frame.style.width = `${size.width}px`;
  frame.style.height = `${size.height}px`;
  frame.style.transform = `scale(${scale})`;
  $('size-label').textContent = `${size.width} × ${size.height} · ${Math.round(scale * 100)}%`;
};

const config = () => resolveAppSettings(manifest?.config, { app: values });

const field = (name, schema) => {
  const wrap = document.createElement('div');
  const label = document.createElement('label');
  label.textContent = schema.title || name;
  wrap.append(label);
  let input;
  if (schema['x-secret']) {
    const note = document.createElement('div');
    note.className = 'secret';
    note.textContent = devFile.secrets.includes(name) ? '•••••• (from wallcast.dev.json)' : 'Secret — put it in wallcast.dev.json → "secrets"';
    wrap.append(note);
    return wrap;
  }
  if (schema.enum) {
    input = document.createElement('select');
    schema.enum.forEach((value, index) => {
      const option = document.createElement('option');
      option.value = String(value);
      option.textContent = schema.enumNames?.[index] || String(value);
      input.append(option);
    });
  } else if (schema.type === 'boolean') {
    input = document.createElement('input');
    input.type = 'checkbox';
  } else if (schema.type === 'number' || schema.type === 'integer') {
    input = document.createElement('input');
    input.type = 'number';
    if (schema.minimum !== undefined) input.min = schema.minimum;
    if (schema.maximum !== undefined) input.max = schema.maximum;
  } else if (schema.type === 'array' || schema.type === 'object') {
    input = document.createElement('textarea');
    input.dataset.json = '1';
  } else if (schema['x-widget'] === 'textarea') {
    input = document.createElement('textarea');
  } else {
    input = document.createElement('input');
    input.type = schema.format === 'color' ? 'color' : schema.format === 'date' ? 'date' : schema.format === 'time' ? 'time' : 'text';
  }
  const current = config()[name];
  if (input.type === 'checkbox') input.checked = Boolean(current);
  else if (input.dataset.json) input.value = current === undefined ? '' : JSON.stringify(current, null, 1);
  else input.value = current ?? '';
  input.name = name;
  input.addEventListener('change', () => {
    let value = input.type === 'checkbox' ? input.checked : input.value;
    if (input.dataset.json) {
      try { value = input.value.trim() ? JSON.parse(input.value) : undefined; } catch { log('error', `${name}: not valid JSON`); return; }
    }
    values = { ...values, [name]: value };
    host?.setConfig(config());
    log('host', `settings → ${name} = ${JSON.stringify(config()[name])}`);
  });
  wrap.append(input);
  if (schema.description) {
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = schema.description;
    wrap.append(hint);
  }
  return wrap;
};

const renderSettings = () => {
  const form = $('settings');
  form.innerHTML = '';
  const props = manifest?.config?.properties || {};
  Object.entries(props).forEach(([name, schema]) => form.append(field(name, schema)));
  $('settings-hint').textContent = Object.keys(props).length
    ? 'Changes reach the app at once, like settings saved in the dashboard.'
    : 'This app has no settings ("config" in wallcast.json).';
};

const post = (path, body) => fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  .then(async (response) => {
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(json.message || 'Request failed'), { code: json.code || 'failed' });
    return json;
  });

const storageKey = (scope, key) => `wallcast.sim.${manifest?.id}.${scope}.${key}`;

const start = () => {
  host?.destroy();
  $('status').textContent = 'loading';
  $('status').className = 'badge';
  $('cover').style.opacity = 1;
  $('cover').textContent = 'Starting…';
  const started = performance.now();
  host = createAppHost({
    frame,
    expectedOrigins: ['null'],
    context: {
      mode: 'preview',
      app: { id: manifest.id, name: manifest.name, version: manifest.version, kind: manifest.kind },
      screen: {
        id: null, name: 'Simulator', width: size.width, height: size.height,
        orientation: size.height > size.width ? 'portrait' : 'landscape',
        locale: navigator.language.slice(0, 2), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, tags: [],
      },
      config: config(),
      visible: $('visible').checked,
      dataSources: Object.keys(manifest.dataSources || {}),
      permissions: manifest.permissions || [],
    },
    readyTimeoutMs: (manifest.timeouts?.readySeconds || 15) * 1000,
    pingIntervalMs: 15000,
    adapter: {
      dataFetch: (source, params) => post(`/__wallcast/data/${encodeURIComponent(source)}`, { params, config: config(), screen: { width: size.width, height: size.height } })
        .then((result) => { log('host', `data.fetch ${source} → ${result.status}`); return result; }),
      netFetch: (url, init) => post('/__wallcast/fetch', { url, init }),
      storageGet: async (scope, key) => { const raw = localStorage.getItem(storageKey(scope, key)); return raw == null ? null : JSON.parse(raw); },
      storageSet: async (scope, key, value) => { localStorage.setItem(storageKey(scope, key), JSON.stringify(value ?? null)); },
      storageRemove: async (scope, key) => { localStorage.removeItem(storageKey(scope, key)); },
      log: (level, args) => log(level, '[app]', ...args),
    },
    onReady: ({ sdk, timedOut }) => {
      $('cover').style.opacity = 0;
      $('status').textContent = sdk ? (timedOut ? 'shown (no ready() in time)' : `ready in ${Math.round(performance.now() - started)} ms`) : 'shown (no SDK)';
      $('status').className = 'badge ok';
      log('host', sdk ? 'app is ready' : 'page loaded without the SDK');
    },
    onDone: () => log('host', 'app called playback.done(): the playlist would move on'),
    onUnresponsive: () => { log('error', 'app stopped answering: reloading'); start(); },
  });
  const entry = manifest.kind === 'url' ? manifest.entry : `/app/${manifest.entry || 'index.html'}`;
  frame.src = `${entry}${entry.includes('?') ? '&' : '?'}t=${Date.now()}`;
};

const boot = async () => {
  [manifest, devFile] = await Promise.all([
    fetch('/__wallcast/manifest').then((r) => r.json()),
    fetch('/__wallcast/dev').then((r) => r.json()),
  ]);
  values = { ...(devFile.config || {}) };
  if (devFile.screen?.width && devFile.screen?.height) {
    size = { width: devFile.screen.width, height: devFile.screen.height };
    const option = [...$('size').options].find((o) => o.value === `${size.width}x${size.height}`);
    if (option) $('size').value = option.value;
  }
  document.title = `${manifest.name} · WallCast simulator`;
  $('title').textContent = manifest.name;
  $('version').textContent = `${manifest.id} ${manifest.version} · ${manifest.kind}`;
  renderSettings();
  fit();
  start();
};

$('size').addEventListener('change', () => {
  const [width, height] = $('size').value.split('x').map(Number);
  size = { width, height };
  fit();
  start();
});
$('visible').addEventListener('change', () => { host?.setVisible($('visible').checked); log('host', $('visible').checked ? 'visible' : 'hidden'); });
$('reload').addEventListener('click', () => start());
$('open').addEventListener('click', () => window.open(manifest.kind === 'url' ? manifest.entry : `/app/${manifest.entry || 'index.html'}`, '_blank'));
$('send').addEventListener('click', () => {
  let data;
  try { data = JSON.parse($('message').value || 'null'); } catch { log('error', 'The message is not valid JSON'); return; }
  host?.sendMessage(data);
  log('host', 'message →', data);
});
window.addEventListener('resize', fit);
boot().catch((error) => log('error', error.message));
