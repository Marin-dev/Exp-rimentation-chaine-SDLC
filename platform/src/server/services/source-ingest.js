import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import mammoth from "mammoth";
import JSZip from "jszip";
import ExcelJS from "exceljs";

/**
 * Bootstrap from a rich client folder — step 1, deterministic (no AI).
 *
 * Copies the client folder as-is under livrables/_sources/originaux/ (never modified
 * afterwards) and converts every file into something an agent can read under
 * livrables/_sources/normalises/: Word / PowerPoint / Excel become Markdown (with their
 * embedded images extracted alongside), PDF and images stay native (Claude reads them),
 * Figma .fig archives yield their thumbnail and embedded images. Each file gets a
 * content hash so a later re-ingestion can tell new / changed / removed documents.
 * The index lives in livrables/_sources/sources.json.
 */

const SKIP_DIRS = new Set(["node_modules", ".git", "__macosx"]);
const MAX_FILES = 2000;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024; // 1 Go
const MAX_SHEET_ROWS = 2000;

const NATIVE_EXT = new Set([".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const TEXT_EXT = new Set([".md", ".markdown", ".txt", ".csv", ".json", ".yaml", ".yml", ".xml", ".html", ".htm", ".svg"]);
const LEGACY_OFFICE = new Set([".doc", ".xls", ".ppt", ".rtf", ".odt", ".ods", ".odp"]);
const FIGMA_LINK = /https?:\/\/(?:www\.)?figma\.com\/(?:file|design|proto|board)\/[A-Za-z0-9]+[^\s)"'<>\]]*/g;

const toPosix = (p) => p.split(path.sep).join("/");

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function walk(root) {
  const files = [];
  let total = 0;
  const visit = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name.startsWith("~$")) continue; // hidden + Office lock files
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name.toLowerCase())) visit(full);
      } else if (e.isFile()) {
        const size = fs.statSync(full).size;
        total += size;
        files.push({ full, rel: toPosix(path.relative(root, full)), size });
        if (files.length > MAX_FILES) throw new Error(`Trop de fichiers (plus de ${MAX_FILES}).`);
        if (total > MAX_TOTAL_BYTES) throw new Error("Dossier trop volumineux (plus de 1 Go).");
      }
    }
  };
  visit(root);
  return files.sort((a, b) => a.rel.localeCompare(b.rel));
}

function mdEscapeCell(v) {
  return String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function cellText(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if (value.richText) return value.richText.map((r) => r.text).join("");
    if (value.text != null) return String(value.text);
    if (value.result != null) return cellText(value.result);
    if (value.formula) return `=${value.formula}`;
    if (value.error) return String(value.error);
  }
  return String(value);
}

async function convertDocx(src, outMd, assetsDir, assetsRel) {
  let n = 0;
  const result = await mammoth.convertToMarkdown(
    { path: src },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        n += 1;
        const ext = (image.contentType || "image/png").split("/")[1].replace("jpeg", "jpg").replace("x-emf", "emf");
        fs.mkdirSync(assetsDir, { recursive: true });
        const name = `image-${String(n).padStart(3, "0")}.${ext}`;
        fs.writeFileSync(path.join(assetsDir, name), Buffer.from(await image.read("base64"), "base64"));
        return { src: `${assetsRel}/${name}` };
      })
    }
  );
  // mammoth escapes Markdown punctuation everywhere, which breaks image paths and URLs:
  // unescape inside link/image targets and for characters that carry no formatting.
  const md = result.value
    .replace(/(!?\[[^\]]*\]\()([^)]*)\)/g, (_, head, target) => `${head}${target.replace(/\\(.)/g, "$1")})`)
    .replace(/\\([.\-:/?=&%])/g, "$1");
  fs.writeFileSync(outMd, md, "utf8");
  const warnings = (result.messages || []).filter((m) => m.type === "warning").length;
  return { assets: n, note: warnings ? `${warnings} élément(s) de mise en forme non convertis` : "" };
}

async function convertXlsx(src, outMd, title) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(src);
  const parts = [`# ${title}`, ""];
  let truncated = 0;
  wb.eachSheet((sheet) => {
    parts.push(`## Onglet : ${sheet.name}`, "");
    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      if (rows.length >= MAX_SHEET_ROWS) { truncated += 1; return; }
      const values = [];
      for (let c = 1; c <= Math.max(row.cellCount, 1); c += 1) values.push(mdEscapeCell(cellText(row.getCell(c).value)));
      rows.push(values);
    });
    if (!rows.length) { parts.push("_(onglet vide)_", ""); return; }
    const width = Math.max(...rows.map((r) => r.length));
    const pad = (r) => [...r, ...Array(width - r.length).fill("")];
    parts.push(`| ${pad(rows[0]).join(" | ")} |`, `| ${Array(width).fill("---").join(" | ")} |`);
    for (const r of rows.slice(1)) parts.push(`| ${pad(r).join(" | ")} |`);
    parts.push("");
  });
  fs.writeFileSync(outMd, parts.join("\n"), "utf8");
  return { assets: 0, note: truncated ? `${truncated} ligne(s) au-delà de ${MAX_SHEET_ROWS} par onglet non reprises` : "" };
}

/** Paragraph texts of one slide/notes XML part (DrawingML <a:p>/<a:t>). */
function drawingTexts(xml) {
  const paras = [];
  for (const p of xml.match(/<a:p>[\s\S]*?<\/a:p>/g) || []) {
    const t = (p.match(/<a:t>([\s\S]*?)<\/a:t>/g) || []).map((x) => x.replace(/<\/?a:t>/g, "")).join("");
    const clean = t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
    if (clean) paras.push(clean);
  }
  return paras;
}

async function convertPptx(src, outMd, assetsDir, assetsRel, title) {
  const zip = await JSZip.loadAsync(fs.readFileSync(src));
  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]));
  const parts = [`# ${title}`, ""];
  let assets = 0;
  for (const name of slideNames) {
    const num = name.match(/(\d+)\.xml$/)[1];
    const xml = await zip.file(name).async("string");
    parts.push(`## Slide ${num}`, "");
    const texts = drawingTexts(xml);
    parts.push(...(texts.length ? texts.map((t) => `- ${t}`) : ["_(pas de texte)_"]), "");
    // Images referenced by the slide.
    const relsFile = zip.file(`ppt/slides/_rels/slide${num}.xml.rels`);
    if (relsFile) {
      const rels = await relsFile.async("string");
      for (const m of rels.matchAll(/Target="\.\.\/media\/([^"]+)"/g)) {
        const media = zip.file(`ppt/media/${m[1]}`);
        if (!media || !/\.(png|jpe?g|gif|webp)$/i.test(m[1])) continue;
        fs.mkdirSync(assetsDir, { recursive: true });
        const out = `slide${num}-${m[1]}`;
        fs.writeFileSync(path.join(assetsDir, out), await media.async("nodebuffer"));
        parts.push(`![Slide ${num}](${assetsRel}/${out})`, "");
        assets += 1;
      }
    }
    const notes = zip.file(`ppt/notesSlides/notesSlide${num}.xml`);
    if (notes) {
      const nt = drawingTexts(await notes.async("string")).filter((t) => !/^\d+$/.test(t));
      if (nt.length) parts.push("**Notes :**", ...nt.map((t) => `> ${t}`), "");
    }
  }
  fs.writeFileSync(outMd, parts.join("\n"), "utf8");
  return { assets, note: slideNames.length ? "" : "aucune slide trouvée" };
}

/**
 * Figma .fig: recent files are a ZIP holding a thumbnail, embedded images and the
 * document in Figma's private binary format. We extract what is readable offline.
 */
async function convertFig(src, outMd, assetsDir, assetsRel, title) {
  let zip;
  try {
    zip = await JSZip.loadAsync(fs.readFileSync(src));
  } catch {
    fs.writeFileSync(outMd, `# ${title}\n\nFichier Figma au format binaire ancien : contenu non lisible hors ligne.\n`, "utf8");
    return { assets: 0, partial: true, note: "format .fig non lisible hors ligne : demander un export PDF ou PNG des frames" };
  }
  const parts = [`# ${title}`, "", "Fichier Figma (.fig). Le contenu vectoriel n'est pas lisible hors ligne ; seuls la miniature et les images intégrées sont extraites.", ""];
  let assets = 0;
  const meta = zip.file("meta.json");
  if (meta) {
    try {
      const m = JSON.parse(await meta.async("string"));
      if (m.file_name || m.client_meta) parts.push(`- Nom du fichier : ${m.file_name || ""}`, "");
    } catch {}
  }
  for (const name of Object.keys(zip.files)) {
    const f = zip.files[name];
    if (f.dir) continue;
    const isThumb = /thumbnail\.(png|jpe?g)$/i.test(name);
    const isImage = /^images\//.test(name);
    if (!isThumb && !isImage) continue;
    const buf = await f.async("nodebuffer");
    // Embedded images are stored without extension: sniff PNG/JPEG signatures.
    const ext = buf[0] === 0x89 && buf[1] === 0x50 ? "png" : buf[0] === 0xff && buf[1] === 0xd8 ? "jpg" : null;
    if (!ext) continue;
    fs.mkdirSync(assetsDir, { recursive: true });
    const out = `${isThumb ? "miniature" : path.basename(name)}.${ext}`;
    fs.writeFileSync(path.join(assetsDir, out), buf);
    parts.push(`![${isThumb ? "Miniature" : "Image intégrée"}](${assetsRel}/${out})`, "");
    assets += 1;
  }
  fs.writeFileSync(outMd, parts.join("\n"), "utf8");
  return {
    assets,
    partial: true,
    note: assets ? "écrans lus via la miniature et les images intégrées ; un export PDF/PNG des frames donnerait plus de détail" : "aucune image exploitable : demander un export PDF ou PNG des frames"
  };
}

function figmaLinksIn(file) {
  try {
    const text = fs.readFileSync(file, "utf8").replace(/\\(.)/g, "$1");
    return [...new Set(text.match(FIGMA_LINK) || [])];
  } catch {
    return [];
  }
}

export function readSourcesIndex(paths) {
  try {
    return JSON.parse(fs.readFileSync(paths.sourcesIndexFile, "utf8"));
  } catch {
    return null;
  }
}

export function writeSourcesIndex(paths, index) {
  fs.mkdirSync(path.dirname(paths.sourcesIndexFile), { recursive: true });
  fs.writeFileSync(paths.sourcesIndexFile, JSON.stringify(index, null, 2), "utf8");
}

/**
 * Ingest (or re-ingest) a client folder into the active workspace.
 * Returns { ok, stats } or { ok: false, error }.
 */
export async function ingestClientFolder(paths, folderInput) {
  const folder = path.resolve(String(folderInput || "").trim());
  if (!folderInput || !fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    return { ok: false, error: "Dossier client introuvable." };
  }
  const ws = path.resolve(paths.workspaceRoot);
  if (folder === ws || folder.startsWith(ws + path.sep)) {
    return { ok: false, error: "Le dossier client doit être en dehors du projet." };
  }

  let files;
  try {
    files = walk(folder);
  } catch (e) {
    return { ok: false, error: e.message };
  }

  const previous = readSourcesIndex(paths);
  const prevByRel = new Map((previous?.files || []).map((f) => [f.rel, f]));
  let seq = previous?.seq || 0;
  const now = new Date().toISOString();
  const out = [];

  for (const f of files) {
    const hash = sha256(f.full);
    const prev = prevByRel.get(f.rel);
    const ext = path.extname(f.rel).toLowerCase();
    const title = path.basename(f.rel);
    const id = prev?.id || `SRC-${String((seq += 1)).padStart(3, "0")}`;

    // Unchanged since the last ingestion: keep conversion + human/agent classification.
    if (prev && prev.sha256 === hash && prev.normalized !== undefined) {
      out.push({ ...prev, status: "unchanged" });
      continue;
    }

    const original = path.join(paths.sourcesOriginalsDir, f.rel);
    fs.mkdirSync(path.dirname(original), { recursive: true });
    fs.copyFileSync(f.full, original);
    const originalRel = toPosix(path.relative(paths.workspaceRoot, original));

    const normBase = path.join(paths.sourcesNormalizedDir, f.rel);
    const outMd = `${normBase}.md`;
    const assetsDir = `${normBase}.assets`;
    // Image links in the Markdown are relative to the .md file itself.
    const assetsRel = `${path.basename(normBase)}.assets`;
    let kind = "converted";
    let normalized = null;
    let conv = { assets: 0, note: "" };

    try {
      fs.mkdirSync(path.dirname(normBase), { recursive: true });
      fs.rmSync(assetsDir, { recursive: true, force: true });
      if (ext === ".docx") conv = await convertDocx(f.full, outMd, assetsDir, assetsRel);
      else if (ext === ".xlsx" || ext === ".xlsm") conv = await convertXlsx(f.full, outMd, title);
      else if (ext === ".pptx") conv = await convertPptx(f.full, outMd, assetsDir, assetsRel, title);
      else if (ext === ".fig") conv = await convertFig(f.full, outMd, assetsDir, assetsRel, title);
      else if (NATIVE_EXT.has(ext) || TEXT_EXT.has(ext)) kind = "native";
      else if (LEGACY_OFFICE.has(ext)) {
        kind = "unsupported";
        conv.note = "format ancien : demander une version .docx/.xlsx/.pptx ou PDF";
      } else {
        kind = "unsupported";
        conv.note = "format non pris en charge";
      }
      if (kind === "converted") {
        normalized = toPosix(path.relative(paths.workspaceRoot, outMd));
        if (conv.partial) kind = "partial";
      } else if (kind === "native") {
        normalized = originalRel; // agents read PDF / images / text directly
      }
    } catch (e) {
      kind = "failed";
      conv.note = `échec de conversion : ${e.message}`;
    }

    const linkSource = normalized ? path.resolve(paths.workspaceRoot, normalized) : null;
    out.push({
      id,
      rel: f.rel,
      ext,
      size: f.size,
      sha256: hash,
      kind,
      original: originalRel,
      normalized,
      assets: conv.assets || 0,
      note: conv.note || "",
      figmaLinks: linkSource && (kind === "converted" || TEXT_EXT.has(ext)) ? figmaLinksIn(linkSource) : [],
      status: prev ? "changed" : "new",
      ingestedAt: now,
      // A changed document must be re-classified and re-validated.
      classification: prev && prev.sha256 === hash ? prev.classification : null,
      override: prev && prev.sha256 === hash ? prev.override : null,
      routedAt: null
    });
  }

  const seen = new Set(files.map((f) => f.rel));
  const removed = (previous?.files || []).filter((f) => !seen.has(f.rel)).map((f) => ({ ...f, status: "removed" }));

  const index = {
    version: 1,
    sourceFolder: folder,
    ingestedAt: now,
    firstIngestedAt: previous?.firstIngestedAt || now,
    seq,
    mappedAt: previous?.mappedAt || null,
    validatedAt: previous && out.every((f) => f.status === "unchanged") && !removed.length ? previous.validatedAt : null,
    files: [...out, ...removed]
  };
  writeSourcesIndex(paths, index);

  const count = (k) => out.filter((f) => f.kind === k).length;
  const status = (s) => index.files.filter((f) => f.status === s).length;
  return {
    ok: true,
    stats: {
      total: out.length,
      converted: count("converted"),
      native: count("native"),
      partial: count("partial"),
      unsupported: count("unsupported"),
      failed: count("failed"),
      new: status("new"),
      changed: status("changed"),
      unchanged: status("unchanged"),
      removed: removed.length,
      figmaLinks: [...new Set(out.flatMap((f) => f.figmaLinks))].length
    }
  };
}
