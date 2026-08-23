/*
 * merger.js - pure .aia merge logic (no DOM), usable from browser and Node.
 * An .aia is a zip: youngandroidproject/project.properties,
 * src/appinventor/ai_<user>/<Project>/*.scm|.bky, assets/*
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Merger = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SCREEN_RE = /^src\/(.+)\/([^/]+)\.scm$/;

  function parseProperties(text) {
    var out = {};
    text.split(/\r?\n/).forEach(function (line) {
      line = line.trim();
      if (!line || line.charAt(0) === "#") return;
      var eq = line.indexOf("=");
      if (eq > 0) out[line.slice(0, eq)] = line.slice(eq + 1);
    });
    return out;
  }

  function serializeProperties(props) {
    return Object.keys(props)
      .map(function (k) { return k + "=" + props[k]; })
      .join("\n") + "\n";
  }

  // List screens/assets of a JSZip instance.
  function inspect(zip) {
    var result = { properties: {}, screens: [], assets: [] };
    var seenAsset = {};
    zip.forEach(function (path, file) {
      if (file.dir) return;
      if (path === "youngandroidproject/project.properties") return; // handled below
      var m = SCREEN_RE.exec(path);
      if (m) {
        result.screens.push({ name: m[2], scmPath: path, bkyPath: "src/" + m[1] + "/" + m[2] + ".bky" });
        return;
      }
      if (path.indexOf("assets/") === 0 && !seenAsset[path]) {
        seenAsset[path] = true;
        result.assets.push(path);
      }
    });
    return result;
  }

  function sanitize(s) {
    return String(s).replace(/[^A-Za-z0-9_]/g, "").slice(0, 20) || "Proj";
  }

  /*
   * projects: [{ zip, screens: [screenName...], assets: [assetPath...] }]
   * Returns { files, propertiesText, warnings, screenCount } for the caller to zip up.
   */
  async function merge(projects, projectName) {
    var name = sanitize(projectName) || "MergedProject";
    var usedScreens = {};
    var usedAssets = {};
    var files = [];
    var warnings = [];
    var screenCount = 0;

    var baseProps = null;
    for (var pi = 0; pi < projects.length; pi++) {
      var pf = projects[pi].zip ? projects[pi].zip.file("youngandroidproject/project.properties") : null;
      if (pf) { baseProps = parseProperties(await pf.async("string")); break; }
    }
    baseProps = baseProps || {};

    for (var i = 0; i < projects.length; i++) {
      var p = projects[i];
      var info = p.zip ? inspect(p.zip) : { screens: [], assets: [] };
      var selectedScreens = info.screens.filter(function (s) { return p.screens.indexOf(s.name) >= 0; });
      var selectedAssets = info.assets.filter(function (a) { return p.assets.indexOf(a) >= 0; });

      var tag = null;
      var index = i;
      function uniqueScreen(screenName) {
        if (!usedScreens[screenName]) { usedScreens[screenName] = true; return screenName; }
        if (!tag) tag = sanitize(p.label || "P" + (index + 1));
        var candidate = tag + "_" + screenName;
        while (usedScreens[candidate]) candidate += "_";
        usedScreens[candidate] = true;
        return candidate;
      }

      for (var s = 0; s < selectedScreens.length; s++) {
        var scr = selectedScreens[s];
        var newName = uniqueScreen(scr.name);
        var dir = "src/appinventor/ai_user/" + name + "/";
        var scm = p.zip.file(scr.scmPath);
        if (scm) {
          // Keep the form name inside .scm in sync with the renamed file
          var text = await scm.async("string");
          if (newName !== scr.name) {
            text = text.replace('"$Name":"' + scr.name + '"', '"$Name":"' + newName + '"');
            warnings.push({ type: "screen-renamed", from: scr.name, to: newName, project: p.label });
          }
          files.push({ path: dir + newName + ".scm", data: text });
        }
        var bky = p.zip.file(scr.bkyPath);
        // A missing or non-XML .bky can trip App Inventor's importer; fall back
        var bkyText = bky ? await bky.async("string") : "";
        if (bkyText.indexOf("<xml") === -1) {
          bkyText = '<xml xmlns="http://www.w3.org/1999/xhtml"></xml>';
        }

        // "open another screen" stores targets as plain strings we cannot
        // safely rewrite, so flag projects whose renamed screens use it.
        if (newName !== scr.name && bky) {
          var bkyText = await bky.async("string");
          if (/openanother/i.test(bkyText)) {
            warnings.push({ type: "screen-rename-check", from: scr.name, to: newName, project: p.label });
          }
        }

        files.push({ path: dir + newName + ".bky", data: bkyText });
        screenCount++;
      }

      for (var a = 0; a < selectedAssets.length; a++) {
        var assetPath = selectedAssets[a];
        var base = assetPath.split("/").pop();
        // Never rename assets: screens/blocks reference them by filename.
        // On collision keep the first copy and warn instead of silently overwriting.
        if (usedAssets[base]) {
          warnings.push({ type: "asset-duplicate", kept: base, skipped: assetPath, project: p.label });
          continue;
        }
        usedAssets[base] = true;
        var af = p.zip.file(assetPath);
        if (af) files.push({ path: "assets/" + base, data: await af.async("uint8array") });
      }
    }

    if (screenCount === 0) throw new Error("Select at least one screen across all projects.");

    baseProps.name = name;
    baseProps.assets = "../assets";
    baseProps.source = "../src";
    baseProps.build = "../build";
    if (!baseProps.versioncode) baseProps.versioncode = "1";
    if (!baseProps.versionname) baseProps.versionname = "1.0";

    return { files: files, propertiesText: serializeProperties(baseProps), warnings: warnings, screenCount: screenCount };
  }

  return {
    inspect: inspect,
    merge: merge,
    parseProperties: parseProperties,
    serializeProperties: serializeProperties,
    parseScm: parseScm,
    componentList: componentList
  };

  /* Parse a .scm file body into its JSON object. Returns {ok, json|error}. */
  function parseScm(scmText) {
    try {
      var m = /\$JSON\s*([\s\S]*?)\|#/.exec(scmText);
      if (!m) return { ok: false, error: "no $JSON section" };
      return { ok: true, json: JSON.parse(m[1].trim()) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /* Flatten the component tree of a parsed .scm into [{type, name}]. */
  function componentList(scmJson) {
    var out = [];
    function walk(components) {
      if (!components) return;
      components.forEach(function (c) {
        out.push({ type: c["$Type"] || "?", name: c["$Name"] || "?" });
        if (c["$Components"]) walk(c["$Components"]);
      });
    }
    if (scmJson && scmJson.Properties) walk(scmJson.Properties["$Components"]);
    return out;
  }
});
