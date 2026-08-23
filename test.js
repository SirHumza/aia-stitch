const JSZip = require("jszip");
const Merger = require("./merger.js");

function makeAia(projectName, screens, assets) {
  const zip = new JSZip();
  zip.file("youngandroidproject/project.properties",
    `#\nname=${projectName}\nassets=../assets\nsource=../src\nbuild=../build\nversioncode=1\nversionname=1.0\nsizing=Responsive\n`);
  const dir = `src/appinventor/ai_tester/${projectName}/`;
  screens.forEach(s => {
    zip.file(dir + s + ".scm", `#|\n$JSON\n{"YaVersion":"223","Source":"Form","Properties":{"$Name":"${s}","$Type":"Form"}}\n|#\n`);
    zip.file(dir + s + ".bky", '<xml xmlns="http://www.w3.org/1999/xhtml"></xml>');
  });
  Object.keys(assets || {}).forEach(a => zip.file("assets/" + a, assets[a]));
  return zip;
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) { console.error("FAIL: " + msg); failed++; } else console.log("ok: " + msg);
}

(async () => {
  const a = makeAia("GameA", ["Screen1", "Play"], { "logo.png": Buffer.from("A-logo"), "sfx.mp3": Buffer.from("beep") });
  const b = makeAia("GameB", ["Screen1", "Menu"], { "logo.png": Buffer.from("B-logo") });

  var merged = await Merger.merge([
    { label: "GameA", zip: a, screens: ["Screen1", "Play"], assets: ["assets/logo.png", "assets/sfx.mp3"] },
    { label: "GameB", zip: b, screens: ["Screen1"], assets: ["assets/logo.png"] }
  ], "My Merged Game!");

  const out = new JSZip();
  out.file("youngandroidproject/project.properties", merged.propertiesText);
  merged.files.forEach(f => out.file(f.path, f.data));

  const props = Merger.parseProperties(merged.propertiesText);
  assert(props.name === "MyMergedGame", "project name sanitized: " + props.name);
  assert(props.source === "../src" && props.assets === "../assets" && props.build === "../build", "properties paths valid for App Inventor import");
  assert(props.sizing === "Responsive", "carries over sizing from first project");

  const names = merged.files.map(f => f.path).sort();
  names.forEach(n => console.log("   " + n));
  assert(names.includes("src/appinventor/ai_user/MyMergedGame/Screen1.scm"), "first Screen1 keeps name");
  assert(names.filter(n => n.endsWith("Screen1.scm")).length === 2, "colliding Screen1 both survive");
  assert(names.includes("src/appinventor/ai_user/MyMergedGame/GameB_Screen1.scm"), "second Screen1 renamed with project tag");
  assert(!names.includes("assets/GameB_logo.png"), "asset never renamed (references would break)");
  assert(names.includes("assets/logo.png") && names.includes("assets/sfx.mp3"), "first logo kept, unique asset carried");

  // renamed screen's $Name rewritten inside .scm
  const renamedScm = merged.files.find(f => f.path.endsWith("GameB_Screen1.scm"));
  assert(renamedScm && renamedScm.data.includes('"$Name":"GameB_Screen1"'), "$Name rewritten in renamed .scm");

  // duplicate-asset warning emitted
  assert(merged.warnings.some(w => w.type === "asset-duplicate" && w.project === "GameB"), "duplicate asset warned, not overwritten");

  // zero screens must reject
  try {
    await Merger.merge([{ label: "x", zip: a, screens: [], assets: [] }], "Empty");
    assert(false, "should throw on zero screens");
  } catch (e) {
    assert(/at least one screen/.test(e.message), "throws when no screens selected");
  }

  // output roundtrips through inspect
  const info = Merger.inspect(out);
  assert(info.screens.length === 3, "output inspect sees 3 screens, got " + info.screens.length);
  assert(info.assets.length === 2, "output inspect sees 2 assets");

  console.log(failed ? `\n${failed} FAILURES` : "\nALL GREEN");
  process.exit(failed ? 1 : 0);
})();
