// ── ANSI Escape Code Parser ──
// Converts raw terminal output containing ANSI escape sequences into
// sanitised HTML with CSS classes for colour / weight styling.
//
// Only a small subset of SGR (Select Graphic Rendition) codes is handled —
// the ones Deno and Node actually emit for error / warning messages:
//   reset (0), bold (1), dim (2), italic (3), underline (4),
//   foreground colours 30–37 / 90–97, background colours 40–47 / 100–107.
//
// The output uses CSS classes (.ansi-bold, .ansi-red, .ansi-bg-red, …)
// whose colours are defined in ansi.css via Open Props tokens so they
// adapt to the current light / dark theme.
//
// Ref: ANSI escape codes — https://en.wikipedia.org/wiki/ANSI_escape_code#SGR
// Ref: Deno colours    — https://deno.land/std/fmt/colors.ts
window.pd = window.pd || {};

(function (pd) {
  "use strict";

  // ── Colour name lookup tables ──
  // Standard (30–37) and bright (90–97) foreground colours.
  // Background equivalents are offset by 10 (40–47, 100–107).
  var FG_STANDARD = {
    30: "black", 31: "red",     32: "green", 33: "yellow",
    34: "blue",  35: "magenta", 36: "cyan",  37: "white"
  };
  var FG_BRIGHT = {
    90: "bright-black", 91: "bright-red",     92: "bright-green", 93: "bright-yellow",
    94: "bright-blue",  95: "bright-magenta", 96: "bright-cyan",  97: "bright-white"
  };
  var BG_STANDARD = {
    40: "black", 41: "red",     42: "green", 43: "yellow",
    44: "blue",  45: "magenta", 46: "cyan",  47: "white"
  };
  var BG_BRIGHT = {
    100: "bright-black", 101: "bright-red",     102: "bright-green", 103: "bright-yellow",
    104: "bright-blue",  105: "bright-magenta", 106: "bright-cyan",  107: "bright-white"
  };

  // ── HTML entity escaping ──
  // Prevents XSS when the raw output contains user-supplied text that might
  // include `<`, `>`, `&`, or `"`.
  // Ref: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
  var ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
  function esc(s) {
    return s.replace(/[&<>"]/g, function (ch) { return ESC_MAP[ch]; });
  }

  // ── Core parser ──
  // Regex matches a single CSI SGR sequence: ESC[ <params> m
  // where <params> is a semicolon-separated list of decimal numbers.
  // Ref: https://en.wikipedia.org/wiki/ANSI_escape_code#CSI_(Control_Sequence_Introducer)_sequences
  var CSI_RE = /\x1b\[([0-9;]*)m/g;

  /**
   * Convert a string containing ANSI escape codes to sanitised HTML.
   *
   * @param {string} raw  — the raw terminal output string
   * @returns {string}    — HTML string safe for use with m.trust()
   */
  pd.ansiToHtml = function (raw) {
    if (!raw) return "";

    // Fast path: if there are no escape sequences at all, skip parsing
    // and return the HTML-escaped plain text immediately.
    if (raw.indexOf("\x1b") === -1) return esc(raw);

    // Active style state — accumulated from SGR params until a reset.
    var bold      = false;
    var dim       = false;
    var italic    = false;
    var underline = false;
    var fg        = null;   // e.g. "red", "bright-cyan"
    var bg        = null;   // e.g. "bg-yellow"

    // Walk through the string, splitting on CSI sequences.
    var out   = "";
    var last  = 0;          // index past the previous match
    var match;

    CSI_RE.lastIndex = 0;   // reset regex state (global flag)
    while ((match = CSI_RE.exec(raw)) !== null) {
      // Emit any plain text *before* this escape sequence, wrapped in
      // an HTML <span> carrying the current style classes (if any).
      var text = raw.substring(last, match.index);
      if (text) {
        out += wrapSpan(esc(text), bold, dim, italic, underline, fg, bg);
      }
      last = CSI_RE.lastIndex;

      // Parse the semicolon-separated SGR parameters.
      // An empty parameter string (e.g. `ESC[m`) is equivalent to reset (0).
      var params = match[1] ? match[1].split(";") : ["0"];
      for (var i = 0; i < params.length; i++) {
        var code = parseInt(params[i], 10) || 0;

        if (code === 0) {
          // SGR 0 — full reset
          bold = dim = italic = underline = false;
          fg = bg = null;
        } else if (code === 1)  { bold      = true;
        } else if (code === 2)  { dim       = true;
        } else if (code === 3)  { italic    = true;
        } else if (code === 4)  { underline = true;
        } else if (code === 22) { bold = dim = false;       // "normal intensity"
        } else if (code === 23) { italic    = false;
        } else if (code === 24) { underline = false;
        } else if (code === 39) { fg = null;                // default foreground
        } else if (code === 49) { bg = null;                // default background
        } else if (FG_STANDARD[code]) { fg = FG_STANDARD[code];
        } else if (FG_BRIGHT[code])   { fg = FG_BRIGHT[code];
        } else if (BG_STANDARD[code]) { bg = BG_STANDARD[code];
        } else if (BG_BRIGHT[code])   { bg = BG_BRIGHT[code];
        }
        // All other codes (cursor movement, 256-colour, true-colour, etc.)
        // are silently ignored — they don't appear in typical Deno output.
      }
    }

    // Emit any remaining plain text after the last escape sequence.
    var tail = raw.substring(last);
    if (tail) {
      out += wrapSpan(esc(tail), bold, dim, italic, underline, fg, bg);
    }

    return out;
  };

  // ── wrapSpan (internal) ──
  // Wraps escaped text in a <span> if any style flags are active.
  // Returns plain text (no wrapper) when there are no active styles.
  function wrapSpan(html, bold, dim, italic, underline, fg, bg) {
    var classes = [];
    if (bold)      classes.push("ansi-bold");
    if (dim)       classes.push("ansi-dim");
    if (italic)    classes.push("ansi-italic");
    if (underline) classes.push("ansi-underline");
    if (fg)        classes.push("ansi-" + fg);
    if (bg)        classes.push("ansi-bg-" + bg);

    if (classes.length === 0) return html;
    return '<span class="' + classes.join(" ") + '">' + html + "</span>";
  }
})(window.pd);
