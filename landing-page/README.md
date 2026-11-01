# Toph landing page

Live at **[toph.sh](https://toph.sh)**. A single static page: `index.html` (CSS and JS inline) and `assets/`. No build step.

- **Preview:** open `index.html` in a browser. `index.html?shot` shows everything at once (for screenshots).
- **Languages:** Portuguese and English, with the PT | EN switch at the top. Every text is written in both, side by side (`<span lang="pt-BR">` and `<span lang="en">`), and the CSS shows the one matching `<html lang>`; what the scripts draw goes through `T(pt, en)`. With no saved choice it opens in Portuguese if the browser is in Portuguese, otherwise in English.
- **Look:** the shapes of the app icon (the round body, the eye, the two-orange beak) in cream, black and orange. The toucan in the hero, the one in the footer and the agents follow the pointer with their eyes.
- **App screens:** drawn in HTML, not screenshots. The #checkout channel in the "Live" section plays by itself and waits for the visitor to approve.
- **Fonts:** Bricolage Grotesque (headings) and Inter (text), from Google Fonts.
- **Logos:** `assets/logos/` come from [Simple Icons](https://simpleicons.org) (CC0).
- **Publishing:** served by Cloudflare as static files on `toph.sh` and `www.toph.sh` (`wrangler.jsonc`; `_headers` adds the security headers, `.assetsignore` keeps this README and the config off the site):

  ```bash
  cd landing-page && npx wrangler deploy
  ```


> Esta pasta é uma cópia independente da landing page. Ela não é referenciada pelo `install.sh`, Dockerfile, build do Tauri, CI de release, APK, DEB, AppImage, MSI ou RPM.

## Origem e licença

A estrutura, estilos e conteúdo desta landing foram copiados do site do projeto Tucano (https://tucano.sh / https://github.com/eduwxyz/tucano), licenciado sob Apache-2.0. A marca, os links e os agentes de demonstração foram adaptados para o Toph.
