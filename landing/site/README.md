# Toph landing page

Live at **[tophs.vira.ia.br](https://tophs.vira.ia.br)**. A single static page: `index.html` (CSS and JS inline) and `assets/`. No build step.

- **Preview:** open `index.html` in a browser. Every section is static HTML; the only JavaScript is the language switch, the scroll reveal, the copy button and the header state.
- **Languages:** Portuguese and English. The page ships in Portuguese and an `EN` dictionary translates the labels; the choice is stored in `toph-lang`. With no saved choice it opens in Portuguese if the browser is in Portuguese, otherwise in English.
- **Look:** Toph's own dark and amber palette, the latest 3D mark, and the real Toph avatars from the app. The hero is a workbench mock built in HTML, not a screenshot.
- **Fonts:** Sora (headings), Inter (text) and JetBrains Mono (code), from Google Fonts.
- **Logos:** `assets/logos/claude.svg` and `assets/logos/openai.svg` come from [Simple Icons](https://simpleicons.org) (CC0).
- **Publishing:** static files served by Cloudflare on `tophs.vira.ia.br`, routed by the `toph-site` Worker. `_headers` adds the security headers; `.assetsignore` keeps this README and the config off the site.

  ```bash
  cd landing/site && npx wrangler deploy
  ```
