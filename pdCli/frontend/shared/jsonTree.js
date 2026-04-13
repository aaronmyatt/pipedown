// Shared collapsible JSON tree viewer component (Mithril)
// Usage: pd.jsonTree(data, rootPath)
//
// Expansion state is persisted to localStorage so that expanded/collapsed
// nodes survive page reloads and back-navigation. Each node's path
// (e.g. "tab-input.steps.0.name") becomes a key in the `jtOpen` map.
// Writes are debounced to avoid thrashing localStorage on rapid clicks.
// Ref: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
globalThis.pd = globalThis.pd || {};

function agnosticEntries(obj) {
  if (obj === null || typeof obj !== "object") return [];
  if (Array.isArray(obj)) {
    return obj.map(function (v, i) {
      return [i, v];
    });
  }
  return Object.entries(obj);
}

(function (pd) {
  // ── Storage key & restore ──
  // Restore previously saved expansion state from localStorage.
  // Falls back to an empty object on first visit or when storage is
  // unavailable (private browsing, quota exceeded, etc.).
  const STORAGE_KEY = "pd-jt-open";
  const jtOpen = (function () {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
    return {};
  })();

  // A 300 ms debounce batches writes
  // Ref: https://developer.mozilla.org/en-US/docs/Web/API/setTimeout
  let _saveTimer = null;
  function persistJtOpen() {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function () {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(jtOpen));
    }, 300);
  }
  function expandRow(id) {
    jtOpen[id] = true;
    persistJtOpen();
  }
  function collapseRow(id) {
    jtOpen[id] = false;
    persistJtOpen();
  }
  function jtId(path, key) {
    return path ? path + "." + key : "" + key;
  }

  /*
  Decides how to preview a collapsed node based on its type and content.
  For arrays and objects, show the number of items or a truncated list of keys.
  For primitives, show a truncated JSON string.
  */
  function jtPreview(val) {
    if (val === null) return "null";
    if (Array.isArray(val)) return "[" + val.length + " items]";
    if (typeof val === "object") {
      const keys = Object.keys(val);
      if (keys.length === 0) return "{}";
      if (keys.length <= 3) return "{ " + keys.join(", ") + " }";
      return "{ " + keys.slice(0, 3).join(", ") + ", +" + (keys.length - 3) +
        " }";
    }
    const s = JSON.stringify(val);
    return s.length > 60 ? s.slice(0, 57) + "..." : s;
  }

  function jtValue(val) {
    if (val === null) return m("span.jt-null", "null");
    if (typeof val === "string") return m("span.jt-string", '"' + val + '"');
    if (typeof val === "number") return m("span.jt-number", "" + val);
    if (typeof val === "boolean") return m("span.jt-bool", "" + val);
    return m("span.jt-string", "" + val);
  }

  function jtNode(key, val, path) {
    const id = jtId(path, key);
    const isObj = val !== null && typeof val === "object";

    if (!isObj) {
      return m(".jt-row", [
        m("span.jt-toggle", ""),
        key ? [m("span.jt-key", "" + key), m("span.jt-colon", ":")] : null,
        jtValue(val),
      ]);
    }

    const open = jtOpen[id];

    if (!open) {
      return m(".jt-row.jt-clickable", { onclick: (_e) => expandRow(id) }, [
        m("span.jt-toggle", "\u25B8"),
        key ? [m("span.jt-key", "" + key), m("span.jt-colon", ":")] : null,
        m("span.jt-preview", jtPreview(val)),
      ]);
    }

    const isArr = Array.isArray(val);
    const entries = agnosticEntries(val).map((pair) =>
      jtNode(pair[0], pair[1], id)
    );
    return m("div", [
      m(".jt-row.jt-clickable", { onclick: (_e) => collapseRow(id) }, [
        m("span.jt-toggle", "\u25BE"),
        key ? [m("span.jt-key", "" + key), m("span.jt-colon", ":")] : null,
        m("span.jt-bracket", isArr ? "[" : "{"),
      ]),
      m(".jt-children", entries),
      m(".jt-row", m("span.jt-bracket", isArr ? "]" : "}")),
    ]);
  }

  function jsonTree(data, rootPath) {
    if (data === null || typeof data !== "object") return jtValue(data);
    const entries = agnosticEntries(data).map((pair) =>
      jtNode(pair[0], pair[1], rootPath || "root")
    );
    return m(".jt", entries);
  }

  pd.jtOpen = jtOpen;
  pd.jsonTree = jsonTree;
})(globalThis.pd);
