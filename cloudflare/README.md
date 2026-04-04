# Resume Studio Cloudflare API

This worker hosts the helper endpoints used by the public GitHub Pages site:

- `GET /health`
- `POST /command-plan`
- `POST /translate-version`
- `POST /cover-letter-draft`
- `POST /ai-review`

## Deploy

1. Install Wrangler and sign in.
2. From the `cloudflare/` folder, run:

```bash
wrangler deploy
```

3. Set `ALLOWED_ORIGIN` to your GitHub Pages origin if you want strict CORS.
4. Copy the deployed worker URL into `runtime-config.js` as `apiOrigin`.

## Notes

- The live GitHub Pages site can now use AI directly from the browser with the user's own OpenRouter or OpenAI key, so this worker is optional rather than required.
- The browser still owns the user-entered API key.
- The worker does not store user keys.
- Hosted PDF export should use the browser print dialog.
- Hosted English PDF autofill is handled in the browser, not by this worker.
