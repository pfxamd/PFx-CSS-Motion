# PFx CSS Motion

An original, interactive CSS animation studio powered by [PFx CSS Motion Core v1.0.0](https://github.com/pfxamd/pfx-css-motion-core/releases/tag/v1.0.0).

**Status:** alpha 0.1 — editable motion/keyframe timeline, native browser preview, CSS export, and JSON project import/export.

## Getting started

Requires Node.js 22+ and Git.

```bash
npm install
npm run dev
```

Run `npm run check` for model tests and a production build. The core engine is pinned to the **v1.0.0 GitHub release**, not copied or rewritten in this application. This editor uses Vite only as a development/build tool; the core has no runtime dependencies.

## Available controls

- Four distinct motion presets: Lift & reveal, Soft overshoot, Horizontal drift, Turn & settle.
- Live preview objects: Card, Type, Shape.
- Motion inspector: duration, delay, easing, custom cubic-bezier, iterations, direction and fill mode.
- Keyframe inspector: editable offset, CSS property values, adding/removing keyframes and CSS properties.
- Timeline: property tracks, selected keyframe diamonds, scrubbing, transport, looping.
- Undo/redo: `Ctrl/Cmd+Z`, `Ctrl/Cmd+Y`; play/pause: `Space` outside text fields.
- Export: CSS (copy or download), project JSON (download or import).
- CSS output comes directly from `compileCSS()`; previews use `createBrowserAnimation()`.

**Limits of alpha:** one editable motion at a time, max 24 keyframes and up to 30 s duration. The editor currently does not expose additive compositions or `endDelay`. Project save is a local JSON download, not a server account.

## Deploy

The [Actions workflow](.github/workflows/build-and-pages.yml) runs tests, builds the app and publishes to GitHub Pages after successful verification. GitHub Pages must be configured with **GitHub Actions** as its source in repository settings.

Target: [pfxamd.github.io/PFx-CSS-Motion](https://pfxamd.github.io/PFx-CSS-Motion/).

## Ownership and licensing

Original PFx application code, © 2026 PFxamd. Apache-2.0. The separate PFx CSS Motion Core is also Apache-2.0.
