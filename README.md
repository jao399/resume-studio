# Resume Studio

`Resume Studio` is a bilingual resume and cover-letter editor with live preview, recruiter-style analysis, ATS matching, AI HR review, version history, section drag-and-drop, and Arabic/English workflows.

Open:
- `index.html` for the English editor
- `arabic.html` for the Arabic RTL editor

## Public Demo Data

This repo ships with a fictional bilingual sample profile so the app can be published safely as a public demo.

To customize the seeded demo:
- edit `resume-data.js` for English
- edit `resume-data-ar.js` for Arabic
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

- `index.html`: English editor and preview
- `arabic.html`: Arabic editor and preview
- `cover-letter.html`: English cover letter print/export page
- `cover-letter-ar.html`: Arabic cover letter print/export page
- `styles.css`: layout, typography, print, and preset styling
- `resume-data.js`: English demo content
- `resume-data-ar.js`: Arabic demo content
- `resume.js`: rendering, editing, analysis, versions, and workflows
- `tools/`: local helper and verification scripts

## PDF and Helper Notes

- `Print / Save PDF` uses browser print with the A4 print styles.
- `Save PDF Now` uses the local helper bridge started by `tools/start-pdf-helper.cmd`.
- Cover letter exports use `cover-letter.html` and `cover-letter-ar.html`.

## Verification

Run:

```powershell
powershell -ExecutionPolicy Bypass -File tools/verify-analysis-ui.ps1
```

That smoke test verifies:
- the `Quality` panel renders all 10 recruiter-analysis sections
- `Rewritten Suggestions` stays read-only
- ATS baseline mode works with no job description
- ATS job-specific mode works with a pasted job description
- browser runtime errors, console errors, and failed requests are captured

## Free Live Hosting

This repo is prepared for:
- GitHub Pages for the static site
- direct browser AI with a user-supplied OpenRouter or OpenAI key
- optional Cloudflare Workers for proxy/helper endpoints

### GitHub Pages

- The workflow file lives at `.github/workflows/deploy-pages.yml`
- Push the repo to the `main` branch on GitHub
- Enable GitHub Pages with GitHub Actions

### AI on the Hosted Site

- The live site can use AI directly from the browser with the user’s own key.
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
- Put the deployed worker URL into `runtime-config.js` as `apiOrigin`

Example:

```js
window.resumeRuntimeConfig = {
  mode: "auto",
  apiOrigin: "https://resume-studio-api.your-subdomain.workers.dev",
  savePdfBehavior: "print",
  hostedPdfImport: true
};
```

### Hosted behavior

- `Print / Save PDF` is the primary hosted PDF path
- `Save PDF Now` remains for local helper mode
- English PDF autofill works in the browser on the hosted site
- AI features can run directly in the browser with the user’s own key
- If the Cloudflare worker is deployed, the hosted app can use it for helper/proxy routes too
