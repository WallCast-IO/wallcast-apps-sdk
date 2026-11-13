# WallCast Apps SDK

Build apps for WallCast screens: an HTML5 bundle, a page you host, or a data feed for your designs.
This package has the `window.wallcast` SDK, the `wallcast-app` command (simulator, checks, packaging,
deploys), a starter and two examples.

Guides: https://wallcast.io/help/topics/developers

## Quick start

```bash
npx wallcast-app init my-app
cd my-app
npx wallcast-app dev        # screen simulator with a settings form, http://localhost:5300
npx wallcast-app pack       # the zip to upload in Developers → Apps
WALLCAST_API_KEY=wc_live_… npx wallcast-app deploy --publish   # or upload from CI
```

## In your app

```js
const { config, screen } = await wallcast.ready();
wallcast.on('config', render);                       // settings saved in the dashboard
const { body } = await wallcast.data.fetch('kpis');  // a data source from wallcast.json, keys stay on WallCast
wallcast.on('message', (data) => {});                // POST /api/v1/apps/:id/messages
await wallcast.storage.set('last', body);            // kept on this screen
wallcast.playback.ready();                           // first frame drawn
```

Types: `import wallcast from '@wallcast/apps-sdk'` (ESM) or the script tag
`https://api.wallcast.io/api/apps-sdk/1/wallcast.js` for pages you host yourself.

## Example repository

```
my-app/
  wallcast.json        manifest: id, name, version, settings, data sources, permissions
  wallcast.dev.json    local settings, secrets and screen size (never uploaded)
  index.html           the page screens open
  app.js, style.css    your code (any build tool: upload its output folder)
  assets/              images and fonts, kept on the screen for offline use
  .wallcastignore      extra files to leave out of the zip
  .github/workflows/deploy.yml   npx wallcast-app deploy --publish
```

## Examples

- `examples/kpi-dashboard`: sales numbers from an API through a data source with a secret key, refreshes, keeps the last numbers offline.
- `examples/now-serving`: a demo of real-time messages (`scripts/call-next.mjs`). For a real queue system use WallCast Queue.

## This repository

- `src/wallcast.js` is the SDK (no dependencies); `npm run build` writes `dist/`. `npm run build:api` writes the copy the WallCast API adds to every uploaded bundle (expects the `wall-cast-api` repo next to this one).
- `lib/app-platform.js` and `dev-host/app-host.js` are built from `wallcast-layout-spec` (manifest checks and the iframe host shared with Studio and the players). The build looks for it next to this repo, or in `WALLCAST_SPEC_DIR`; without it the vendored copies are kept.
- Until `@wallcast/apps-sdk` is on npm, install the tool from this repository: `npm install --save-dev github:WallCast-IO/wallcast-apps-sdk`, then `npx wallcast-app …`.
