// The host side of the app bridge, for hosts that show an app in an <iframe>: Studio,
// the dashboard, the Electron player and the SDK's dev host. Android implements the
// same protocol natively. The host never hands the app a token: it answers each
// request itself through the adapter.
import { APP_BRIDGE_VERSION, appBridgeRequestTypes, isAppBridgeMessage, } from '/__wallcast/app-platform.js';
const REQUEST_TYPES = new Set(appBridgeRequestTypes);
const STORAGE_TYPES = new Set(['storage.get', 'storage.set', 'storage.remove']);
const MAX_KEY = 128;
class Bucket {
    constructor(perSecond) {
        this.perSecond = perSecond;
        this.last = Date.now();
        this.tokens = perSecond;
    }
    take() {
        const now = Date.now();
        this.tokens = Math.min(this.perSecond, this.tokens + ((now - this.last) / 1000) * this.perSecond);
        this.last = now;
        if (this.tokens < 1)
            return false;
        this.tokens -= 1;
        return true;
    }
}
const errorOf = (error) => {
    if (error && typeof error === 'object') {
        const record = error;
        return {
            code: typeof record.code === 'string' ? record.code : 'failed',
            message: typeof record.message === 'string' ? record.message.slice(0, 300) : 'Request failed',
        };
    }
    return { code: 'failed', message: String(error || 'Request failed').slice(0, 300) };
};
export const createAppHost = (options) => {
    const win = options.win || window;
    const frame = options.frame;
    const adapter = options.adapter || {};
    const context = { ...options.context };
    const readyTimeoutMs = options.readyTimeoutMs ?? 15000;
    const noSdkGraceMs = options.noSdkGraceMs ?? 2500;
    const pingIntervalMs = options.pingIntervalMs ?? 15000;
    const maxMissedPongs = options.maxMissedPongs ?? 3;
    const fetchBucket = new Bucket(10);
    const storageBucket = new Bucket(20);
    const state = { helloed: false, ready: false, visible: context.visible, missedPongs: 0 };
    let appOrigin = null;
    let destroyed = false;
    let readyTimer = null;
    let graceTimer = null;
    let pingTimer = null;
    let awaitingPong = false;
    const originAllowed = (origin) => options.expectedOrigins.includes('*') || options.expectedOrigins.includes(origin);
    const post = (message) => {
        const target = frame.contentWindow;
        if (!target || destroyed || !state.helloed)
            return;
        // An opaque (sandboxed) origin can only be reached with "*"; the message carries
        // nothing the app isn't entitled to, and we only talk after its hello.
        const targetOrigin = !appOrigin || appOrigin === 'null' ? '*' : appOrigin;
        target.postMessage({ wc: APP_BRIDGE_VERSION, ...message }, targetOrigin);
    };
    const markReady = (info) => {
        if (state.ready)
            return;
        state.ready = true;
        if (readyTimer)
            clearTimeout(readyTimer);
        if (graceTimer)
            clearTimeout(graceTimer);
        options.onReady?.(info);
    };
    const startWatchdog = () => {
        if (pingTimer || pingIntervalMs <= 0)
            return;
        pingTimer = setInterval(() => {
            if (awaitingPong) {
                state.missedPongs += 1;
                if (state.missedPongs >= maxMissedPongs) {
                    state.missedPongs = 0;
                    awaitingPong = false;
                    options.onUnresponsive?.();
                    return;
                }
            }
            awaitingPong = true;
            post({ type: 'ping' });
        }, pingIntervalMs);
    };
    const answer = (id, run) => {
        run().then((value) => post({ type: 'result', id, payload: { ok: true, value } }), (error) => post({ type: 'result', id, payload: { ok: false, error: errorOf(error) } }));
    };
    const handleRequest = (message) => {
        const id = typeof message.id === 'string' ? message.id.slice(0, 64) : '';
        if (!id)
            return;
        const payload = (message.payload && typeof message.payload === 'object' ? message.payload : {});
        const bucket = STORAGE_TYPES.has(message.type) ? storageBucket : fetchBucket;
        if (!bucket.take()) {
            post({ type: 'result', id, payload: { ok: false, error: { code: 'rate_limited', message: 'Too many requests' } } });
            return;
        }
        const unsupported = () => Promise.reject({ code: 'unsupported', message: `${message.type} is not available here` });
        const scope = payload.scope === 'shared' ? 'shared' : 'device';
        const key = typeof payload.key === 'string' ? payload.key.slice(0, MAX_KEY) : '';
        switch (message.type) {
            case 'data.fetch':
                return answer(id, () => adapter.dataFetch
                    ? adapter.dataFetch(String(payload.source || ''), payload.params || {})
                    : unsupported());
            case 'net.fetch':
                return answer(id, () => adapter.netFetch
                    ? adapter.netFetch(String(payload.url || ''), payload.init || {})
                    : unsupported());
            case 'storage.get':
                return answer(id, () => (adapter.storageGet && key ? adapter.storageGet(scope, key) : unsupported()));
            case 'storage.set':
                return answer(id, () => (adapter.storageSet && key ? adapter.storageSet(scope, key, payload.value) : unsupported()));
            case 'storage.remove':
                return answer(id, () => (adapter.storageRemove && key ? adapter.storageRemove(scope, key) : unsupported()));
            case 'assets.url':
                return answer(id, () => adapter.assetsUrl ? adapter.assetsUrl(String(payload.url || '')) : Promise.resolve(String(payload.url || '')));
            default:
                return undefined;
        }
    };
    const onMessage = (event) => {
        if (destroyed || event.source !== frame.contentWindow)
            return;
        if (!originAllowed(event.origin))
            return;
        const message = event.data;
        if (!isAppBridgeMessage(message))
            return;
        if (message.type === 'hello') {
            appOrigin = event.origin;
            state.helloed = true;
            state.missedPongs = 0;
            awaitingPong = false;
            if (graceTimer)
                clearTimeout(graceTimer);
            post({ type: 'welcome', payload: { ...context, visible: state.visible } });
            startWatchdog();
            return;
        }
        if (!state.helloed)
            return;
        if (message.type === 'pong') {
            awaitingPong = false;
            state.missedPongs = 0;
            return;
        }
        if (message.type === 'ready')
            return markReady({ sdk: true, timedOut: false });
        if (message.type === 'done')
            return options.onDone?.();
        if (message.type === 'log') {
            const payload = (message.payload || {});
            const level = payload.level === 'warn' || payload.level === 'error' ? payload.level : 'info';
            const args = Array.isArray(payload.args) ? payload.args.slice(0, 10) : [];
            adapter.log?.(level, args);
            options.onLog?.(level, args);
            return;
        }
        if (REQUEST_TYPES.has(message.type))
            handleRequest(message);
    };
    const onFrameLoad = () => {
        // A page without the SDK never says hello: show it shortly after it loads.
        if (graceTimer)
            clearTimeout(graceTimer);
        graceTimer = setTimeout(() => {
            if (!state.helloed)
                markReady({ sdk: false, timedOut: false });
        }, noSdkGraceMs);
    };
    win.addEventListener('message', onMessage);
    frame.addEventListener('load', onFrameLoad);
    readyTimer = setTimeout(() => markReady({ sdk: state.helloed, timedOut: true }), readyTimeoutMs);
    return {
        state,
        setConfig(config) {
            context.config = config;
            post({ type: 'config', payload: { config } });
        },
        setVisible(visible) {
            if (state.visible === visible)
                return;
            state.visible = visible;
            context.visible = visible;
            post({ type: visible ? 'visible' : 'hidden' });
        },
        sendMessage(data, meta = {}) {
            post({ type: 'message', payload: { data, sentAt: new Date().toISOString(), ...meta } });
        },
        setScreen(screen) {
            context.screen = screen;
        },
        unload() {
            post({ type: 'unload' });
            return new Promise((resolve) => setTimeout(resolve, state.helloed ? 300 : 0));
        },
        destroy() {
            destroyed = true;
            win.removeEventListener('message', onMessage);
            frame.removeEventListener('load', onFrameLoad);
            if (readyTimer)
                clearTimeout(readyTimer);
            if (graceTimer)
                clearTimeout(graceTimer);
            if (pingTimer)
                clearInterval(pingTimer);
        },
    };
};
