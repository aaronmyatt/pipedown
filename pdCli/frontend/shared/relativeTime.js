// Shared relative time utility
// Usage: pd.relativeTime(isoString)
window.pd = window.pd || {};

pd.relativeTime = function(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  var now = new Date();
  var diffMs = now - d;
  var diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return diffMin + "m ago";
  var diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return diffH + "h ago";
  var diffD = Math.floor(diffH / 24);
  if (diffD < 30) return diffD + "d ago";
  return d.toLocaleDateString();
};
