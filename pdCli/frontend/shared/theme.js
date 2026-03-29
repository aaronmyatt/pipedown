// ── Theme Manager ──
// Manages light/dark theme switching via a [data-theme] attribute on <html>.
// Runs synchronously in <head> to avoid a flash of wrong theme on page load.
//
// Three modes:
//   "auto"  — follow OS / browser preference (matchMedia)
//   "light" — always light
//   "dark"  — always dark
//
// Persists the user's choice to localStorage under the key "pd-theme".
// Exposes window.pd.theme = { current, preference, toggle, set } for use
// by topbar toggle buttons in Layout components.
//
// Ref: matchMedia — https://developer.mozilla.org/en-US/docs/Web/API/Window/matchMedia
// Ref: data attributes — https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/dataset

(function() {
  "use strict";

  // ── Constants ──
  var STORAGE_KEY = "pd-theme";
  // The three valid preference values the user can cycle through
  var MODES = ["auto", "light", "dark"];

  // ── System preference query ──
  // Ref: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme
  var darkMq = window.matchMedia("(prefers-color-scheme: dark)");

  // ── Resolve the actual theme ("light" or "dark") from a preference string ──
  // "auto" defers to the OS media query; "light"/"dark" are used directly.
  function resolve(pref) {
    if (pref === "dark") return "dark";
    if (pref === "light") return "light";
    // "auto" or any invalid value → follow OS
    return darkMq.matches ? "dark" : "light";
  }

  // ── Apply theme to the DOM ──
  // Sets the data-theme attribute on <html> and updates the highlight.js
  // stylesheet <link> tags whose media attributes filter by color-scheme.
  // Ref: highlight.js CDN stylesheets loaded in the HTML templates
  function apply(theme) {
    document.documentElement.dataset.theme = theme;

    // Update highlight.js stylesheet media attributes so only the matching
    // theme's stylesheet is active. The links use media="(prefers-color-scheme: ...)"
    // by default — we override them to "all" / "not all" based on the active theme.
    var links = document.querySelectorAll('link[href*="highlightjs"]');
    links.forEach(function(link) {
      var href = link.getAttribute("href") || "";
      if (href.indexOf("github-dark") !== -1) {
        // Dark stylesheet — active when theme is dark
        link.media = theme === "dark" ? "all" : "not all";
      } else if (href.indexOf("github.min") !== -1) {
        // Light stylesheet — active when theme is light
        link.media = theme === "light" ? "all" : "not all";
      }
    });
  }

  // ── Read persisted preference ──
  var savedPref = null;
  try { savedPref = localStorage.getItem(STORAGE_KEY); } catch(e) { /* ignore */ }
  // Validate — fall back to "auto" if the stored value is unexpected
  if (MODES.indexOf(savedPref) === -1) savedPref = "auto";

  // ── Initial application ──
  var currentPref = savedPref;
  var currentTheme = resolve(currentPref);
  apply(currentTheme);

  // ── Listen for OS theme changes ──
  // Only relevant when preference is "auto" — re-resolve and re-apply.
  // Ref: https://developer.mozilla.org/en-US/docs/Web/API/MediaQueryList/change_event
  darkMq.addEventListener("change", function() {
    if (currentPref === "auto") {
      currentTheme = resolve("auto");
      apply(currentTheme);
    }
  });

  // ── Public API ──
  // Attached to window.pd (shared utilities namespace).
  // Layout components read pd.theme.current and call pd.theme.toggle().
  window.pd = window.pd || {};
  window.pd.theme = {
    // The resolved theme currently applied: "light" or "dark"
    get current() { return currentTheme; },

    // The user's preference: "auto", "light", or "dark"
    get preference() { return currentPref; },

    // ── set(pref) ──
    // Explicitly set the preference and persist it.
    // @param {string} pref — "auto", "light", or "dark"
    set: function(pref) {
      if (MODES.indexOf(pref) === -1) pref = "auto";
      currentPref = pref;
      currentTheme = resolve(pref);
      apply(currentTheme);
      try { localStorage.setItem(STORAGE_KEY, pref); } catch(e) { /* ignore */ }
    },

    // ── toggle() ──
    // Cycles through auto → light → dark → auto.
    // Returns the new preference string for display.
    toggle: function() {
      var idx = MODES.indexOf(currentPref);
      var next = MODES[(idx + 1) % MODES.length];
      this.set(next);
      return next;
    }
  };
})();
