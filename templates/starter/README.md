# WallCast app starter

A starting point for an app on WallCast screens: a title, a message and the time, with
settings you change in the dashboard. Use this repository as a template, then make it yours.

## Run it

```bash
npm install
npm run dev        # screen simulator with a settings form: http://localhost:5300
```

Edit `wallcast.json` (the app's id, name, version and settings), `index.html`, `app.js` and
`style.css`. `wallcast.dev.json` holds settings, secrets and the screen size for local runs; it
is never uploaded.

## Put it on screens

- **By hand**: `npm run pack` makes the zip; upload it in the dashboard under
  **Developers → Apps → Upload app**.
- **From GitHub**: add a repository secret `WALLCAST_API_KEY` (Developers → API keys, with the
  `apps:write` permission). Every push to `main` uploads the app and makes the new version live.
  Raise `version` in `wallcast.json` for each release.

Then, in the app's page in **Developers**, fill in its settings and click **Show on screens**, or
add it to any design in Studio under **Widgets → App**.

## Layout

```
wallcast.json        manifest: id, name, version, settings, data sources, permissions
wallcast.dev.json    local settings, secrets and screen size (not uploaded)
index.html           the page screens open
app.js, style.css    your code (any build tool works: upload its output folder)
assets/              images and fonts, kept on the screen for offline use
.wallcastignore      extra files to leave out of the zip
.github/workflows/deploy.yml
```

Guides: https://www.wallcast.io/help/topics/developers
