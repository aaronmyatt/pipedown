// Shared collapsible JSON tree viewer component (Mithril)
// Usage: pd.jsonTree(data, rootPath)
window.pd = window.pd || {};

(function(pd) {
  var jtOpen = {};

  function jtId(path, key) { return path ? path + "." + key : "" + key; }

  function jtPreview(val) {
    if (val === null) return "null";
    if (Array.isArray(val)) return "[" + val.length + " items]";
    if (typeof val === "object") {
      var keys = Object.keys(val);
      if (keys.length === 0) return "{}";
      if (keys.length <= 3) return "{ " + keys.join(", ") + " }";
      return "{ " + keys.slice(0, 3).join(", ") + ", +" + (keys.length - 3) + " }";
    }
    var s = JSON.stringify(val);
    return s.length > 60 ? s.slice(0, 57) + "..." : s;
  }

  function jtValue(val) {
    if (val === null) return m("span.jt-null", "null");
    if (typeof val === "string") return m("span.jt-string", '"' + val + '"');
    if (typeof val === "number") return m("span.jt-number", "" + val);
    if (typeof val === "boolean") return m("span.jt-bool", "" + val);
    return m("span.jt-string", "" + val);
  }

  function jtNode(key, val, path, defaultOpen) {
    var id = jtId(path, key);
    var isObj = val !== null && typeof val === "object";

    if (!isObj) {
      return m("div.jt-row", [
        m("span.jt-toggle", ""),
        key !== null ? [m("span.jt-key", "" + key), m("span.jt-colon", ":")] : null,
        jtValue(val)
      ]);
    }

    var isArr = Array.isArray(val);
    var entries = isArr ? val.map(function(v, i) { return [i, v]; }) : Object.entries(val);
    var open = jtOpen[id] !== undefined ? jtOpen[id] : !!defaultOpen;

    if (!open) {
      return m("div.jt-row.jt-clickable", { onclick: function() { jtOpen[id] = true; } }, [
        m("span.jt-toggle", "\u25B8"),
        key !== null ? [m("span.jt-key", "" + key), m("span.jt-colon", ":")] : null,
        m("span.jt-preview", isArr ? "[" + val.length + " items]" : jtPreview(val))
      ]);
    }

    return m("div", [
      m("div.jt-row.jt-clickable", { onclick: function() { jtOpen[id] = false; } }, [
        m("span.jt-toggle", "\u25BE"),
        key !== null ? [m("span.jt-key", "" + key), m("span.jt-colon", ":")] : null,
        m("span.jt-bracket", isArr ? "[" : "{")
      ]),
      m("div.jt-children", entries.map(function(pair) {
        return jtNode(pair[0], pair[1], id, false);
      })),
      m("div.jt-row", m("span.jt-bracket", isArr ? "]" : "}"))
    ]);
  }

  function jsonTree(data, rootPath) {
    if (data === null || typeof data !== "object") return jtValue(data);
    var isArr = Array.isArray(data);
    var entries = isArr ? data.map(function(v, i) { return [i, v]; }) : Object.entries(data);
    return m("div.jt", entries.map(function(pair) {
      return jtNode(pair[0], pair[1], rootPath || "root", false);
    }));
  }

  pd.jtOpen = jtOpen;
  pd.jsonTree = jsonTree;
})(window.pd);
