# My screen app

A WallCast screen app. Run it in the simulator:

```bash
npx wallcast-app dev
```

Then change `wallcast.json` (name, settings), `index.html`, `app.js` and `style.css`.

- **Settings**: each property under `config` in `wallcast.json` becomes a field in the dashboard. The app reads them from `wallcast.config` and hears changes with `wallcast.on('config', …)`.
- **Dev values**: `wallcast.dev.json` sets settings, secrets and the screen size for local runs. It is never uploaded.
- **Ship it**: `npx wallcast-app pack` makes the zip to upload in Developers → Apps, or `WALLCAST_API_KEY=… npx wallcast-app deploy --publish`.
