# @toph/ui

The Toph design system: conversation, tools, approvals, tokens and pixel
portraits — React with plain CSS, no Tailwind, no style runtime.

```tsx
// once
import "@toph/ui/styles.css";

// the app-facing controls
import { Button, Input, Table } from "@toph/ui/app";

// the kit itself
import { Avatar, Sidebar } from "@toph/ui";
```

- Two themes through `data-theme="light|dark"` on `<html>`.
- Semantic tokens for every color, radius and spacing (`src/styles/tokens.css`).
- Interactive controls built on Radix (focus, keyboard, screen readers).
- `@toph/ui/app` keeps the Toph screens' shapes over the shared kit.

MIT.
