# faang-ui

A design system for agent interfaces: conversation, tools, approvals, tokens
and pixel portraits — React with plain CSS, no Tailwind, no style runtime.

```bash
npm i faang-ui
```

```tsx
// next.config.ts — the package ships TypeScript source
transpilePackages: ["faang-ui"]

// app/layout.tsx — once
import "faang-ui/styles.css";

// anywhere
import { Button } from "faang-ui/components/Button";
```

- Two themes through `data-theme="light|dark"` on `<html>`.
- Semantic tokens for every color, radius and spacing (`src/styles/tokens.css`).
- Interactive controls built on Radix (focus, keyboard, screen readers).
- One export per file: `faang-ui/components/*`, `faang-ui/agent/*`,
  `faang-ui/sky/*`, `faang-ui/tokens/*`, `faang-ui/icons/*`.

MIT.
