# Resume Studio

`Resume Studio` is a unified bilingual resume workspace built with React and Vite. It combines resume editing, centered live preview, recruiter-style analysis, ATS matching, AI HR review, JSON import/export, and Arabic/English workflows in one app shell.

## Live Website

- Public site: [https://jao399.github.io/resume-studio/](https://jao399.github.io/resume-studio/)
- English editor: [https://jao399.github.io/resume-studio/](https://jao399.github.io/resume-studio/)
- Arabic editor: [https://jao399.github.io/resume-studio/arabic.html](https://jao399.github.io/resume-studio/arabic.html)

Open locally:
- `npm install`
- `npm run dev`
- open the local Vite URL

## Main Features

- Unified dashboard and resume workspace
- Centered live preview with zoom, undo/redo, JSON export, PDF print, and share URL tools
- Live bilingual CV editing with English and Arabic content layers
- A4-friendly print and browser PDF export
- Recruiter-style `Quality`, `ATS Helper`, and `AI HR Review`
- `Commands`, sync tools, version history, and cover-letter flows
- Per-version visual style presets and app-level light/dark/system themes

## Public Demo Data

This repo ships with a fictional bilingual sample profile so the app can be published safely as a public demo.

To customize the seeded demo:
- edit the bilingual demo data in `src/lib/defaults.js`
- replace `assets/profile-demo.svg` if you want a different neutral avatar

To start from your own resume:
- use `Import data` for a direct resume JSON
- or use `Import versions` for version bundles

## Local Private Data Workflow

Keep personal resume files outside this repo.

Recommended setup:
- public repo: product code + fictional demo data only
- private local folder: your real resume JSON, exported PDFs, personal notes, and one-off helper outputs

The `.gitignore` is set to avoid common local exports and runtime artifacts, but the safest workflow is still to keep personal assets outside the project folder entirely.

## Core Files

- `index.html`, `arabic.html`, `cover-letter.html`, `cover-letter-ar.html`: route entry pages for the unified React app
- `src/App.jsx`: main unified bilingual workspace
- `src/lib/defaults.js`: UI copy, presets, and seeded demo data
- `src/lib/model.js`: normalized bilingual resume model and adapters
- `src/lib/storage.js`: local persistence and legacy import/export migration
- `src/styles/app.css`: app shell, preview, RTL, theme, and print styling
- `tools/`: local helper and verification scripts
- `legacy/vanilla-app/`: archived pre-React frontend files

## PDF Notes

- `Print / Save PDF` uses browser print with the app's A4 print styles.
- English and Arabic previews share the same React renderer and print pipeline.
- Cover letter routes use the same unified app shell with route-specific mode settings.

## Local Verification

Run:

```powershell
npm install
npm run build
```

For a local static preview, serve `dist/` after the build and open the local URL in a browser.

## Free Live Hosting

This repo is prepared for:
- GitHub Pages for the static site
- direct browser AI with a user-supplied OpenRouter or OpenAI key
- optional Cloudflare Workers for proxy/helper endpoints

### GitHub Pages

- The workflow file lives at `.github/workflows/deploy-pages.yml`
- Push the repo to the `main` branch on GitHub
- Enable GitHub Pages with GitHub Actions
- The workflow now installs dependencies, builds the Vite app, and publishes `dist/`

### AI on the Hosted Site

- The live site can use AI directly from the browser with the user's own key.
- Supported modes now include:
  - `OpenRouter Auto`
  - `OpenRouter Free`
  - `OpenRouter Manual`
  - `OpenAI`
- The shared AI workspace settings live in the `Commands` tab and power:
  - Commands fallback
  - Quality AI review
  - ATS AI review
  - AI HR Review
  - cover-letter draft generation
  - English to Arabic sync

### Optional Cloudflare API

- The worker scaffold lives in `cloudflare/`
- Deploy it with Wrangler if you want a hosted proxy/helper layer
- The current React app does not require a runtime config file for the core hosted experience

### Hosted Behavior

- `Print / Save PDF` is the primary hosted PDF path
- AI features can run directly in the browser with the user's own key
- If the Cloudflare worker is deployed, the hosted app can use it for helper/proxy routes too

## Credits

- Amjad Alzomi

## License

Licensed under the MIT License.
