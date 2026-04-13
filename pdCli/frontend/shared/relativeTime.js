// Shared relative time utility
// Usage: pd.relativeTime(isoString)
globalThis.pd = globalThis.pd || {};

pd.relativeTime = function (iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return diffMin + "m ago";
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return diffH + "h ago";
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return diffD + "d ago";
  return d.toLocaleDateString();
};
