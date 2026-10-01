# IB Race v5.1 — Ommodi build

This release has the Ommodi question-bank URLs embedded **directly in `app.js`**. They are also repeated in `questionbank-config.js` as an optional override.

- Race: `https://ommodi.site/questionbanks/race.json`
- Practice: `https://ommodi.site/questionbanks/practice.json`

The included `questionbanks/` directory contains local fallback JSON so the app still starts if those remote URLs are not live yet.

## Important
`https://ommodi.site/` itself is a webpage, not raw JSON. The app therefore requests the two `/questionbanks/*.json` paths above. Those files must exist on that server and be publicly readable. If IB Race is hosted on another domain, Ommodi also needs to allow the appropriate CORS origin.

## Verify this build
Open `VERIFY_OMMODI.txt`, or search `app.js` for `ommodi.site`. You should see both URLs near the top of the file.

## Files
- `index.html` — app entry point
- `styles.css` — redesigned interface
- `app.js` — app + multiplayer + practice + calculator + built-in Ommodi defaults
- `questionbank-config.js` — optional URL overrides
- `questionbanks/race.json` — local Race fallback bank
- `questionbanks/practice.json` — local Practice fallback bank
- `firebase-config.js` — Firebase configuration
- `firebase-rules.json` — development rules only; harden before public launch
