/* Stress the Stitch merge engine: scale, unicode, collision storms, generational churn. */
const JSZip = require("jszip");
const Merger = require("/Users/mac/app-inventor-fusion/merger.js");
const fs = require("fs");

const t0 = Date.now();
const since = (l) => console.log(`[${String(Date.now() - t0).padStart(6)}ms] ${l}`);
let failed = 0;
const assert = (c, m) => { if (!c) { console.error("FAIL: " + m); failed++; } };

function makeAia(projectName, screens, assets) {
  const zip = new JSZip();
  zip.file("youngandroidproject/project.properties",
    `#\nname=${projectName}\nassets=../assets\nsource=../src\nbuild=../build\nversioncode=1\nversionname=1.0\n`);
  const dir = `src/appinventor/ai_user/${projectName}/`;
  screens.forEach((s) => {
    zip.file(dir + s + ".scm", `#|\n$JSON\n{"Properties":{"$Name":"${s}","$Type":"Form","$Components":[{"$Type":"Button","$Name":"B1"}]}}\n|#\n`);
    zip.file(dir + s + ".bky", '<xml xmlns="https://developers.google.com/blockly/xml"></xml>');
  });
  Object.keys(assets || {}).forEach((a) => zip.file("assets/" + a, Buffer.from(a + ":" + projectName)));
  return zip;
}

(async () => {
  // 1. collision storm: 2 projects x 40 screens sharing half their names
  const shared = Array.from({ length: 20 }, (_, i) => "Shared" + i);
  const onlyA = Array.from({ length: 20 }, (_, i) => "OnlyA" + i);
  const onlyB = Array.from({ length: 20 }, (_, i) => "OnlyB" + i);
  const a = makeAia("Alpha", [...shared, ...onlyA], {});
  const b = makeAia("Beta", [...shared, ...onlyB], {});

  let r = await Merger.merge([
    { label: "Alpha", zip: a, screens: [...shared, ...onlyA], assets: [] },
    { label: "Beta", zip: b, screens: [...shared, ...onlyB], assets: [] },
  ], "Storm");
  const paths = r.files.map((f) => f.path);
  assert(paths.filter((p) => p.endsWith(".scm")).length === 80, "80 selected screens survive storm");
  assert(r.warnings.filter((w) => w.type === "screen-renamed").length === 20, "20 renames");
  const uniquePaths = new Set(paths);
  assert(uniquePaths.size === paths.length, "no path written twice");
  since("collision storm: 60 screens, 20 renames");

  // renamed screens carry updated $Name
  const renamedScm = r.files.find((f) => f.path.includes("Beta_Shared0.scm"));
  assert(renamedScm && renamedScm.data.includes('"$Name":"Beta_Shared0"'), "$Name synced on rename");

  // 2. hostile filenames: unicode, emoji, spaces, dots, very long
  const longName = "x".repeat(120) + ".jpg";
  const weirdAssets = {
    "héllo wörld.png": Buffer.from("u1"),
    "🎮 game over!!.mp3": Buffer.from("u2"),
    "a.very.long.name...double..dots.wav": Buffer.from("u3"),
    [longName]: Buffer.from("u4"),
    "UPPER.PNG": Buffer.from("u5"),
    "UPPER.png": Buffer.from("u6"),
  };
  const uZip = makeAia("Weird", ["Screen1"], weirdAssets);
  const uProj = makeAia("Plain", ["Screen1"], {});
  r = await Merger.merge([
    { label: "Weird", zip: uZip, screens: ["Screen1"], assets: Object.keys(weirdAssets).map((n) => "assets/" + n) },
    { label: "Plain", zip: uProj, screens: ["Screen1"], assets: [] },
  ], "Unicode_test");
  const assetPaths = r.files.map((f) => f.path).filter((p) => p.startsWith("assets/"));
  assert(assetPaths.length === Object.keys(weirdAssets).length, `all ${Object.keys(weirdAssets).length} odd assets carried`);
  assert(r.files.every((f) => !f.path.includes("..") || f.path === "assets/a.very.long.name...double..dots.wav"), "no traversal outside assets/");
  since("hostile filenames survived intact");

  // 3. generational churn: merge output feeds next merge, 3 generations
  let genZip = makeAia("G0", Array.from({ length: 10 }, (_, i) => "Gen" + i), { "g.bin": Buffer.from("gen") });
  for (let gen = 1; gen <= 3; gen++) {
    const fresh = makeAia("G" + gen, Array.from({ length: 10 }, (_, i) => "Gen" + i), { "g.bin": Buffer.from("gen" + gen) });
    r = await Merger.merge(
      [
        { label: "carry", zip: genZip, screens: Merger.inspect(genZip).screens.map((s) => s.name), assets: [] },
        { label: "G" + gen, zip: fresh, screens: Merger.inspect(fresh).screens.map((s) => s.name), assets: ["assets/g.bin"] },
      ],
      "Gen" + gen
    );
    const z = new JSZip();
    z.file("youngandroidproject/project.properties", r.propertiesText);
    r.files.forEach((f) => z.file(f.path, f.data));
    const info = Merger.inspect(z);
    assert(info.screens.length === 10 * (gen + 1), `gen ${gen}: ${info.screens.length} screens cumulative`);
    genZip = z;
  }
  since("3 generations chained without corruption");

  // 4. degenerate selections
  try {
    await Merger.merge([{ label: "e", zip: a, screens: [], assets: [] }], "X");
    assert(false, "empty selection must throw");
  } catch (e) { /* expected */ }
  const junkName = await Merger.merge(
    [{ label: "j", zip: makeAia("J", ["S1"], {}), screens: ["S1"], assets: [] }],
    "!!!@@@###"
  );
  assert(Merger.parseProperties(junkName.propertiesText).name === "Project", "all-invalid name falls back to Project");
  since("degenerate inputs handled");

  console.log(failed ? `\n${failed} FAILURES` : "\nSTITCH STRESS GREEN - total " + ((Date.now() - t0) / 1000).toFixed(1) + "s");
  process.exit(failed ? 1 : 0);
})();
