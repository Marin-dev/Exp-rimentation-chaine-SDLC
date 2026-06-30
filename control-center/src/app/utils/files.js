export const readableExtensions = new Set([
  "md",
  "txt",
  "csv",
  "json",
  "yaml",
  "yml",
  "xml",
  "drawio",
  "html",
  "css",
  "js",
  "ts",
  "tsx",
  "jsx"
]);

export function readBrowserFile(file) {
  return new Promise((resolve) => {
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!readableExtensions.has(extension) || file.size > 1_000_000) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        path: file.webkitRelativePath || file.name,
        content: String(reader.result || "")
      });
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}
