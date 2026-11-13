// Builds dist/ (the SDK for script tags and for npm), copies the shared platform code
// from wallcast-layout-spec (manifest validation and the iframe host), and with
// --api <file> writes the SDK into the API so every bundle ships with it.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;

mkdirSync(join(root, 'dist'), { recursive: true });
const source = readFileSync(join(root, 'src/wallcast.js'), 'utf8').replaceAll('__SDK_VERSION__', version);
writeFileSync(join(root, 'dist/wallcast.js'), source);
writeFileSync(
  join(root, 'dist/index.mjs'),
  `// @wallcast/apps-sdk ${version}. Importing it installs window.wallcast (once) and exports it.\n` +
    `import './wallcast.js';\nconst wallcast = window.wallcast;\nexport default wallcast;\nexport { wallcast };\n`,
);
copyFileSync(join(root, 'src/index.d.ts'), join(root, 'dist/index.d.ts'));

// Shared code from the layout spec (vendored, like the other WallCast repos do).
const spec = resolve(root, process.env.WALLCAST_SPEC_DIR || '../wallcast-layout-spec');
if (existsSync(join(spec, 'app-platform.ts'))) {
  const out = join(root, '.spec-build');
  execFileSync('npx', ['tsc', '--module', 'ES2020', '--target', 'ES2020', '--declaration', 'false', '--strict', '--skipLibCheck',
    '--lib', 'ES2020,DOM', '--outDir', out, join(spec, 'app-platform.ts'), join(spec, 'app-host.ts')], { stdio: 'inherit', cwd: spec });
  mkdirSync(join(root, 'lib'), { recursive: true });
  const fix = (text) => text.replace(/from '\.\/([a-z-]+)'/g, "from './$1.js'");
  writeFileSync(join(root, 'lib/app-platform.js'), fix(readFileSync(join(out, 'app-platform.js'), 'utf8')));
  writeFileSync(join(root, 'dev-host/app-host.js'), fix(readFileSync(join(out, 'app-host.js'), 'utf8')).replace("'./app-platform.js'", "'/__wallcast/app-platform.js'"));
} else {
  console.warn(`(spec not found at ${spec}; keeping the vendored lib/ and dev-host/app-host.js)`);
}

const apiIndex = process.argv.indexOf('--api');
if (apiIndex > 0) {
  const target = resolve(root, process.argv[apiIndex + 1]);
  writeFileSync(
    target,
    `// Generated from wallcast-apps-sdk (npm run build:api). Do not edit by hand.\n` +
      `export const APP_SDK_VERSION = ${JSON.stringify(version)};\n` +
      `export const APP_SDK_SOURCE = ${JSON.stringify(source)};\n`,
  );
  console.log(`SDK ${version} written to ${target}`);
}
console.log(`Built @wallcast/apps-sdk ${version}`);
