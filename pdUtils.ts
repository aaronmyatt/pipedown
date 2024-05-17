export const camelCaseString = (s: string) => {
  return s
    .replace(/[\W_]+/g, ' ').trim()
    .replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
      return index === 0 ? word.toLowerCase() : word.toUpperCase();
  }).replace(/\s+/g, "");
};
