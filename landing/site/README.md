# Toph landing page

Live at **[ferforastieri.github.io/toph](https://ferforastieri.github.io/toph/)**. Static pages: `index.html` (CSS and JS inline), `docs.html` (served at `/docs.html`), `docs.md`, `llms.txt` and `assets/`. No build step.

- **Preview:** open `index.html` in a browser. Every section is static HTML; the only JavaScript is the language switch, the scroll reveal, the copy button and the header state.
- **Languages:** Portuguese and English. The page ships in Portuguese and an `EN` dictionary translates the labels; the choice is stored in `toph-lang`. With no saved choice it opens in Portuguese if the browser is in Portuguese, otherwise in English.
- **Look:** Toph's own dark and amber palette, the latest 3D mark, and the real Toph avatars from the app. The hero follows the same composition as Tucano's hero: a large brand mark with floating Tophs and an underlined headline. The workbench mock moved to the "Além dos Tophs" section.
- **Eye tracking:** the hero mark and the four floating Tophs use an eye-less base (`*-eyeless.png`) plus two masked copies of the original art. Only the copies move, following the pointer with the app's `--look-x` / `--look-y` technique.
- **Docs:** `/docs.html` (`docs.html`) explains installation, configuration, Tophs, engines, MCP, skills, approvals, the workbench, files and troubleshooting. `docs.md` is the Markdown version and `llms.txt` is the compact AI-agent guide.
- **SEO:** `robots.txt`, `sitemap.xml`, canonical/OG/Twitter tags and JSON-LD (`SoftwareApplication`, `WebSite`, `FAQPage` on the landing; `TechArticle`, `BreadcrumbList` on the docs).
- **Fonts:** Sora (headings), Inter (text) and JetBrains Mono (code), from Google Fonts.
- **Logos:** `assets/logos/claude.svg` and `assets/logos/openai.svg` come from [Simple Icons](https://simpleicons.org) (CC0).
- **Publishing:** the static files are published by GitHub Pages from `landing/site` through `.github/workflows/pages.yml`. There is no build step.
