# Shared native launcher

React startup UI for desktop and Android: server selection, local-mode setup
and environment configuration. The `desktop/` and `mobile/` Vite configurations
build this source into their own `dist/` directories.

The workbench is served by the backend from `web/`; it is not duplicated here.
Brand assets are synchronized by `npm run sync-brand`.
