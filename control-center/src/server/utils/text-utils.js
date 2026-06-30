export function slugify(value) {
  return (
    String(value || "item")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "item"
  );
}

export function isoStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const data = {};
  if (!match) return data;
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].replace(/^>\s*/, "").trim();
  }
  return data;
}

export function parseGateStatus(content) {
  if (!content) return "missing";
  const status =
    content.match(/\*\*Status\*\*:\s*([A-Z_]+)/)?.[1] ||
    content.match(/\*\*Statut\*\*:\s*([A-Z_]+)/)?.[1] ||
    content.match(/Status\s*:\s*([A-Z_]+)/i)?.[1];
  return status ? status.toUpperCase() : "unknown";
}
