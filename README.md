# PFx CSS Motion

An original, interactive CSS animation studio powered by [PFx CSS Motion Core v1.0.0](https://github.com/pfxamd/pfx-css-motion-core/releases/tag/v1.0.0).

**Status:** Alpha 0.2 — interactive motion timeline, draggable multi-selection, sampled keyframes, editable easing curves, native preview, CSS export, and JSON project import/export.

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
- Timeline: drag any keyframe diamond to move it, select multiple diamonds with Ctrl/Cmd or Shift, and drag selected groups while preserving relative offsets. Frame moves create a single undo entry.
- Keyboard: focus a diamond and use Left/Right arrows (1% increments; Alt + arrow for 0.1%). Focus a curve handle and use arrows (Shift = larger increment).
- Live frame sampling: “+ Sample keyframe” captures the preview element's **computed CSS values** at the playhead for every animated property; generated frames use those values rather than copying a neighbor.
- Visual easing editor: drag two cubic Bézier handles, or choose named easing presets. Step easings can be converted to a Bézier before editing.
- Scrubbing represents the first active iteration; native preview seeks account for the configured CSS animation delay. Transport supports variable speed and looping.
- Undo/redo: `Ctrl/Cmd+Z`, `Ctrl/Cmd+Y`; play/pause: `Space` outside text fields.
- Export: CSS (copy or download), project JSON (download or import).
- CSS output comes directly from `compileCSS()`; previews use `createBrowserAnimation()`.

**Limits of Alpha:** one editable motion at a time, max 24 keyframes and up to 30 s duration. The editor currently does not expose additive compositions or `endDelay`. Live computed sampling supports CSS properties the browser can compute; for some complex transforms and non-linear interpolation, inserting a sampled keyframe can change the surrounding motion trajectory. Project save is a local JSON download, not a server account. The native preview is based on browser capabilities, not a browser polyfill.

## Deploy

The [Actions workflow](.github/workflows/build-and-pages.yml) runs tests, builds the app and publishes to GitHub Pages after successful verification. GitHub Pages must be configured with **GitHub Actions** as its source in repository settings.

Target: [pfxamd.github.io/PFx-CSS-Motion](https://pfxamd.github.io/PFx-CSS-Motion/).

## Ownership and licensing

Original PFx application code, © 2026 PFxamd. Apache-2.0. The separate PFx CSS Motion Core is also Apache-2.0.
