#!/usr/bin/env node
// wallcast-app: build WallCast screen apps.
//   wallcast-app init <folder>             start a new app from the starter
//   wallcast-app dev [folder] [--port N]   run it in a screen simulator with a settings form
//   wallcast-app validate [folder]         check wallcast.json and the files
//   wallcast-app pack [folder] [-o x.zip]  make the zip the dashboard uploads
//   wallcast-app deploy [folder] [--publish] [--api URL]   upload with WALLCAST_API_KEY
import { createServer } from 'node:http';
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';
import {
  APP_BUNDLE_LIMITS,
  APP_MANIFEST_FILE,
  buildAppContentSecurityPolicy,
  bundleContentType,
  fillAppTemplate,
  injectAppHtmlHead,
  isIgnorableBundleEntry,
  normalizeBundlePath,
  validateAppManifest,
} from '../lib/app-platform.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const command = args[0];
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index > 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : fallback;
};
const has = (name) => args.includes(name);
const positional = args.slice(1).filter((arg, index, list) => !arg.startsWith('-') && !(index > 0 && list[index - 1].startsWith('-') && !['--publish'].includes(list[index - 1])));
const appDir = resolve(positional[0] || '.');

const color = (code) => (text) => (process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text);
const red = color(31);
const green = color(32);
const dim = color(2);

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

// Never part of the bundle; add your own lines (a file, or a folder ending in /) to .wallcastignore.
const DEFAULT_IGNORE = ['node_modules/', '.git/', '.github/', '.gitignore', '.vscode/', 'wallcast.dev.json', '.wallcastignore', 'package.json', 'package-lock.json', 'README.md', 'LICENSE', '.env', '.DS_Store'];

const ignoreList = (dir) => {
  const file = join(dir, '.wallcastignore');
  const own = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')) : [];
  return [...DEFAULT_IGNORE, ...own];
};

const listFiles = (dir) => {
  const out = [];
  const ignore = ignoreList(dir);
  const ignored = (rel, isDir) => ignore.some((rule) => (rule.endsWith('/') ? (isDir ? `${rel}/` : rel).startsWith(rule) : rel === rule || rel.endsWith(`/${rule}`)));
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      const rel = relative(dir, full).split(sep).join('/');
      const isDir = statSync(full).isDirectory();
      if (ignored(rel, isDir) || name.endsWith('.zip')) continue;
      if (isDir) walk(full);
      else if (!isIgnorableBundleEntry(rel)) out.push(rel);
    }
  };
  walk(dir);
  return out.sort();
};

const check = (dir) => {
  const manifestPath = join(dir, APP_MANIFEST_FILE);
  if (!existsSync(manifestPath)) return { ok: false, problems: [`No ${APP_MANIFEST_FILE} in ${dir}`], files: [] };
  let raw;
  try {
    raw = readJson(manifestPath);
  } catch (error) {
    return { ok: false, problems: [`${APP_MANIFEST_FILE} is not valid JSON: ${error.message}`], files: [] };
  }
  const files = raw.kind === 'bundle' || !raw.kind ? listFiles(dir) : [];
  const problems = [];
  let total = 0;
  for (const file of files) {
    if (!normalizeBundlePath(file)) problems.push(`${file}: file name not allowed`);
    else if (!bundleContentType(file)) problems.push(`${file}: this kind of file can't be part of an app`);
    const size = statSync(join(dir, file)).size;
    total += size;
    if (size > APP_BUNDLE_LIMITS.maxFileBytes) problems.push(`${file}: larger than 15 MB`);
  }
  if (files.length > APP_BUNDLE_LIMITS.maxFiles) problems.push(`More than ${APP_BUNDLE_LIMITS.maxFiles} files`);
  if (total > APP_BUNDLE_LIMITS.maxUnpackedBytes) problems.push('More than 60 MB of files');
  const result = validateAppManifest(raw, { allowLocalhost: true, allowAnyNetwork: true, bundlePaths: raw.kind === 'bundle' ? new Set(files) : undefined });
  for (const issue of result.issues) problems.push(`${APP_MANIFEST_FILE} ${issue.path ? `${issue.path}: ` : ''}${issue.message}`);
  return { ok: problems.length === 0, problems, manifest: result.manifest, files, total };
};

// ---- zip (store + deflate), enough for bundles ----
const makeZip = (dir, files) => {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const path of files) {
    const data = readFileSync(join(dir, path));
    const packed = deflateRawSync(data, { level: 9 });
    const useDeflate = packed.length < data.length;
    const body = useDeflate ? packed : data;
    const name = Buffer.from(path, 'utf8');
    const crc = crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    centrals.push(central, name);
    offset += 30 + name.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
};

const fail = (problems) => {
  console.error(red('✗ The app has problems:'));
  for (const problem of problems) console.error(`  • ${problem}`);
  process.exit(1);
};

// ---- commands ----

const init = () => {
  const target = resolve(positional[0] || 'my-wallcast-app');
  if (existsSync(target) && readdirSync(target).length) fail([`${target} is not empty`]);
  cpSync(join(root, 'templates/starter'), target, { recursive: true });
  const id = basename(target).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'my-app';
  const manifestPath = join(target, APP_MANIFEST_FILE);
  const manifest = readJson(manifestPath);
  manifest.id = id;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const pkgPath = join(target, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = readJson(pkgPath);
    pkg.name = id;
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
  console.log(green(`✓ Created ${target}`));
  console.log(`  cd ${relative(process.cwd(), target) || '.'}`);
  console.log('  npm install          # installs wallcast-app in the project');
  console.log('  npx wallcast-app dev # screen simulator');
};

const validate = () => {
  const result = check(appDir);
  if (!result.ok) fail(result.problems);
  console.log(green(`✓ ${result.manifest.name} ${result.manifest.version} (${result.manifest.kind}) is valid`) +
    dim(result.files.length ? `  ${result.files.length} files, ${Math.round(result.total / 1024)} KB` : ''));
};

const pack = () => {
  const result = check(appDir);
  if (!result.ok) fail(result.problems);
  if (result.manifest.kind !== 'bundle') fail(['Only bundle apps are zipped; url and data apps are saved from their manifest.']);
  const out = resolve(flag('-o', flag('--out', `${result.manifest.id}-${result.manifest.version}.zip`)));
  const zip = makeZip(appDir, result.files.filter((file) => resolve(appDir, file) !== out));
  if (zip.length > APP_BUNDLE_LIMITS.maxZipBytes) fail(['The zip is larger than 25 MB']);
  writeFileSync(out, zip);
  console.log(green(`✓ ${relative(process.cwd(), out)}`) + dim(`  ${Math.round(zip.length / 1024)} KB — upload it in Developers → Apps, or run wallcast-app deploy`));
  return out;
};

const deploy = async () => {
  const key = process.env.WALLCAST_API_KEY;
  if (!key) fail(['Set WALLCAST_API_KEY (Developers → API keys, with the apps:write permission).']);
  const api = (flag('--api', process.env.WALLCAST_API_URL || 'https://api.wallcast.io')).replace(/\/+$/, '');
  const result = check(appDir);
  if (!result.ok) fail(result.problems);
  let response;
  if (result.manifest.kind === 'bundle') {
    const zip = makeZip(appDir, result.files);
    const form = new FormData();
    form.append('file', new Blob([zip], { type: 'application/zip' }), `${result.manifest.id}.zip`);
    response = await fetch(`${api}/api/v1/apps/versions${has('--publish') ? '?publish=true' : ''}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}` },
      body: form,
    });
  } else {
    response = await fetch(`${api}/api/v1/apps`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ manifest: readJson(join(appDir, APP_MANIFEST_FILE)) }),
    });
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) fail([`${response.status} ${body?.error?.message || response.statusText}`, ...(body?.error?.issues || []).map((issue) => `${issue.path}: ${issue.message}`)]);
  const live = body.currentVersion?.version;
  console.log(green(`✓ Uploaded ${result.manifest.name} ${result.manifest.version}`) + (live ? dim(`  live version: ${live}`) : ''));
};

// ---- dev server: the app in a screen simulator ----

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };

const dev = () => {
  const port = Number(flag('--port', process.env.PORT || 5300));
  const devFile = () => (existsSync(join(appDir, 'wallcast.dev.json')) ? readJson(join(appDir, 'wallcast.dev.json')) : {});
  const manifest = () => {
    const result = check(appDir);
    if (!result.ok) console.warn(red('✗ ') + result.problems.join('\n  '));
    return result.manifest || readJson(join(appDir, APP_MANIFEST_FILE));
  };
  const send = (res, status, type, body, headers = {}) => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'access-control-allow-origin': '*', ...headers });
    res.end(body);
  };
  const readBody = (req) => new Promise((resolveBody) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { resolveBody({}); }
    });
  });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const path = decodeURIComponent(url.pathname);
    try {
      if (path === '/' || path === '/index.html') {
        return send(res, 200, MIME['.html'], readFileSync(join(root, 'dev-host/index.html')));
      }
      if (path === '/__wallcast/host.js') return send(res, 200, MIME['.js'], readFileSync(join(root, 'dev-host/host.js')));
      if (path === '/__wallcast/app-host.js') return send(res, 200, MIME['.js'], readFileSync(join(root, 'dev-host/app-host.js')));
      if (path === '/__wallcast/app-platform.js') return send(res, 200, MIME['.js'], readFileSync(join(root, 'lib/app-platform.js')));
      if (path === '/__wallcast/sdk.js') return send(res, 200, MIME['.js'], readFileSync(join(root, 'dist/wallcast.js')));
      if (path === '/__wallcast/manifest') return send(res, 200, MIME['.json'], JSON.stringify(manifest()));
      if (path === '/__wallcast/dev') {
        const file = devFile();
        return send(res, 200, MIME['.json'], JSON.stringify({ config: file.config || {}, screen: file.screen || null, secrets: Object.keys(file.secrets || {}) }));
      }
      if (path.startsWith('/__wallcast/data/') && req.method === 'POST') {
        // Like the WallCast API: the data source with secrets from wallcast.dev.json, called from here.
        const name = path.slice('/__wallcast/data/'.length);
        const source = manifest().dataSources?.[name];
        if (!source?.url) return send(res, 404, MIME['.json'], JSON.stringify({ code: 'unknown_source', message: `No data source "${name}"` }));
        const body = await readBody(req);
        const values = { config: body.config || {}, secrets: devFile().secrets || {}, params: body.params || {}, screen: body.screen || {} };
        const headers = Object.fromEntries(Object.entries(source.headers || {}).map(([key, value]) => [key, fillAppTemplate(value, values)]));
        try {
          const response = await fetch(fillAppTemplate(source.url, values, 'url'), {
            method: source.method || 'GET',
            headers,
            body: source.body ? fillAppTemplate(source.body, values) : undefined,
            signal: AbortSignal.timeout(source.timeoutMs || 8000),
          });
          const type = response.headers.get('content-type') || '';
          const text = await response.text();
          let parsed = text;
          if (/json/i.test(type)) { try { parsed = JSON.parse(text); } catch { /* keep text */ } }
          return send(res, 200, MIME['.json'], JSON.stringify({ status: response.status, contentType: type, body: parsed, fetchedAt: new Date().toISOString(), stale: false }));
        } catch (error) {
          return send(res, 502, MIME['.json'], JSON.stringify({ code: 'failed', message: error.message }));
        }
      }
      if (path === '/__wallcast/fetch' && req.method === 'POST') {
        const body = await readBody(req);
        const response = await fetch(body.url, { method: body.init?.method || 'GET', headers: body.init?.headers || {}, body: body.init?.body });
        const type = response.headers.get('content-type') || '';
        const text = await response.text();
        let parsed = text;
        if (/json/i.test(type)) { try { parsed = JSON.parse(text); } catch { /* keep text */ } }
        return send(res, 200, MIME['.json'], JSON.stringify({ status: response.status, headers: { 'content-type': type }, body: parsed }));
      }
      if (path === '/app/_wallcast/sdk.js' || path.endsWith('/_wallcast/sdk.js')) {
        return send(res, 200, MIME['.js'], readFileSync(join(root, 'dist/wallcast.js')));
      }
      if (path.startsWith('/app/')) {
        const rel = normalizeBundlePath(path.slice('/app/'.length) || 'index.html');
        const file = rel && join(appDir, rel);
        if (!file || !existsSync(file) || statSync(file).isDirectory()) return send(res, 404, 'text/plain', 'Not found');
        const type = bundleContentType(rel) || MIME[extname(rel)] || 'application/octet-stream';
        if (/\.html?$/i.test(rel)) {
          // The same head the WallCast API adds on upload: CSP first, then the SDK.
          const depth = rel.split('/').length - 1;
          const html = injectAppHtmlHead(readFileSync(file, 'utf8'), buildAppContentSecurityPolicy(manifest()), `${'../'.repeat(depth)}_wallcast/sdk.js`);
          return send(res, 200, type, html);
        }
        return send(res, 200, type, readFileSync(file));
      }
      return send(res, 404, 'text/plain', 'Not found');
    } catch (error) {
      return send(res, 500, 'text/plain', String(error?.stack || error));
    }
  });
  server.listen(port, () => {
    const result = check(appDir);
    console.log(green(`✓ ${result.manifest?.name || basename(appDir)} on http://localhost:${port}`) + dim('  (screen simulator; the app alone: /app/)'));
    if (!result.ok) console.warn(red('  Problems:\n  • ') + result.problems.join('\n  • '));
  });
};

const commands = { init, dev, validate, pack, deploy };
if (!commands[command]) {
  console.log(`wallcast-app <command> [folder]

  init <folder>        start a new app from the starter
  dev [folder]         run it in a screen simulator (--port 5300)
  validate [folder]    check wallcast.json and the files
  pack [folder]        make the zip to upload (-o app.zip)
  deploy [folder]      upload with WALLCAST_API_KEY (--publish, --api https://api.wallcast.io)`);
  process.exit(command ? 1 : 0);
}
await commands[command]();
