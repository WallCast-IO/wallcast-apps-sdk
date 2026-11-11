// The developer platform's shared contract: the app manifest (wallcast.json), the
// settings form schema, how settings merge, the CSP an app runs under, and the message
// protocol between an app and the screen (or Studio) hosting it. See the
// dev-platform contract for the reasoning.
export const APP_MANIFEST_VERSION = 1;
export const APP_BRIDGE_VERSION = 1;
export const appKinds = ['bundle', 'url', 'data'];
export const appPermissions = ['network', 'data', 'storage', 'realtime', 'location'];
export const appOrientations = ['landscape', 'portrait'];
export const appSettingScopes = ['app', 'screen', 'element'];
// Limits for an uploaded bundle (a zip). Cheap Android TV boxes download and keep it.
export const APP_BUNDLE_LIMITS = Object.freeze({
    maxZipBytes: 25 * 1024 * 1024,
    maxUnpackedBytes: 60 * 1024 * 1024,
    maxFiles: 500,
    maxFileBytes: 15 * 1024 * 1024,
    maxCompressionRatio: 100,
    maxPathLength: 200,
});
// What a bundle may contain, and the type each file is served with.
export const APP_BUNDLE_CONTENT_TYPES = Object.freeze({
    html: 'text/html; charset=utf-8',
    htm: 'text/html; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    mjs: 'text/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
    json: 'application/json; charset=utf-8',
    map: 'application/json; charset=utf-8',
    txt: 'text/plain; charset=utf-8',
    csv: 'text/csv; charset=utf-8',
    xml: 'application/xml; charset=utf-8',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
    ico: 'image/x-icon',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    otf: 'font/otf',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    wasm: 'application/wasm',
});
// The SDK file every bundle gets, so it is cached and pinned with the bundle.
export const APP_SDK_BUNDLE_PATH = '_wallcast/sdk.js';
export const APP_MANIFEST_FILE = 'wallcast.json';
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value, maximum) => {
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, maximum) : undefined;
};
const clampInt = (value, fallback, minimum, maximum) => {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric))
        return fallback;
    return Math.round(Math.min(maximum, Math.max(minimum, numeric)));
};
export const APP_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
export const APP_VERSION = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})(?:-[0-9A-Za-z.-]{1,32})?$/;
const COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const SOURCE_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,47}$/;
const CONNECTOR_NAME = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){1,3}$/;
const HEADER_NAME = /^[A-Za-z0-9-]{1,64}$/;
const BLOCKED_HEADERS = new Set(['host', 'cookie', 'content-length', 'connection', 'transfer-encoding', 'x-forwarded-for']);
const PLACEHOLDER = /\{\{\s*([a-z]+)\.([A-Za-z0-9_]+)\s*\}\}/g;
// Local development only (allowLocalhost): this machine, and 10.0.2.2, which is this
// machine as seen from an Android emulator.
const isLocalhost = (hostname) => hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '10.0.2.2' ||
    hostname.endsWith('.localhost');
/** An https origin ("https://api.example.com[:port]"), or null. */
export const normalizeAppOrigin = (value, allowLocalhost = false) => {
    if (typeof value !== 'string')
        return null;
    try {
        const url = new URL(value.trim());
        if (url.username || url.password)
            return null;
        if (url.pathname !== '/' || url.search || url.hash)
            return null;
        if (url.protocol === 'https:')
            return url.origin;
        if (url.protocol === 'http:' && allowLocalhost && isLocalhost(url.hostname))
            return url.origin;
        return null;
    }
    catch {
        return null;
    }
};
const httpsUrl = (value, allowLocalhost) => {
    if (typeof value !== 'string' || value.length > 2048)
        return null;
    try {
        const url = new URL(value.trim());
        if (url.username || url.password)
            return null;
        if (url.protocol === 'https:')
            return url.toString();
        if (url.protocol === 'http:' && allowLocalhost && isLocalhost(url.hostname))
            return url.toString();
        return null;
    }
    catch {
        return null;
    }
};
/**
 * A path inside a bundle, normalised ("./a/b.js" → "a/b.js"), or null when it could
 * escape the bundle or isn't a plain file name.
 */
export const normalizeBundlePath = (value) => {
    if (typeof value !== 'string')
        return null;
    let path = value.trim();
    if (!path || path.length > APP_BUNDLE_LIMITS.maxPathLength)
        return null;
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f\\]/.test(path))
        return null;
    if (path.startsWith('/') || /^[A-Za-z]:/.test(path))
        return null;
    while (path.startsWith('./'))
        path = path.slice(2);
    const segments = path.split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..'))
        return null;
    if (segments.some((segment) => !/^[A-Za-z0-9._@()+, ~-]+$/.test(segment)))
        return null;
    return segments.join('/');
};
export const bundleFileExtension = (path) => {
    const name = path.split('/').pop() || '';
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};
/** The type a bundle file is served with, or null when that kind of file isn't allowed. */
export const bundleContentType = (path) => APP_BUNDLE_CONTENT_TYPES[bundleFileExtension(path)] || null;
// macOS and editor clutter that zips often carry; skipped, never an error.
export const isIgnorableBundleEntry = (path) => path.startsWith('__MACOSX/') ||
    path.split('/').some((segment) => segment === '.DS_Store' || segment === 'Thumbs.db' || segment === '.git');
const placeholders = (template) => {
    const found = [];
    template.replace(PLACEHOLDER, (_match, namespace, name) => {
        found.push({ namespace, name });
        return '';
    });
    return found;
};
const fieldIssues = (field, path, depth, issues) => {
    if (!isRecord(field)) {
        issues.push({ path, message: 'A setting must be an object with a type.' });
        return null;
    }
    const type = field.type;
    if (!['string', 'number', 'integer', 'boolean', 'array', 'object'].includes(type)) {
        issues.push({ path: `${path}.type`, message: 'Use string, number, integer, boolean, array or object.' });
        return null;
    }
    const out = { type: type };
    const title = text(field.title, 80);
    const description = text(field.description, 300);
    if (title)
        out.title = title;
    if (description)
        out.description = description;
    if (Array.isArray(field.enum)) {
        const values = field.enum.filter((value) => typeof value === 'string' || typeof value === 'number').slice(0, 100);
        if (!values.length)
            issues.push({ path: `${path}.enum`, message: 'An enum needs at least one value.' });
        out.enum = values;
        if (Array.isArray(field.enumNames)) {
            out.enumNames = field.enumNames.map((name) => String(name).slice(0, 80)).slice(0, values.length);
        }
    }
    if (typeof field.format === 'string') {
        if (['color', 'uri', 'date', 'time', 'date-time'].includes(field.format)) {
            out.format = field.format;
        }
        else {
            issues.push({ path: `${path}.format`, message: `Unsupported format ${field.format}.` });
        }
    }
    for (const key of ['minimum', 'maximum', 'minLength', 'maxLength', 'maxItems']) {
        if (field[key] !== undefined) {
            if (typeof field[key] === 'number' && Number.isFinite(field[key]))
                out[key] = field[key];
            else
                issues.push({ path: `${path}.${key}`, message: `${key} must be a number.` });
        }
    }
    if (field['x-secret'] === true) {
        if (type !== 'string')
            issues.push({ path: `${path}.x-secret`, message: 'Only text settings can be secret.' });
        if (depth > 0)
            issues.push({ path: `${path}.x-secret`, message: 'Secrets must be top-level settings.' });
        out['x-secret'] = true;
    }
    if (field['x-scope'] !== undefined) {
        if (appSettingScopes.includes(field['x-scope'])) {
            out['x-scope'] = field['x-scope'];
            if (out['x-secret'] && out['x-scope'] !== 'app') {
                issues.push({ path: `${path}.x-scope`, message: 'Secrets are set once for the app, not per screen or element.' });
            }
        }
        else {
            issues.push({ path: `${path}.x-scope`, message: 'Use app, screen or element.' });
        }
    }
    if (field['x-widget'] !== undefined) {
        if (field['x-widget'] === 'textarea' || field['x-widget'] === 'media')
            out['x-widget'] = field['x-widget'];
        else
            issues.push({ path: `${path}.x-widget`, message: 'Use textarea or media.' });
    }
    if (type === 'array') {
        if (depth >= 1 || !isRecord(field.items)) {
            issues.push({ path: `${path}.items`, message: 'Lists need items and can only be top-level settings.' });
        }
        else {
            const items = fieldIssues(field.items, `${path}.items`, depth + 1, issues);
            if (items && items.type === 'array') {
                issues.push({ path: `${path}.items`, message: 'Lists of lists are not supported.' });
            }
            else if (items) {
                out.items = items;
            }
        }
    }
    if (type === 'object') {
        if (depth >= 2 || !isRecord(field.properties)) {
            issues.push({ path: `${path}.properties`, message: 'Objects need properties and can be at most two levels deep.' });
        }
        else {
            out.properties = {};
            for (const [name, child] of Object.entries(field.properties).slice(0, 20)) {
                if (!FIELD_NAME.test(name)) {
                    issues.push({ path: `${path}.properties.${name}`, message: 'Setting names use letters, digits and _.' });
                    continue;
                }
                const normalized = fieldIssues(child, `${path}.properties.${name}`, depth + 1, issues);
                if (normalized && (normalized.type === 'object' || normalized.type === 'array')) {
                    issues.push({ path: `${path}.properties.${name}`, message: 'Rows hold plain values only.' });
                }
                else if (normalized) {
                    out.properties[name] = normalized;
                }
            }
        }
    }
    if (field.default !== undefined && !out['x-secret']) {
        const coerced = coerceSettingValue(out, field.default);
        if (coerced === undefined)
            issues.push({ path: `${path}.default`, message: 'The default does not match the type.' });
        else
            out.default = coerced;
    }
    return out;
};
/** Validates the settings schema (the JSON Schema subset the dashboard form renders). */
export const validateConfigSchema = (raw, path = 'config') => {
    const issues = [];
    const schema = { type: 'object', properties: {} };
    if (raw === undefined || raw === null)
        return { schema, issues };
    if (!isRecord(raw) || (raw.type !== undefined && raw.type !== 'object')) {
        issues.push({ path, message: 'Settings must be a JSON Schema object ("type": "object").' });
        return { schema, issues };
    }
    const properties = isRecord(raw.properties) ? raw.properties : {};
    const entries = Object.entries(properties);
    if (entries.length > 50)
        issues.push({ path: `${path}.properties`, message: 'At most 50 settings.' });
    for (const [name, field] of entries.slice(0, 50)) {
        if (!FIELD_NAME.test(name)) {
            issues.push({ path: `${path}.properties.${name}`, message: 'Setting names use letters, digits and _ (up to 48).' });
            continue;
        }
        const normalized = fieldIssues(field, `${path}.properties.${name}`, 0, issues);
        if (normalized)
            schema.properties[name] = normalized;
    }
    if (Array.isArray(raw.required)) {
        const required = raw.required.filter((name) => typeof name === 'string' && name in schema.properties);
        if (required.length)
            schema.required = required;
    }
    return { schema, issues };
};
/** A value converted to a setting's type, or undefined when it can't be. */
export const coerceSettingValue = (field, value) => {
    if (value === undefined || value === null)
        return undefined;
    switch (field.type) {
        case 'string': {
            if (typeof value !== 'string' && typeof value !== 'number')
                return undefined;
            let result = String(value);
            const maximum = Math.min(field.maxLength ?? 4000, 4000);
            result = result.slice(0, maximum);
            if (field.enum && !field.enum.map(String).includes(result))
                return undefined;
            if (field.format === 'color' && result && !COLOR.test(result))
                return undefined;
            if (field.format === 'uri' && result && !httpsUrl(result, true))
                return undefined;
            return result;
        }
        case 'number':
        case 'integer': {
            let numeric = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
            if (!Number.isFinite(numeric))
                return undefined;
            if (field.type === 'integer')
                numeric = Math.round(numeric);
            if (field.minimum !== undefined)
                numeric = Math.max(field.minimum, numeric);
            if (field.maximum !== undefined)
                numeric = Math.min(field.maximum, numeric);
            if (field.enum && !field.enum.map(Number).includes(numeric))
                return undefined;
            return numeric;
        }
        case 'boolean':
            if (typeof value === 'boolean')
                return value;
            if (value === 'true')
                return true;
            if (value === 'false')
                return false;
            return undefined;
        case 'array': {
            if (!Array.isArray(value) || !field.items)
                return undefined;
            const limit = Math.min(field.maxItems ?? 100, 100);
            return value
                .slice(0, limit)
                .map((item) => coerceSettingValue(field.items, item))
                .filter((item) => item !== undefined);
        }
        case 'object': {
            if (!isRecord(value) || !field.properties)
                return undefined;
            const out = {};
            for (const [name, child] of Object.entries(field.properties)) {
                const coerced = coerceSettingValue(child, value[name]);
                if (coerced !== undefined)
                    out[name] = coerced;
            }
            return out;
        }
        default:
            return undefined;
    }
};
export const secretSettingNames = (schema) => Object.entries(schema?.properties || {})
    .filter(([, field]) => field['x-secret'] === true)
    .map(([name]) => name);
/** The defaults the manifest gives (never secrets). */
export const appSettingDefaults = (schema) => {
    const out = {};
    for (const [name, field] of Object.entries(schema?.properties || {})) {
        if (field['x-secret'] || field.default === undefined)
            continue;
        out[name] = field.default;
    }
    return out;
};
/**
 * Keeps only known settings, converted to their types. Secrets are dropped unless
 * `includeSecrets` (the API's encrypted store is the only caller that passes it).
 * An empty string removes a setting, so it falls back to the next layer.
 */
export const sanitizeAppSettings = (schema, values, options = {}) => {
    const issues = [];
    const out = {};
    if (!isRecord(values))
        return { values: out, issues };
    for (const [name, value] of Object.entries(values)) {
        const field = schema?.properties?.[name];
        if (!field) {
            issues.push({ path: name, message: `Unknown setting ${name}.` });
            continue;
        }
        if (field['x-secret'] && !options.includeSecrets) {
            issues.push({ path: name, message: `${name} is secret and is set only in the app's settings.` });
            continue;
        }
        if (value === '' || value === null || value === undefined)
            continue;
        const coerced = coerceSettingValue(field, value);
        if (coerced === undefined) {
            issues.push({ path: name, message: `${field.title || name} has the wrong kind of value.` });
            continue;
        }
        out[name] = coerced;
    }
    return { values: out, issues };
};
/**
 * What the app sees as `wallcast.config`: manifest defaults ← app settings ← element
 * settings (Studio) ← screen settings. Secrets never appear.
 */
export const resolveAppSettings = (schema, layers) => ({
    ...appSettingDefaults(schema),
    ...sanitizeAppSettings(schema, layers.app).values,
    ...sanitizeAppSettings(schema, layers.element).values,
    ...sanitizeAppSettings(schema, layers.screen).values,
});
/** Required settings that have no value in any layer (shown as "needs setup"). */
export const missingRequiredSettings = (schema, resolved, secretsSet = new Set()) => (schema?.required || []).filter((name) => schema?.properties[name]?.['x-secret'] ? !secretsSet.has(name) : resolved[name] === undefined);
const headerRecord = (value, path, issues) => {
    if (value === undefined)
        return undefined;
    if (!isRecord(value)) {
        issues.push({ path, message: 'Headers must be an object of strings.' });
        return undefined;
    }
    const out = {};
    for (const [name, headerValue] of Object.entries(value).slice(0, 20)) {
        if (!HEADER_NAME.test(name) || BLOCKED_HEADERS.has(name.toLowerCase())) {
            issues.push({ path: `${path}.${name}`, message: `Header ${name} is not allowed.` });
            continue;
        }
        if (typeof headerValue !== 'string' || headerValue.length > 2000 || /[\r\n]/.test(headerValue)) {
            issues.push({ path: `${path}.${name}`, message: 'Header values are single-line text up to 2,000 characters.' });
            continue;
        }
        out[name] = headerValue;
    }
    return out;
};
const checkPlaceholders = (template, path, schema, issues, allowParams) => {
    for (const { namespace, name } of placeholders(template)) {
        const field = schema.properties[name];
        if (namespace === 'config') {
            if (!field || field['x-secret'])
                issues.push({ path, message: `{{config.${name}}} is not a setting.` });
        }
        else if (namespace === 'secrets') {
            if (!field || !field['x-secret'])
                issues.push({ path, message: `{{secrets.${name}}} is not a secret setting.` });
        }
        else if (namespace === 'screen') {
            if (!['id', 'name', 'timezone', 'locale', 'width', 'height', 'orientation'].includes(name)) {
                issues.push({ path, message: `{{screen.${name}}} is not available.` });
            }
        }
        else if (namespace === 'params') {
            if (!allowParams)
                issues.push({ path, message: 'Params are not available here.' });
        }
        else {
            issues.push({ path, message: `Unknown placeholder {{${namespace}.${name}}}.` });
        }
    }
};
// The scheme and host must be written out: a placeholder there could send a secret anywhere.
const templateOrigin = (template, allowLocalhost) => {
    const match = /^(https?:\/\/[^/?#]+)/i.exec(template.trim());
    if (!match || match[1].includes('{{'))
        return null;
    return normalizeAppOrigin(match[1], allowLocalhost);
};
export const dataSourceOrigin = (source) => source.url ? templateOrigin(source.url, true) : null;
const dataSource = (value, path, schema, options, issues) => {
    if (!isRecord(value)) {
        issues.push({ path, message: 'A data source is an object with a url (or a connector).' });
        return null;
    }
    const out = {
        cacheSeconds: clampInt(value.cacheSeconds, 60, 0, 86400),
        timeoutMs: clampInt(value.timeoutMs, 8000, 1000, 15000),
    };
    if (typeof value.connector === 'string') {
        if (!CONNECTOR_NAME.test(value.connector)) {
            issues.push({ path: `${path}.connector`, message: 'Connector names look like "service.action".' });
            return null;
        }
        out.connector = value.connector;
        if (isRecord(value.params) && JSON.stringify(value.params).length <= 4000)
            out.params = value.params;
        return out;
    }
    const url = typeof value.url === 'string' ? value.url.trim() : '';
    if (!url || url.length > 2048 || !templateOrigin(url, Boolean(options.allowLocalhost))) {
        issues.push({ path: `${path}.url`, message: 'Use a full https:// URL whose host is written out (placeholders only after the host).' });
        return null;
    }
    out.url = url;
    checkPlaceholders(url, `${path}.url`, schema, issues, true);
    const method = String(value.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'POST')
        issues.push({ path: `${path}.method`, message: 'Use GET or POST.' });
    out.method = method === 'POST' ? 'POST' : 'GET';
    const headers = headerRecord(value.headers, `${path}.headers`, issues);
    if (headers) {
        out.headers = headers;
        Object.entries(headers).forEach(([name, header]) => checkPlaceholders(header, `${path}.headers.${name}`, schema, issues, true));
    }
    if (value.body !== undefined) {
        if (typeof value.body !== 'string' || value.body.length > 8192) {
            issues.push({ path: `${path}.body`, message: 'The body is a text template up to 8 KB.' });
        }
        else {
            out.body = value.body;
            checkPlaceholders(value.body, `${path}.body`, schema, issues, true);
        }
    }
    return out;
};
const subsetOf = (value, allowed, fallback, path, issues) => {
    if (value === undefined)
        return fallback;
    if (!Array.isArray(value)) {
        issues.push({ path, message: `Use a list of: ${allowed.join(', ')}.` });
        return fallback;
    }
    const out = [];
    for (const item of value) {
        if (allowed.includes(item)) {
            if (!out.includes(item))
                out.push(item);
        }
        else {
            issues.push({ path, message: `Unknown value ${String(item)}; use ${allowed.join(', ')}.` });
        }
    }
    return out;
};
/**
 * Validates a manifest (wallcast.json) and fills in every default. `valid: false`
 * means the upload is refused; the issues say why, with paths into the manifest.
 */
export const validateAppManifest = (raw, options = {}) => {
    const issues = [];
    if (!isRecord(raw)) {
        return { valid: false, issues: [{ path: '', message: 'The manifest must be a JSON object.' }] };
    }
    if (raw.manifestVersion !== undefined && raw.manifestVersion !== APP_MANIFEST_VERSION) {
        issues.push({ path: 'manifestVersion', message: 'Only manifestVersion 1 is supported.' });
    }
    const id = typeof raw.id === 'string' ? raw.id.trim().toLowerCase() : '';
    if (!APP_SLUG.test(id)) {
        issues.push({ path: 'id', message: 'id is 2–48 lowercase letters, digits and dashes (e.g. "kpi-board").' });
    }
    const name = text(raw.name, 80);
    if (!name)
        issues.push({ path: 'name', message: 'name is required.' });
    const version = typeof raw.version === 'string' ? raw.version.trim() : '';
    if (!APP_VERSION.test(version)) {
        issues.push({ path: 'version', message: 'version must be semver, like 1.0.0.' });
    }
    const kind = appKinds.includes(raw.kind) ? raw.kind : null;
    if (!kind)
        issues.push({ path: 'kind', message: 'kind must be bundle, url or data.' });
    let entry;
    if (kind === 'bundle') {
        entry = normalizeBundlePath(raw.entry ?? 'index.html') || undefined;
        if (!entry || !/\.html?$/i.test(entry)) {
            issues.push({ path: 'entry', message: 'entry is the HTML file in the bundle, e.g. index.html.' });
        }
        else if (options.bundlePaths && !options.bundlePaths.has(entry)) {
            issues.push({ path: 'entry', message: `The bundle has no ${entry}.` });
        }
    }
    else if (kind === 'url') {
        entry = httpsUrl(raw.entry, Boolean(options.allowLocalhost)) || undefined;
        if (!entry)
            issues.push({ path: 'entry', message: 'entry is the https:// address of the page.' });
    }
    const display = isRecord(raw.display) ? raw.display : {};
    const orientations = subsetOf(display.orientations, appOrientations, ['landscape', 'portrait'], 'display.orientations', issues);
    if (!orientations.length)
        issues.push({ path: 'display.orientations', message: 'Support at least one orientation.' });
    const sizes = [];
    if (display.sizes !== undefined) {
        if (!Array.isArray(display.sizes))
            issues.push({ path: 'display.sizes', message: 'sizes is a list of {width, height}.' });
        else {
            display.sizes.slice(0, 10).forEach((size, index) => {
                const width = isRecord(size) ? Number(size.width) : NaN;
                const height = isRecord(size) ? Number(size.height) : NaN;
                if (Number.isInteger(width) && Number.isInteger(height) && width >= 64 && height >= 64 && width <= 8192 && height <= 8192) {
                    sizes.push({ width, height });
                }
                else {
                    issues.push({ path: `display.sizes.${index}`, message: 'Sizes are whole pixels from 64 to 8192.' });
                }
            });
        }
    }
    const fit = display.fit === 'scale' ? 'scale' : 'responsive';
    if (fit === 'scale' && !sizes.length)
        issues.push({ path: 'display.fit', message: '"scale" needs display.sizes (the size it is drawn at).' });
    const background = typeof display.background === 'string' && COLOR.test(display.background) ? display.background : '#000000';
    if (display.background !== undefined && background !== display.background) {
        issues.push({ path: 'display.background', message: 'background is a hex color like #0b1020.' });
    }
    const permissions = subsetOf(raw.permissions, appPermissions, [], 'permissions', issues);
    const network = [];
    if (raw.network !== undefined) {
        if (!Array.isArray(raw.network))
            issues.push({ path: 'network', message: 'network is a list of https origins.' });
        else {
            raw.network.slice(0, 30).forEach((origin, index) => {
                if (origin === '*') {
                    if (options.allowAnyNetwork)
                        network.push('*');
                    else
                        issues.push({ path: `network.${index}`, message: '"*" is only for private apps.' });
                    return;
                }
                const normalized = normalizeAppOrigin(origin, Boolean(options.allowLocalhost));
                if (normalized) {
                    if (!network.includes(normalized))
                        network.push(normalized);
                }
                else {
                    issues.push({ path: `network.${index}`, message: 'Use origins like https://api.example.com (no path).' });
                }
            });
        }
    }
    if (network.length && !permissions.includes('network'))
        permissions.push('network');
    const { schema: config, issues: configIssues } = validateConfigSchema(raw.config);
    issues.push(...configIssues);
    const dataSources = {};
    if (raw.dataSources !== undefined) {
        if (!isRecord(raw.dataSources))
            issues.push({ path: 'dataSources', message: 'dataSources is an object of named sources.' });
        else {
            const entries = Object.entries(raw.dataSources);
            if (entries.length > 20)
                issues.push({ path: 'dataSources', message: 'At most 20 data sources.' });
            for (const [sourceName, source] of entries.slice(0, 20)) {
                if (!SOURCE_NAME.test(sourceName)) {
                    issues.push({ path: `dataSources.${sourceName}`, message: 'Source names use letters, digits, _ and - (up to 40).' });
                    continue;
                }
                const normalized = dataSource(source, `dataSources.${sourceName}`, config, options, issues);
                if (normalized)
                    dataSources[sourceName] = normalized;
            }
        }
    }
    if (Object.keys(dataSources).length && !permissions.includes('data'))
        permissions.push('data');
    const refresh = isRecord(raw.refresh) ? raw.refresh : {};
    const reloadEverySeconds = refresh.reloadEverySeconds === 0
        ? 0
        : clampInt(refresh.reloadEverySeconds, 21600, 900, 604800);
    const timeouts = isRecord(raw.timeouts) ? raw.timeouts : {};
    const playback = isRecord(raw.playback) ? raw.playback : {};
    const offline = isRecord(raw.offline) ? raw.offline : {};
    const assets = [];
    if (offline.assets !== undefined) {
        if (!Array.isArray(offline.assets))
            issues.push({ path: 'offline.assets', message: 'assets is a list of https URLs.' });
        else {
            offline.assets.slice(0, 50).forEach((asset, index) => {
                const url = httpsUrl(asset, Boolean(options.allowLocalhost));
                if (url)
                    assets.push(url);
                else
                    issues.push({ path: `offline.assets.${index}`, message: 'Use full https:// URLs.' });
            });
        }
    }
    let icon;
    if (raw.icon !== undefined) {
        icon = (kind === 'bundle' ? normalizeBundlePath(raw.icon) : httpsUrl(raw.icon, Boolean(options.allowLocalhost))) || undefined;
        if (!icon || (kind === 'bundle' && !/\.(png|jpe?g|webp|svg)$/i.test(icon))) {
            issues.push({ path: 'icon', message: kind === 'bundle' ? 'icon is a PNG, JPEG, WebP or SVG in the bundle.' : 'icon is an https URL.' });
            icon = undefined;
        }
        else if (kind === 'bundle' && options.bundlePaths && !options.bundlePaths.has(icon)) {
            issues.push({ path: 'icon', message: `The bundle has no ${icon}.` });
            icon = undefined;
        }
    }
    let feed;
    let pull;
    if (kind === 'data') {
        const result = validateConfigSchema(raw.feed, 'feed');
        issues.push(...result.issues);
        feed = result.schema;
        if (!Object.keys(feed.properties).length) {
            issues.push({ path: 'feed', message: 'A data app describes its fields in "feed" (a JSON Schema object).' });
        }
        if (raw.pull !== undefined) {
            const rawPull = isRecord(raw.pull) ? raw.pull : {};
            const url = typeof rawPull.url === 'string' ? rawPull.url.trim() : '';
            if (!url || !templateOrigin(url, Boolean(options.allowLocalhost))) {
                issues.push({ path: 'pull.url', message: 'pull.url is a full https:// URL whose host is written out.' });
            }
            else {
                checkPlaceholders(url, 'pull.url', config, issues, false);
                const headers = headerRecord(rawPull.headers, 'pull.headers', issues);
                Object.entries(headers || {}).forEach(([headerName, header]) => checkPlaceholders(header, `pull.headers.${headerName}`, config, issues, false));
                pull = { url, ...(headers ? { headers } : {}), everySeconds: clampInt(rawPull.everySeconds, 300, 60, 86400) };
            }
        }
    }
    const memory = raw.memory === 'light' || raw.memory === 'heavy' ? raw.memory : 'normal';
    const manifest = {
        manifestVersion: APP_MANIFEST_VERSION,
        id,
        name: name || id,
        version,
        kind: kind || 'bundle',
        ...(entry ? { entry } : {}),
        ...(text(raw.description, 500) ? { description: text(raw.description, 500) } : {}),
        ...(icon ? { icon } : {}),
        display: { orientations, ...(sizes.length ? { sizes } : {}), fit, background },
        permissions,
        network,
        dataSources,
        config,
        refresh: { configSeconds: clampInt(refresh.configSeconds, 60, 15, 3600), reloadEverySeconds },
        timeouts: { readySeconds: clampInt(timeouts.readySeconds, 15, 1, 60) },
        playback: { duration: playback.duration === 'app' ? 'app' : 'fixed' },
        offline: { assets, maxStaleSeconds: clampInt(offline.maxStaleSeconds, 86400, 0, 2592000) },
        memory,
        sdk: text(raw.sdk, 16) || '1',
        ...(feed ? { feed } : {}),
        ...(pull ? { pull } : {}),
    };
    return { valid: issues.length === 0, issues, manifest };
};
/**
 * Fills {{config.x}}, {{secrets.x}}, {{screen.x}} and {{params.x}} in a data-source
 * template. Values are URL-encoded in URLs and left as they are in headers and bodies.
 */
export const fillAppTemplate = (template, values, encode = 'none') => template.replace(PLACEHOLDER, (_match, namespace, name) => {
    const bag = values[namespace];
    const value = bag?.[name];
    const textValue = value === undefined || value === null
        ? ''
        : typeof value === 'object' ? JSON.stringify(value) : String(value);
    return encode === 'url' ? encodeURIComponent(textValue) : textValue.replace(/[\r\n]/g, ' ');
});
/** The Content-Security-Policy every bundle document runs under. */
export const buildAppContentSecurityPolicy = (manifest, extra = {}) => {
    const network = manifest.network.includes('*') ? ['https:'] : manifest.network;
    const remote = network.join(' ');
    const withRemote = (base) => (remote ? `${base} ${remote}` : base);
    const script = ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", extra.sdkOrigin].filter(Boolean).join(' ');
    return [
        "default-src 'self' data: blob:",
        `script-src ${script}`,
        "style-src 'self' 'unsafe-inline'",
        withRemote("img-src 'self' data: blob:"),
        withRemote("media-src 'self' data: blob:"),
        withRemote("font-src 'self' data:"),
        withRemote("connect-src 'self'"),
        `frame-src ${remote || "'none'"}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
    ].join('; ');
};
/**
 * Adds the CSP and the SDK to an HTML file of a bundle, as the first things in <head>,
 * so they apply before any of the app's own scripts run.
 */
export const injectAppHtmlHead = (html, csp, sdkSrc) => {
    const escapedCsp = csp.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const tags = `<meta http-equiv="Content-Security-Policy" content="${escapedCsp}"><script src="${sdkSrc}"></script>`;
    const head = /<head(\s[^>]*)?>/i.exec(html);
    if (head)
        return html.slice(0, head.index + head[0].length) + tags + html.slice(head.index + head[0].length);
    const htmlTag = /<html(\s[^>]*)?>/i.exec(html);
    if (htmlTag) {
        const at = htmlTag.index + htmlTag[0].length;
        return `${html.slice(0, at)}<head>${tags}</head>${html.slice(at)}`;
    }
    const doctype = /<!doctype[^>]*>/i.exec(html);
    if (doctype) {
        const at = doctype.index + doctype[0].length;
        return `${html.slice(0, at)}<head>${tags}</head>${html.slice(at)}`;
    }
    return `<head>${tags}</head>${html}`;
};
/** The host name an app version is served from on players: one origin per version. */
export const appOriginKey = (appId, versionId) => `${appId}-${versionId}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
// ---- Bridge protocol (app ⇄ host) ----
export const appBridgeRequestTypes = [
    'data.fetch',
    'net.fetch',
    'storage.get',
    'storage.set',
    'storage.remove',
    'assets.url',
    // Read text aloud (Android TextToSpeech, Web Speech elsewhere): queue calls, alerts.
    'speech.say',
];
export const appBridgeAppEvents = ['hello', 'ready', 'done', 'log', 'pong'];
export const appBridgeHostEvents = [
    'welcome',
    'config',
    'visible',
    'hidden',
    'unload',
    'message',
    'ping',
    'result',
];
export const isAppBridgeMessage = (value) => isRecord(value) && value.wc === APP_BRIDGE_VERSION && typeof value.type === 'string' && value.type.length <= 40;
export const orientationOf = (width, height) => height > width ? 'portrait' : 'landscape';
