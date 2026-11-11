/*!
 * WallCast Apps SDK v__SDK_VERSION__ — window.wallcast
 * Talks to the screen (or Studio preview) hosting your app. In a normal browser tab it
 * runs in dev mode, so you can build the app without a screen.
 * Docs: https://wallcast.io/developers
 */
(function (global) {
  'use strict';
  if (global.wallcast && global.wallcast.__sdk) return;

  var VERSION = '__SDK_VERSION__';
  var BRIDGE = 1;
  var HANDSHAKE_MS = 1500;

  var listeners = {};
  var pending = {};
  var nextId = 1;
  var transport = null; // 'android' | 'frame' | 'dev'
  var welcomed = false;
  var readySent = false;
  var readyDeferred = false;
  var resolveReady;
  var readyPromise = new Promise(function (resolve) { resolveReady = resolve; });
  var devConfig = null;

  var state = {
    mode: 'dev',
    app: { id: 'dev', name: document.title || 'App', version: null, kind: 'bundle' },
    screen: {
      id: null,
      name: 'Dev browser',
      width: global.innerWidth,
      height: global.innerHeight,
      orientation: global.innerHeight > global.innerWidth ? 'portrait' : 'landscape',
      locale: (navigator.language || 'en').slice(0, 2),
      timezone: (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC',
      tags: []
    },
    config: {},
    visible: true,
    dataSources: [],
    permissions: []
  };

  function emit(type) {
    var args = Array.prototype.slice.call(arguments, 1);
    (listeners[type] || []).slice().forEach(function (fn) {
      try { fn.apply(null, args); } catch (error) { setTimeout(function () { throw error; }); }
    });
  }

  function on(type, fn) {
    (listeners[type] = listeners[type] || []).push(fn);
    return function () { off(type, fn); };
  }

  function off(type, fn) {
    listeners[type] = (listeners[type] || []).filter(function (item) { return item !== fn; });
  }

  // ---- Transport ----

  var android = global.wallcastHost && typeof global.wallcastHost.postMessage === 'function' ? global.wallcastHost : null;
  var framed = (function () { try { return global.parent && global.parent !== global; } catch (e) { return true; } })();

  function post(message) {
    message.wc = BRIDGE;
    if (transport === 'android' || (!transport && android)) {
      android.postMessage(JSON.stringify(message));
    } else if (framed) {
      global.parent.postMessage(message, '*');
    }
  }

  function receive(message) {
    if (!message || message.wc !== BRIDGE || typeof message.type !== 'string') return;
    var payload = message.payload || {};
    switch (message.type) {
      case 'welcome':
        welcomed = true;
        // A slow host can answer after dev mode started: switch back to it.
        if (transport === 'dev') transport = android ? 'android' : 'frame';
        state.mode = payload.mode || 'screen';
        state.app = payload.app || state.app;
        state.screen = payload.screen || state.screen;
        state.config = payload.config || {};
        state.visible = payload.visible !== false;
        state.dataSources = payload.dataSources || [];
        state.permissions = payload.permissions || [];
        resolveReady(context());
        emit('ready', context());
        emit('config', state.config);
        break;
      case 'config':
        state.config = payload.config || {};
        emit('config', state.config);
        break;
      case 'visible':
        state.visible = true;
        emit('visible');
        break;
      case 'hidden':
        state.visible = false;
        emit('hidden');
        break;
      case 'unload':
        emit('unload');
        break;
      case 'message':
        emit('message', payload.data, { sentAt: payload.sentAt || null });
        break;
      case 'ping':
        post({ type: 'pong' });
        break;
      case 'result': {
        var entry = pending[message.id];
        if (!entry) return;
        delete pending[message.id];
        clearTimeout(entry.timer);
        if (payload.ok) entry.resolve(payload.value);
        else {
          var error = new Error((payload.error && payload.error.message) || 'Request failed');
          error.code = (payload.error && payload.error.code) || 'failed';
          entry.reject(error);
        }
        break;
      }
      default:
        break;
    }
  }

  if (android) {
    transport = 'android';
    var onAndroid = function (event) {
      var data = event && event.data;
      try { receive(typeof data === 'string' ? JSON.parse(data) : data); } catch (e) { /* not ours */ }
    };
    if (typeof android.addEventListener === 'function') android.addEventListener('message', onAndroid);
    else android.onmessage = onAndroid;
  } else if (framed) {
    transport = 'frame';
    global.addEventListener('message', function (event) {
      if (event.source !== global.parent) return;
      receive(event.data);
    });
  }

  function request(type, payload, timeoutMs) {
    if (transport === 'dev') return devRequest(type, payload || {});
    return readyPromise.then(function () {
      if (transport === 'dev') return devRequest(type, payload || {});
      return new Promise(function (resolve, reject) {
        var id = 'r' + nextId++;
        pending[id] = {
          resolve: resolve,
          reject: reject,
          timer: setTimeout(function () {
            delete pending[id];
            var error = new Error(type + ' timed out');
            error.code = 'timeout';
            reject(error);
          }, timeoutMs || 20000)
        };
        post({ type: type, id: id, payload: payload || {} });
      });
    });
  }

  // ---- Dev mode (a normal browser tab) ----

  function devStorage() {
    try { return global.localStorage; } catch (e) { return null; }
  }

  function fill(template, values, encode) {
    return String(template).replace(/\{\{\s*([a-z]+)\.([A-Za-z0-9_]+)\s*\}\}/g, function (_m, ns, name) {
      var bag = values[ns] || {};
      var value = bag[name] == null ? '' : typeof bag[name] === 'object' ? JSON.stringify(bag[name]) : String(bag[name]);
      return encode ? encodeURIComponent(value) : value;
    });
  }

  function devRequest(type, payload) {
    var store = devStorage();
    var prefix = 'wallcast.dev.' + (payload.scope === 'shared' ? 'shared.' : '');
    switch (type) {
      case 'storage.get': {
        var raw = store && store.getItem(prefix + payload.key);
        return Promise.resolve(raw == null ? null : JSON.parse(raw));
      }
      case 'storage.set':
        if (store) store.setItem(prefix + payload.key, JSON.stringify(payload.value === undefined ? null : payload.value));
        return Promise.resolve();
      case 'storage.remove':
        if (store) store.removeItem(prefix + payload.key);
        return Promise.resolve();
      case 'assets.url':
        return Promise.resolve(payload.url);
      case 'speech.say':
        return speakInBrowser(payload.text, payload.options || {});
      case 'net.fetch':
        return fetch(payload.url, payload.init || {}).then(responseToPlain);
      case 'data.fetch': {
        // `wallcast-app dev` answers data sources itself (secrets from wallcast.dev.json).
        return fetch('/__wallcast/data/' + encodeURIComponent(payload.source), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ params: payload.params || {}, config: state.config })
        }).then(function (response) {
          if (response.status === 404 && devConfig && devConfig.manifest) return directDataFetch(payload);
          return response.json().then(function (body) {
            if (!response.ok) {
              var error = new Error((body && body.message) || 'Data source failed');
              error.code = (body && body.code) || 'failed';
              throw error;
            }
            return body;
          });
        }, function () { return directDataFetch(payload); });
      }
      default:
        return Promise.reject(new Error(type + ' is not available in dev mode'));
    }
  }

  function speakInBrowser(text, options) {
    return new Promise(function (resolve, reject) {
      if (!global.speechSynthesis || !global.SpeechSynthesisUtterance) {
        var error = new Error('Speech is not available here');
        error.code = 'unsupported';
        return reject(error);
      }
      var utterance = new SpeechSynthesisUtterance(String(text));
      if (options.lang) utterance.lang = options.lang;
      if (typeof options.volume === 'number') utterance.volume = options.volume;
      if (typeof options.rate === 'number') utterance.rate = options.rate;
      utterance.onend = function () { resolve(); };
      utterance.onerror = function () { resolve(); };
      global.speechSynthesis.speak(utterance);
    });
  }

  function directDataFetch(payload) {
    var source = devConfig && devConfig.manifest && devConfig.manifest.dataSources && devConfig.manifest.dataSources[payload.source];
    if (!source || !source.url) return Promise.reject(new Error('Unknown data source ' + payload.source));
    var values = { config: state.config, secrets: (devConfig && devConfig.secrets) || {}, screen: state.screen, params: payload.params || {} };
    var headers = {};
    Object.keys(source.headers || {}).forEach(function (name) { headers[name] = fill(source.headers[name], values); });
    return fetch(fill(source.url, values, true), { method: source.method || 'GET', headers: headers, body: source.body ? fill(source.body, values) : undefined })
      .then(responseToPlain)
      .then(function (plain) { return { status: plain.status, contentType: plain.headers['content-type'] || '', body: plain.body, fetchedAt: new Date().toISOString(), stale: false }; });
  }

  function responseToPlain(response) {
    var type = response.headers.get('content-type') || '';
    var reader = /json/i.test(type) ? response.json() : response.text();
    return reader.then(function (body) {
      return { status: response.status, headers: { 'content-type': type }, body: body };
    });
  }

  function loadDevConfig() {
    var params = new URLSearchParams(global.location.search);
    var inline = params.get('config');
    var fromQuery = null;
    if (inline) { try { fromQuery = JSON.parse(inline); } catch (e) { /* ignore */ } }
    var manifest = fetch('wallcast.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }, function () { return null; });
    var dev = fetch('wallcast.dev.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }, function () { return null; });
    return Promise.all([manifest, dev]).then(function (results) {
      var man = results[0] || {};
      var file = results[1] || {};
      var defaults = {};
      var props = (man.config && man.config.properties) || {};
      Object.keys(props).forEach(function (name) {
        if (props[name].default !== undefined && !props[name]['x-secret']) defaults[name] = props[name].default;
      });
      devConfig = { manifest: man, secrets: file.secrets || {} };
      state.app = { id: man.id || 'dev', name: man.name || state.app.name, version: man.version || null, kind: man.kind || 'bundle' };
      state.config = Object.assign({}, defaults, file.config || {}, fromQuery || {});
      if (file.screen) Object.assign(state.screen, file.screen);
      state.dataSources = Object.keys(man.dataSources || {});
      state.permissions = man.permissions || [];
    });
  }

  function enterDevMode() {
    if (welcomed || transport === 'android') return;
    transport = 'dev';
    state.mode = 'dev';
    loadDevConfig().then(function () {
      if (welcomed) return;
      resolveReady(context());
      emit('ready', context());
      emit('config', state.config);
      if (global.console && console.info) {
        console.info('[wallcast] dev mode: no screen host found. Settings come from wallcast.json defaults and wallcast.dev.json. Try wallcast.dev.emit("message", {...}).');
      }
    });
  }

  function context() {
    return {
      mode: state.mode,
      app: state.app,
      screen: state.screen,
      config: state.config,
      visible: state.visible
    };
  }

  // ---- Public API ----

  var wallcast = {
    __sdk: true,
    version: VERSION,
    ready: function () { return readyPromise; },
    on: on,
    off: off,
    once: function (type, fn) {
      var stop = on(type, function () { stop(); fn.apply(null, arguments); });
      return stop;
    },
    data: {
      /** A data source from the manifest, fetched by WallCast (secrets filled in on the server). */
      fetch: function (source, params) {
        return request('data.fetch', { source: String(source), params: params || {} });
      }
    },
    /** The CORS proxy for origins in the manifest's "network" list. */
    fetch: function (url, init) {
      init = init || {};
      return request('net.fetch', {
        url: String(url),
        init: { method: init.method || 'GET', headers: init.headers || {}, body: init.body }
      }).then(function (result) {
        return {
          ok: result.status >= 200 && result.status < 300,
          status: result.status,
          headers: result.headers || {},
          body: result.body,
          json: function () { return Promise.resolve(typeof result.body === 'string' ? JSON.parse(result.body) : result.body); },
          text: function () { return Promise.resolve(typeof result.body === 'string' ? result.body : JSON.stringify(result.body)); }
        };
      });
    },
    storage: {
      get: function (key) { return request('storage.get', { scope: 'device', key: String(key) }); },
      set: function (key, value) { return request('storage.set', { scope: 'device', key: String(key), value: value }); },
      remove: function (key) { return request('storage.remove', { scope: 'device', key: String(key) }); },
      shared: {
        get: function (key) {
          return request('storage.get', { scope: 'shared', key: String(key) }).then(function (result) {
            return result && typeof result === 'object' && 'value' in result ? result.value : result;
          });
        },
        set: function (key, value) { return request('storage.set', { scope: 'shared', key: String(key), value: value }); },
        remove: function (key) { return request('storage.remove', { scope: 'shared', key: String(key) }); }
      }
    },
    assets: {
      url: function (url) { return request('assets.url', { url: String(url) }); }
    },
    speech: {
      /** Read text aloud on the screen: say('Number A15, counter 3', { lang: 'en', volume: 1, rate: 1 }). */
      say: function (text, options) { return request('speech.say', { text: String(text), options: options || {} }); }
    },
    playback: {
      /** Tell the screen the first frame is drawn, so it shows the app. */
      ready: function () {
        if (readySent) return;
        readySent = true;
        readyPromise.then(function () { if (transport !== 'dev') post({ type: 'ready' }); });
      },
      /** Call before the page finishes loading to send ready() yourself (e.g. after data arrives). */
      deferReady: function () { readyDeferred = true; },
      /** For "playback": { "duration": "app" }: move the playlist on. */
      done: function () { readyPromise.then(function () { if (transport !== 'dev') post({ type: 'done' }); else emit('done'); }); }
    },
    log: {
      info: function () { log('info', arguments); },
      warn: function () { log('warn', arguments); },
      error: function () { log('error', arguments); }
    },
    dev: {
      /** Simulate host events in dev mode: dev.emit('message', {...}), dev.emit('config', {...}). */
      emit: function (type, data) {
        if (type === 'config') { state.config = Object.assign({}, state.config, data || {}); emit('config', state.config); }
        else if (type === 'visible' || type === 'hidden') { state.visible = type === 'visible'; emit(type); }
        else emit(type, data, { sentAt: new Date().toISOString() });
      },
      setVisible: function (visible) { wallcast.dev.emit(visible ? 'visible' : 'hidden'); }
    }
  };

  ['mode', 'app', 'screen', 'config'].forEach(function (name) {
    Object.defineProperty(wallcast, name, { enumerable: true, get: function () { return state[name]; } });
  });
  Object.defineProperty(wallcast.playback, 'visible', { enumerable: true, get: function () { return state.visible; } });

  function log(level, args) {
    var list = Array.prototype.slice.call(args).map(function (value) {
      if (value instanceof Error) return value.stack || value.message;
      try { return typeof value === 'string' ? value : JSON.parse(JSON.stringify(value)); } catch (e) { return String(value); }
    });
    if (global.console && console[level]) console[level].apply(console, ['[app]'].concat(list));
    if (transport && transport !== 'dev') readyPromise.then(function () { post({ type: 'log', payload: { level: level, args: list.slice(0, 10) } }); });
  }

  global.wallcast = wallcast;

  // Handshake. A host answers at once; nobody answering means a normal browser tab.
  if (transport) post({ type: 'hello', payload: { sdk: VERSION, manifestVersion: 1 } });
  if (transport === 'frame') setTimeout(enterDevMode, HANDSHAKE_MS);
  else if (!transport) setTimeout(enterDevMode, 0);

  // Unless the app asked to say ready itself, it is ready once the page has loaded.
  global.addEventListener('load', function () {
    setTimeout(function () { if (!readyDeferred) wallcast.playback.ready(); }, 50);
  });
})(typeof window !== 'undefined' ? window : this);
