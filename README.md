# 工具盒子

工具盒子 now uses one shared frontend for both:

- the browser extension
- a Cloudflare Pages deployment

The shared page lives under `site/`, so the extension and the website always use the same HTML, CSS, and JavaScript.

## Features

- Encoding tools: URL, Unicode, Base64, and string escape/unescape
- JSON tools: format, minify, tree view, diff, JSON/CSV conversion, path extraction
- SQL tools: compress, strip comments, generate Java entity from `CREATE TABLE`
- Time tools: current time and timestamp/date conversion (cross-browser safe)
- Image tools: compression and batch image comparison with failed-only filter
- Invoice tools: merge invoice images / PDF into a single PDF or Word document
- HTTP tools: GET / POST (Form / JSON) to bash / PowerShell cURL
- Array tools: newline / comma / JSON array / quoted-comma conversions with dedup & sort
- Elasticsearch tools: Console output, bash cURL, PowerShell cURL, and bulk helpers
- Office tools: extract embedded images from Excel / Word, download individually or as ZIP
- Word to PDF: convert `.docx` to PDF locally and download

## Project Structure

```text
.
├─ background.js
├─ manifest.json
├─ wrangler.jsonc
├─ site/
│  ├─ index.html          # main toolbox page
│  ├─ md-index.html       # standalone Markdown reader (marked + highlight.js)，支持把 Tab / 逗号 / 分号分隔的表格数据一键转换为 Markdown 表格
│  ├─ static/             # tool scripts, loaded by index.html
│  │  ├─ core.js          # shared infra: $, navigation, vendor lazy-loader, cURL helpers
│  │  ├─ encoding.js      # encoding / decoding tools
│  │  ├─ json.js          # JSON format / tree / diff / CSV
│  │  ├─ sql-tool.js      # SQL compress + Java POJO
│  │  ├─ time.js          # time / timestamp conversion
│  │  ├─ image-tool.js    # image compress + batch compare
│  │  ├─ fapiao.js        # invoice merge to PDF / Word
│  │  ├─ es.js            # Elasticsearch output helpers
│  │  ├─ http-form.js     # HTTP form to cURL
│  │  ├─ array.js         # array format conversion
│  │  ├─ excel.js         # Office image extraction
│  │  ├─ word-pdf.js      # Word to PDF
│  │  └─ theme-init.js    # early theme setup (no flash)
│  ├─ styles.css
│  ├─ vendor/             # third-party libs, loaded on demand (jspdf, jszip, mammoth, html2canvas, pdf(.worker).min.js, marked, highlight.min.js)
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
- Heavy third-party libraries under `site/vendor/` (jspdf, jszip, mammoth, html2canvas, pdf.js) are **lazy-loaded only when the related tool runs**, so the first screen stays light. `marked` / `highlight.js` are loaded by `md-index.html` since that page is entirely about Markdown.
