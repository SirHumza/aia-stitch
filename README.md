# App Inventor Fusion

Merge MIT App Inventor `.aia` projects in your browser. No upload, no account — files never leave your machine.

**Use it:** https://sirhumza.github.io/app-inventor-fusion/

Drop two or more `.aia` files, pick which screens and assets survive, hit merge, import the result in App Inventor via *Projects → Import (.aia)*.

## What it handles

- **Colliding screen names** — every project exports a `Screen1`, so the second+ occurrence gets prefixed with its project tag (`GameB_Screen1`), and the form name inside the `.scm` is rewritten to match.
- **Duplicate assets** — assets are never renamed (screens and blocks reference them by filename), so duplicates keep the first copy and you get a warning instead of silent data loss.
- **Valid output structure** — writes a real `youngandroidproject/project.properties` and preserves the `src/appinventor/ai_user/<Project>/` layout App Inventor expects.
- **Selective merging** — uncheck any screen or asset to leave it out.

## Development

Static site, no build step:

```
index.html   markup
style.css    design system (paper/ink/emerald)
app.js       UI layer
merger.js    pure .aia merge logic (browser + Node)
```

Run locally: `python3 -m http.server 8000`, open `http://localhost:8000`.

The merge engine is unit-testable outside the browser:

```js
const Merger = require("./merger.js");
const result = await Merger.merge(
  [{ label: "GameA", zip: jszipInstance, screens: ["Screen1"], assets: ["assets/logo.png"] }],
  "MyMergedProject"
);
```

## Credit

Original concept from a decompiled Java "App Inventor Fusion" tool; this web implementation was rebuilt from scratch. An `.aia` is just a zip — that's the whole trick.
