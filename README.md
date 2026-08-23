# AIA Stitch

Stitch MIT App Inventor `.aia` projects right in your browser. No uploads, no accounts, nothing leaves your machine.

**Use it here:** https://sirhumza.github.io/aia-stitch/

Drop two or more `.aia` files onto the page, untick anything you don't want, hit merge, then import the result in App Inventor through Projects > Import (.aia). Done.

## Why this exists

Every App Inventor project starts with a screen called `Screen1`. So the moment you try to merge two projects by copying files, everything collides and breaks. This tool actually deals with that:

- Colliding screen names get prefixed with their project tag (`GameB_Screen1`), and the form name inside the screen's `.scm` gets rewritten so App Inventor doesn't choke.
- Duplicate assets keep the first copy instead of silently overwriting. Assets are never renamed, because screens reference them by exact filename.
- If a renamed screen's blocks use `open another screen`, you get a heads up to double check those targets, since those references are plain strings.
- Uncheck any screen or asset you want left out. The project whose card sits highest keeps original names, and you can reorder cards with the arrows.

The output has a proper `project.properties` and the folder layout App Inventor expects, so imports just work.

## Running it locally

It's a static site, there is no build step:

```
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Hacking on it

Four files, that's the whole thing. `merger.js` holds the actual merge logic and works in Node too, which is how it gets tested:

```js
const Merger = require("./merger.js");
const result = await Merger.merge(
  [{ label: "GameA", zip: myJszipInstance, screens: ["Screen1"], assets: ["assets/logo.png"] }],
  "MergedProject"
);
```

An `.aia` is really just a zip file with some `.scm` (screen JSON), `.bky` (block XML) and assets inside. Once you know that, all of this seems a lot less magical.

## Credit

Idea borrowed from an old Java tool of the same name that shipped as a jar. This web version shares none of its code.
