/* App Inventor Fusion — UI layer. Merge logic lives in merger.js (shared with Node tests). */
"use strict";

var projects = [];
var uid = 0;

function el(html) {
  var t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function fmtSize(bytes) {
  if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + " MB";
  if (bytes > 1024) return Math.round(bytes / 1024) + " KB";
  return bytes + " B";
}

function log(msg, level) {
  var line = el('<p class="' + (level || "") + '"><span class="dot"></span><time>' +
    new Date().toTimeString().slice(0, 8) + '</time><span></span></p>');
  line.lastChild.textContent = msg;
  var box = document.getElementById("log");
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function icons() { if (window.lucide) lucide.createIcons(); }

/* ---------- project cards ---------- */

function addProject() {
  var id = "p" + (++uid);
  var card = el(
    '<div class="pcard" id="' + id + '">' +
      '<label class="drop"><i data-lucide="file-archive"></i>Drop an <b>.aia</b> here or click to browse' +
        '<input type="file" accept=".aia" class="visually-hidden">' +
      "</label>" +
      '<div class="pbody" style="display:none"></div>' +
    "</div>");
  card.querySelector("input").addEventListener("change", function (e) {
    loadProject(e.target.files[0], card);
    e.target.value = "";
  });
  document.getElementById("stack").appendChild(card);
  projects.push({ id: id, card: card, zip: null, screens: [], assets: [] });
  icons();
}

function assetBase(path) { return path.split("/").pop(); }

/* "4 components: Button, Canvas, Clock +1 more" from a screen's .scm, or null. */
async function describeScreen(zip, screen) {
  try {
    var f = zip.file(screen.scmPath);
    if (!f) return null;
    var parsed = Merger.parseScm(await f.async("string"));
    if (!parsed.ok) return null;
    var comps = Merger.componentList(parsed.json); // children of the screen
    if (!comps.length) return "empty screen";
    var kids = comps.map(function (c) { return c.type; });
    if (!kids.length) return "empty screen";
    var shown = kids.slice(0, 4);
    var extra = kids.length - shown.length;
    return kids.length + " component" + (kids.length > 1 ? "s" : "") + ": " +
      shown.join(", ") + (extra > 0 ? " +" + extra + " more" : "");
  } catch (err) {
    return null;
  }
}

async function loadProject(file, card) {
  if (!file) return;
  if (!/\.aia$/i.test(file.name)) { log("Skipped " + file.name + " (only .aia files)", "err"); return; }
  var dupe = projects.find(function (p) {
    return p.zip && p.label === file.name.replace(/\.aia$/i, "") && p.size === file.size;
  });
  if (dupe) { log("Skipped " + file.name + " (already loaded)", "warn"); return; }
  log("Loading " + file.name + "...");
  try {
    var zip = await JSZip.loadAsync(file);
    var info = Merger.inspect(zip);
    var p = projects.find(function (x) { return x.card === card; });
    p.zip = zip;
    p.size = file.size;
    p.screens = info.screens;
    p.assets = info.assets;

    card.classList.add("loaded");
    var body = card.querySelector(".pbody");
    body.style.display = "";

    body.innerHTML =
      '<div class="phead">' +
        '<span class="pname"></span><span class="grow"></span>' +
        '<span class="pmeta"></span>' +
        '<button class="iconbtn mv" data-dir="-1" title="Move up (keeps original names)"><i data-lucide="arrow-up"></i></button>' +
        '<button class="iconbtn mv" data-dir="1" title="Move down"><i data-lucide="arrow-down"></i></button>' +
        '<button class="iconbtn rm" title="Remove project"><i data-lucide="trash-2"></i></button>' +
      "</div>" +
      '<div class="grouplabel"><i data-lucide="layout-template"></i>Screens' +
        '<span class="grow"></span>' +
        '<button class="iconbtn sel-all" title="Select all screens"><i data-lucide="check-check"></i></button>' +
        '<button class="iconbtn sel-none" title="Deselect all screens"><i data-lucide="square"></i></button>' +
      "</div><div class=\"pills\"></div>" +
      '<details class="assets"><summary><i data-lucide="chevron-right"></i>Assets (<span class="acount">0</span>)</summary><div class="assetlist"></div></details>';

    body.querySelector(".pname").textContent = file.name.replace(/\.aia$/i, "");
    body.querySelector(".pmeta").textContent =
      info.screens.length + " screens · " + info.assets.length + " assets · " + fmtSize(file.size);
    body.querySelector(".rm").addEventListener("click", function () {
      projects = projects.filter(function (x) { return x.card !== card; });
      card.remove();
      log("Removed project.");
      refreshTally();
    });
    Array.prototype.forEach.call(body.querySelectorAll(".mv"), function (btn) {
      btn.addEventListener("click", function () { moveProject(card, Number(btn.dataset.dir)); });
    });
    body.querySelector(".sel-all").addEventListener("click", function () { setAllScreens(card, true); });
    body.querySelector(".sel-none").addEventListener("click", function () { setAllScreens(card, false); });

    var pills = body.querySelector(".pills");
    if (!info.screens.length) pills.innerHTML = '<span class="none-note">no screens found</span>';
    for (var si = 0; si < info.screens.length; si++) {
      var s = info.screens[si];
      var pill = el(
        '<label class="pill"><input type="checkbox" checked data-kind="screen" data-name=""></label>');
      pill.querySelector("input").dataset.name = s.name;
      var span = pill.appendChild(document.createElement("span"));
      span.textContent = s.name;
      var summary = await describeScreen(zip, s);
      if (summary) {
        pill.title = summary;
        span.style.borderStyle = "solid";
      }
      pill.querySelector("input").addEventListener("change", refreshTally);
      pills.appendChild(pill);
    }

    body.querySelector(".acount").textContent = info.assets.length;
    var list = body.querySelector(".assetlist");
    if (!info.assets.length) list.innerHTML = '<span class="none-note">none</span>';
    info.assets.forEach(function (a) {
      var row = el(
        '<label class="assetrow"><input type="checkbox" checked data-kind="asset"><code></code></label>');
      row.querySelector("input").dataset.name = a;
      row.querySelector("code").textContent = assetBase(a);
      row.querySelector("input").addEventListener("change", refreshTally);
      list.appendChild(row);
    });

    icons();
    refreshTally();
    log("Loaded " + file.name + ": " + info.screens.length + " screen(s), " + info.assets.length + " asset(s).", "ok");
  } catch (err) {
    log("Could not read " + file.name + ": " + err.message, "err");
  }
}

/* ---------- selection + tally ---------- */

function setAllScreens(card, on) {
  Array.prototype.forEach.call(card.querySelectorAll('input[data-kind="screen"]'), function (cb) {
    cb.checked = on;
  });
  refreshTally();
}

/* Reorder projects (order decides who keeps canonical names in a collision). */
function moveProject(card, dir) {
  var i = projects.findIndex(function (p) { return p.card === card; });
  var j = i + dir;
  if (j < 0 || j >= projects.length) return;
  var tmp = projects[i];
  projects[i] = projects[j];
  projects[j] = tmp;
  card.parentNode.insertBefore(projects[i].card, projects[j].card);
  log("Order changed: " + projects.map(function (p) { return p.label || "?"; }).join(" → "));
}

function currentSelections() {
  var loaded = projects.filter(function (p) { return p.zip; });
  return loaded.map(function (p) {
    var assetsSel = Array.prototype.slice.call(p.card.querySelectorAll('input[data-kind="asset"]:checked'))
      .map(function (cb) { return cb.dataset.name; });
    var screensSel = Array.prototype.slice.call(p.card.querySelectorAll('input[data-kind="screen"]:checked'))
      .map(function (cb) { return cb.dataset.name; });
    return { label: p.label || "project", zip: p.zip, screens: screensSel, assets: assetsSel };
  });
}

function refreshTally() {
  var sel = currentSelections();
  var nScreens = sel.reduce(function (n, s) { return n + s.screens.length; }, 0);
  var nAssets = sel.reduce(function (n, s) { return n + s.assets.length; }, 0);
  document.getElementById("tProjects").textContent = sel.length;
  document.getElementById("tScreens").textContent = nScreens;
  document.getElementById("tAssets").textContent = nAssets;
  var btn = document.getElementById("mergeBtn");
  btn.disabled = !(sel.length >= 2 && nScreens > 0);
  btn.title = btn.disabled ? "Add at least two projects and keep one screen selected" : "";
}

/* ---------- merge ---------- */

async function mergeProjects() {
  var btn = document.getElementById("mergeBtn");
  btn.classList.add("busy");
  btn.innerHTML = '<i data-lucide="loader-circle"></i>Merging…';
  icons();

  try {
    var result = await Merger.merge(currentSelections(), document.getElementById("projectName").value);

    var out = new JSZip();
    out.file("youngandroidproject/project.properties", result.propertiesText);
    result.files.forEach(function (f) { out.file(f.path, f.data); });
    var blob = await out.generateAsync({ type: "blob", compression: "DEFLATE" });

    var name = Merger.parseProperties(result.propertiesText).name;
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name + ".aia";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);

    result.warnings.forEach(function (w) {
      if (w.type === "asset-duplicate")
        log("Duplicate asset '" + w.kept + "' in " + w.project + " skipped (first copy kept)", "warn");
      else if (w.type === "screen-renamed")
        log(w.project + ": screen '" + w.from + "' renamed to '" + w.to + "'", "warn");
      else if (w.type === "screen-rename-check")
        log(w.project + ": '" + w.to + "' uses 'open another screen' — check its targets after import", "warn");
    });
    log("Merged " + result.screenCount + " screen(s), " + result.files.length + " files into " + name + ".aia", "ok");

    var res = document.getElementById("result");
    res.innerHTML =
      '<div class="row info"><i data-lucide="check-circle-2"></i><span>Downloaded <code>' + name + '.aia</code> — ' +
        result.screenCount + " screens, " + result.files.length + " files. Import via Projects → Import (.aia).</span></div>";
    result.warnings.slice(0, 5).forEach(function (w) {
      var text;
      if (w.type === "asset-duplicate")
        text = "<code>" + w.skipped + "</code> skipped — <code>" + w.kept + "</code> already exists";
      else if (w.type === "screen-rename-check")
        text = "<code>" + w.to + "</code> uses <em>open another screen</em>, verify targets after import";
      else
        text = "<code>" + w.from + "</code> → <code>" + w.to + "</code>";
      var row = el('<div class="row warn"><i data-lucide="triangle-alert"></i><span>' + text + "</span></div>");
      res.appendChild(row);
    });
    icons();

    btn.classList.add("done");
    btn.innerHTML = '<i data-lucide="party-popper"></i>Fused!';
    icons();
    setTimeout(function () {
      btn.classList.remove("done");
      btn.innerHTML = '<i data-lucide="git-merge"></i>Merge projects';
      icons();
      refreshTally();
    }, 2600);
  } catch (err) {
    log("Merge failed: " + err.message, "err");
    btn.innerHTML = '<i data-lucide="git-merge"></i>Merge projects';
  } finally {
    btn.classList.remove("busy");
    icons();
    refreshTally();
  }
}

/* ---------- drag & drop anywhere ---------- */

var dragDepth = 0;
window.addEventListener("dragenter", function (e) {
  if (Array.prototype.includes.call(e.dataTransfer.types, "Files") && ++dragDepth === 1)
    document.getElementById("dragveil").classList.add("on");
});
window.addEventListener("dragleave", function () {
  if (--dragDepth <= 0) { dragDepth = 0; document.getElementById("dragveil").classList.remove("on"); }
});
window.addEventListener("dragover", function (e) { e.preventDefault(); });
window.addEventListener("drop", function (e) {
  e.preventDefault();
  dragDepth = 0;
  document.getElementById("dragveil").classList.remove("on");
  Array.prototype.forEach.call(e.dataTransfer.files, function (f) {
    var empty = projects.find(function (p) { return !p.zip; });
    if (empty) loadProject(f, empty.card);
    else { addProject(); loadProject(f, projects[projects.length - 1].card); }
  });
});

/* ---------- boot ---------- */
document.getElementById("addBtn").addEventListener("click", addProject);
addProject();
addProject();
refreshTally();
icons();
