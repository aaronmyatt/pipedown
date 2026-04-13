// ── Hash Router ──
// Lightweight URL-hash state manager for the Pipedown dashboard.
// Encodes selection state into the URL hash so that the user's current
// view (selected pipe, project, trace) survives page refreshes and can
// be bookmarked or shared.
//
// Uses the fragment identifier (everything after `#`) rather than
// query parameters or pushState so that the server never sees the routing
// state — it stays entirely client-side.
//
// Hash format: `#/segment1/segment2/...`
// Each segment is URI-encoded to safely handle special characters in
// project names, pipe paths, and timestamps.
//
// Ref: https://developer.mozilla.org/en-US/docs/Web/API/URL/hash
// Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent

(function () {
  // ── Namespace ──
  // All hash-routing helpers live under `window.pd.hashRouter` so they
  // don't pollute the global scope. The `window.pd` namespace is shared
  // with other utilities (jsonTree, relativeTime, theme).
  globalThis.pd = globalThis.pd || {};

  globalThis.pd.hashRouter = {
    // ── getSegments ──
    // Parses the current URL hash into an array of decoded path segments.
    // Strips the leading `#/` prefix and splits on `/`.
    //
    // Examples:
    //   "#/my-project/pipe.md"  → ["my-project", "pipe.md"]
    //   "#/"                     → []
    //   ""                       → []
    //
    // @return {string[]} — decoded segments (empty array if no hash)
    // Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/decodeURIComponent
    getSegments: function () {
      const hash = globalThis.location.hash;
      // No hash or just "#" or "#/" — nothing selected
      if (!hash || hash === "#" || hash === "#/") return [];
      // Strip leading "#/" then split on "/"
      const raw = hash.slice(2); // remove "#/"
      if (!raw) return [];
      return raw.split("/").map(function (s) {
        try {
          return decodeURIComponent(s);
        } catch (_e) {
          // Malformed URI component — return raw string as fallback
          return s;
        }
      });
    },

    // ── setSegments ──
    // Writes an array of values into the URL hash as encoded path segments.
    // Uses `history.replaceState` instead of setting `location.hash` directly
    // to avoid polluting the browser's back/forward history with every
    // selection change. The user can still bookmark the URL.
    //
    // @param {string[]} segments — values to encode into the hash
    // Ref: https://developer.mozilla.org/en-US/docs/Web/API/History/replaceState
    setSegments: function (segments) {
      if (!segments || segments.length === 0) {
        // Clear the hash entirely — replaceState with just the pathname
        // removes the trailing "#" from the URL bar.
        history.replaceState(
          null,
          "",
          globalThis.location.pathname + globalThis.location.search,
        );
        return;
      }
      const encoded = segments.map(function (s) {
        return encodeURIComponent(s);
      });
      history.replaceState(null, "", "#/" + encoded.join("/"));
    },

    // ── clear ──
    // Removes the hash from the URL. Convenience wrapper around setSegments([]).
    clear: function () {
      this.setSegments([]);
    },

    // ── onHashChange ──
    // Registers a callback that fires whenever the hash changes (e.g. when
    // the user navigates with browser back/forward buttons). Returns an
    // unsubscribe function to clean up the listener.
    //
    // @param {Function} callback — called with no arguments on hash change
    // @return {Function} — call this to remove the listener
    // Ref: https://developer.mozilla.org/en-US/docs/Web/API/Window/hashchange_event
    onHashChange: function (callback) {
      globalThis.addEventListener("hashchange", callback);
      return function () {
        globalThis.removeEventListener("hashchange", callback);
      };
    },
  };
})();
