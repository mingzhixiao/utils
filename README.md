# Dev Toolbox Pro

Dev Toolbox Pro now uses one shared frontend for both:

- the browser extension
- a Cloudflare Pages deployment

The shared page lives under `site/`, so the extension and the website always use the same HTML, CSS, and JavaScript.

## Features

- Encoding tools: URL, Unicode, Base64, and string escape/unescape
- JSON tools: format, minify, tree view, diff, JSON/CSV conversion
- Time tools: current time and timestamp/date conversion
- Image tools: compression and batch image comparison
- Elasticsearch tools: Console output, bash cURL, PowerShell cURL, and bulk helpers

## Project Structure

```text
.
├─ background.js
├─ manifest.json
├─ site/
│  ├─ index.html
│  ├─ app.js
│  ├─ styles.css
│  └─ icons/
└─ README.md
```

## Browser Extension

Load the repository root as an unpacked extension in Chrome or Edge:

1. Open the extensions page.
2. Enable developer mode.
3. Choose "Load unpacked".
4. Select this repository root.

The extension entry point is `site/index.html`, configured through `manifest.json`.

## Cloudflare Pages

This repository can be deployed to Cloudflare Pages without a build step.

Recommended Pages settings:

- Production branch: `main`
- Build command: `exit 0`
- Build output directory: `site`

That publishes only the shared web assets and excludes extension-only files such as `manifest.json` and `background.js`.

## Notes

- `manifest.json` points the extension to `site/index.html`.
- Extension icons are also served from `site/icons/`.
- If you change the UI, edit files in `site/` only.
