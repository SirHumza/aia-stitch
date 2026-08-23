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

async function loadProject(file, card) {
  if (!file) return;
  if (!/\.aia$/i.test(file.name)) { log("Skipped " + file.name + " (only .aia files)", "err"); return; }
  log("Loading " + file.name + "...");
  try {
    var zip = await JSZip.loadAsync(file);
    var info = Merger.inspect(zip);
    var p = projects.find(function (x) { return x.card === card; });
    p.zip = zip;
    p.screens = info.screens;
    p.assets = info.assets;

    card.classList.add("loaded");
    var body = card.querySelector(".pbody");
    body.style.display = "";

    body.innerHTML =
      '<div class="phead">' +
        '<span class="pname"></span><span class="grow"></span>' +
        '<span class="pmeta"></span>' +
        '<button class="iconbtn" title="Remove project"><i data-lucide="trash-2"></i></button>' +
      "</div>" +
      '<div class="grouplabel"><i data-lucide="layout-template"></i>Screens</div><div class="pills"></div>' +
      '<details class="assets"><summary><i data-lucide="chevron-right"></i>Assets (<span class="acount">0</span>)</summary><div class="assetlist"></div></details>';

    body.querySelector(".pname").textContent = file.name.replace(/\.aia$/i, "");
    body.querySelector(".pmeta").textContent =
      info.screens.length + " screens · " + info.assets.length + " assets · " + fmtSize(file.size);
    body.querySelector(".iconbtn").addEventListener("click", function () {
      projects = projects.filter(function (x) { return x.card !== card; });
      card.remove();
      log("Removed project.");
      refreshTally();
    });

    var pills = body.querySelector(".pills");
    if (!info.screens.length) pills.innerHTML = '<span class="none-note">no screens found</span>';
    info.screens.forEach(function (s) {
      var pill = el(
        '<label class="pill"><input type="checkbox" checked data-kind="screen" data-name=""></label>');
      pill.querySelector("input").dataset.name = s.name;
      pill.appendChild(document.createElement("span")).textContent = s.name;
      pill.querySelector("input").addEventListener("change", refreshTally);
      pills.appendChild(pill);
    });

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
    });
    log("Merged " + result.screenCount + " screen(s), " + result.files.length + " files into " + name + ".aia", "ok");

    var res = document.getElementById("result");
    res.innerHTML =
      '<div class="row info"><i data-lucide="check-circle-2"></i><span>Downloaded <code>' + name + '.aia</code> — ' +
        result.screenCount + " screens, " + result.files.length + " files. Import via Projects → Import (.aia).</span></div>";
    result.warnings.slice(0, 4).forEach(function (w) {
      var text = w.type === "asset-duplicate"
        ? "<code>" + w.skipped + "</code> skipped — <code>" + w.kept + "</code> already exists"
        : "<code>" + w.from + "</code> → <code>" + w.to + "</code>";
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
