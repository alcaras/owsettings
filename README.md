# Old World Tournament Settings

**Live:** https://alcaras.github.io/owsettings/

Sets Old World's Hotseat / Network / Play-by-Cloud lobby defaults to the
community-tournament ruleset for any of the 18 pool maps (or an FFA),
without launching the game. Runs entirely in the browser — the settings
file is never uploaded (the page's CSP forbids network requests).

## For players

1. Quit Old World (it rewrites the settings file when it closes).
2. Open the site, pick a map / FFA, tick the lobbies you want updated.
3. Point it at your `GameOptionsSave.xml`:
   - Windows: `Documents\My Games\OldWorld\` (Steam, Epic and GOG alike)
   - Mac: `~/Library/Application Support/OldWorld/`
   - Chrome / Edge / Brave: choose the folder → the page backs up the file and saves in place.
   - Safari / Firefox: choose the file → download the updated one → drop it back in the folder.
4. Launch the game; the lobby already has the tournament settings.

Only the tournament settings are touched. Everything else in the file —
player options, achievements, other lobbies, settings the ruleset doesn't
mention — passes through byte-for-byte.

## Development

```
npm test                          # XML round-trip + preset tests (node --test)
python3 scripts/build_presets.py  # regenerate presets.js from the atlas sources
npm run serve                     # http://localhost:8765
```

No build step: the site is the repo root (`index.html`, `app.js`, `xml.js`,
`apply.js`, `labels.js`, `presets.js`, `style.css`, `img/`). GitHub Actions
runs the tests and publishes those files to Pages on push to `main`.
