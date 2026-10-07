import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType,
  ImageRun, AlignmentType, ShadingType, PageBreak
} from "docx";

/**
 * Deterministic rendering of a support outline into PowerPoint or Word.
 *
 * Outline (written by the support agent, or derived from Markdown):
 * { title, subtitle, sections: [{ title, blocks: [
 *     { type: "text", text } | { type: "bullets", items: [] } |
 *     { type: "table", columns: [], rows: [[]] } | { type: "kpis", items: [{ label, value }] } |
 *     { type: "image", path, caption } | { type: "planning" } ] }] }
 *
 * A template (.pptx / .docx) uploaded in the settings is used as a style example: its theme
 * colours and fonts are applied, and for Word its styles are reused as-is.
 */

const NEUTRAL_THEME = {
  dark: "1F2937",
  light: "FFFFFF",
  muted: "6B7280",
  accents: ["2563EB", "0EA5E9", "10B981", "F59E0B", "8B5CF6", "EF4444"],
  headingFont: "Calibri",
  bodyFont: "Calibri"
};

// ---------- Template theme ----------

function colorOf(xml, tag) {
  const m = xml.match(new RegExp(`<a:${tag}>([\\s\\S]*?)</a:${tag}>`));
  if (!m) return null;
  const c = m[1].match(/srgbClr val="([0-9A-Fa-f]{6})"/) || m[1].match(/lastClr="([0-9A-Fa-f]{6})"/);
  return c ? c[1].toUpperCase() : null;
}

/** Read colours and fonts from a template's DrawingML theme. Returns { theme, stylesXml }. */
export async function readTemplate(file) {
  if (!file || !fs.existsSync(file)) return { theme: NEUTRAL_THEME, stylesXml: null };
  try {
    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    const themeName = Object.keys(zip.files).find((n) => /^(ppt|word)\/theme\/theme1\.xml$/.test(n));
    const theme = { ...NEUTRAL_THEME };
    if (themeName) {
      const xml = await zip.file(themeName).async("string");
      theme.dark = colorOf(xml, "dk2") || colorOf(xml, "dk1") || theme.dark;
      theme.light = colorOf(xml, "lt1") || theme.light;
      const accents = [1, 2, 3, 4, 5, 6].map((i) => colorOf(xml, `accent${i}`)).filter(Boolean);
      if (accents.length) theme.accents = accents;
      const major = xml.match(/<a:majorFont>[\s\S]*?<a:latin typeface="([^"]+)"/);
      const minor = xml.match(/<a:minorFont>[\s\S]*?<a:latin typeface="([^"]+)"/);
      if (major && major[1]) theme.headingFont = major[1];
      if (minor && minor[1]) theme.bodyFont = minor[1];
    }
    const styles = zip.file("word/styles.xml");
    return { theme, stylesXml: styles ? await styles.async("string") : null };
  } catch {
    return { theme: NEUTRAL_THEME, stylesXml: null };
  }
}

// ---------- Helpers ----------

const plain = (s) => String(s ?? "").replace(/\*\*|__|`/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out.length ? out : [[]];
}

function readImage(workspaceRoot, rel) {
  if (!rel) return null;
  const full = path.resolve(workspaceRoot, rel);
  if (!full.startsWith(path.resolve(workspaceRoot) + path.sep)) return null;
  if (!/\.(png|jpe?g)$/i.test(full) || !fs.existsSync(full)) return null;
  const data = fs.readFileSync(full);
  // PNG / JPEG intrinsic size, to keep the aspect ratio.
  let w = 4, h = 3;
  if (data[0] === 0x89) { w = data.readUInt32BE(16); h = data.readUInt32BE(20); }
  else {
    for (let i = 2; i < data.length - 9;) {
      if (data[i] !== 0xff) break;
      const marker = data[i + 1];
      const len = data.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xc3) { h = data.readUInt16BE(i + 5); w = data.readUInt16BE(i + 7); break; }
      i += 2 + len;
    }
  }
  return { data, w, h, type: /\.png$/i.test(full) ? "png" : "jpg" };
}

function readPlanning(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

const frDate = (iso) => {
  const dt = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? String(iso) : dt.toLocaleDateString("fr-FR");
};
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fmt = (v) => (Math.round(num(v) * 10) / 10).toLocaleString("fr-FR");

function planningSummary(p) {
  const t = p.totals || {};
  const team = (p.team || []).reduce((s, m) => s + num(m.count) * (m.allocation == null ? 1 : num(m.allocation)), 0);
  return [
    { label: "Charge totale", value: `${fmt(t.totalJh)} JH` },
    { label: "Développement", value: `${fmt(t.developmentJh)} JH` },
    { label: "Transverse", value: `${fmt(t.transverseJh)} JH` },
    { label: "Équipe", value: `${fmt(team)} ETP` },
    { label: "Sprints", value: String(t.sprints ?? (p.sprints || []).length) },
    { label: "Fin prévue", value: t.endDate ? frDate(t.endDate) : "—" }
  ];
}

function epicLoad(p) {
  const byEpic = new Map();
  for (const e of p.estimates || []) {
    const k = e.epic || "Sans epic";
    byEpic.set(k, (byEpic.get(k) || 0) + num(e.jh));
  }
  return [...byEpic.entries()].map(([epic, jh]) => [epic, fmt(jh)]);
}

/** Expand a planning block into generic blocks (shared by both renderers). */
function planningBlocks(planning) {
  if (!planning) return [{ type: "text", text: "Planning non disponible (planning.json absent)." }];
  const blocks = [{ type: "kpis", items: planningSummary(planning) }];
  if ((planning.sprints || []).length) blocks.push({ type: "gantt", sprints: planning.sprints, milestones: planning.milestones || [] });
  if ((planning.team || []).length) {
    blocks.push({ type: "table", title: "Équipe", columns: ["Rôle", "Nombre", "Allocation"], rows: planning.team.map((m) => [m.role, String(m.count ?? ""), m.allocation == null ? "100 %" : `${Math.round(num(m.allocation) * 100)} %`]) });
  }
  const epics = epicLoad(planning);
  if (epics.length) blocks.push({ type: "table", title: "Charge par epic", columns: ["Epic", "JH"], rows: epics });
  if ((planning.sprints || []).length) {
    blocks.push({ type: "table", title: "Sprints", columns: ["Sprint", "Dates", "Objectif", "JH"], rows: planning.sprints.map((s) => [s.id, `${s.start || ""} → ${s.end || ""}`, s.goal || "", fmt(s.jh)]) });
  }
  if ((planning.milestones || []).length) {
    blocks.push({ type: "table", title: "Jalons", columns: ["Jalon", "Date", "Critère"], rows: planning.milestones.map((m) => [m.title, m.date || "", m.criteria || ""]) });
  }
  if ((planning.risks || []).length) blocks.push({ type: "bullets", title: "Risques planning", items: planning.risks.map((r) => `${r.title}${r.mitigation ? ` — ${r.mitigation}` : ""}`) });
  return blocks;
}

function expand(outline, ctx) {
  return (outline.sections || []).map((s) => ({
    title: plain(s.title),
    blocks: (s.blocks || []).flatMap((b) => (b && b.type === "planning" ? planningBlocks(ctx.planning) : [b])).filter(Boolean)
  }));
}

// ---------- PowerPoint ----------

const W = 13.333;
const H = 7.5;

export async function renderPptx(outline, { theme, workspaceRoot, planning }) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  const t = theme;
  const accent = t.accents[0];
  const body = { fontFace: t.bodyFont, color: t.dark };

  pptx.defineSlideMaster({
    title: "CONTENT",
    background: { color: t.light },
    objects: [
      { rect: { x: 0, y: 0, w: W, h: 0.12, fill: { color: accent } } },
      { text: { text: plain(outline.title), options: { x: 0.5, y: H - 0.45, w: 8, h: 0.3, fontSize: 9, color: t.muted || "6B7280", fontFace: t.bodyFont } } }
    ],
    slideNumber: { x: W - 1, y: H - 0.45, fontSize: 9, color: "6B7280" }
  });

  // Title slide.
  const cover = pptx.addSlide();
  cover.background = { color: t.dark };
  cover.addShape("rect", { x: 0.6, y: 2.6, w: 0.12, h: 1.9, fill: { color: accent } });
  cover.addText(plain(outline.title), { x: 0.95, y: 2.5, w: 11, h: 1.2, fontSize: 36, bold: true, color: "FFFFFF", fontFace: t.headingFont });
  if (outline.subtitle) cover.addText(plain(outline.subtitle), { x: 0.95, y: 3.65, w: 11, h: 0.6, fontSize: 18, color: "E5E7EB", fontFace: t.bodyFont });
  cover.addText(new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }), { x: 0.95, y: 4.3, w: 6, h: 0.4, fontSize: 12, color: "D1D5DB", fontFace: t.bodyFont });

  const sections = expand(outline, { planning }).filter((sec) => sec.blocks.length);
  const named = sections.filter((sec) => sec.title);
  const HEAVY = new Set(["kpis", "table", "image", "gantt"]);

  // Agenda.
  if (named.length > 1) {
    const agenda = pptx.addSlide({ masterName: "CONTENT" });
    agenda.addText("Sommaire", { x: 0.5, y: 0.4, w: 12, h: 0.7, fontSize: 26, bold: true, fontFace: t.headingFont, color: t.dark });
    agenda.addText(named.map((sec, i) => ({ text: `${i + 1}.  ${sec.title}`, options: { breakLine: true } })), { x: 0.8, y: 1.4, w: 11.5, h: 5.3, fontSize: 18, ...body, valign: "top", paraSpaceAfter: 8 });
  }

  // A content slide: title, optional accent subtitle, optional short lead text.
  // Returns the slide and the y where the main content can start.
  const newSlide = (title, sub, lead) => {
    const s = pptx.addSlide({ masterName: "CONTENT" });
    s.addText(title, { x: 0.5, y: 0.35, w: 12.3, h: 0.7, fontSize: 24, bold: true, fontFace: t.headingFont, color: t.dark });
    if (sub) s.addText(sub, { x: 0.5, y: 0.95, w: 12.3, h: 0.4, fontSize: 13, color: accent, fontFace: t.bodyFont, bold: true });
    let top = sub ? 1.5 : 1.3;
    if (lead) {
      s.addText(lead, { x: 0.6, y: top - 0.1, w: 12.1, h: 0.85, fontSize: 14, ...body, valign: "top" });
      top += 0.85;
    }
    return { slide: s, top };
  };

  sections.forEach((section) => {
    const title = section.title || plain(outline.title);
    // A divider only introduces sections that span several slides.
    const slidesEstimate = section.blocks.filter((b) => HEAVY.has(b.type)).length + (section.blocks.some((b) => !HEAVY.has(b.type)) ? 1 : 0);
    if (section.title && named.length > 1 && slidesEstimate >= 2) {
      const div = pptx.addSlide();
      div.background = { color: t.dark };
      div.addText(String(named.indexOf(section) + 1).padStart(2, "0"), { x: 0.8, y: 2.4, w: 3, h: 1, fontSize: 48, bold: true, color: accent, fontFace: t.headingFont });
      div.addText(section.title, { x: 0.8, y: 3.4, w: 11.5, h: 1, fontSize: 32, bold: true, color: "FFFFFF", fontFace: t.headingFont });
    }

    // Text-like blocks are grouped on one slide until it is full; heavy blocks get their own slides.
    let pending = [];
    let lines = 0;
    const flush = () => {
      if (!pending.length) return;
      const { slide } = newSlide(title);
      slide.addText(pending, { x: 0.6, y: 1.3, w: 12.1, h: 5.6, fontSize: 16, ...body, valign: "top", paraSpaceAfter: 6 });
      pending = [];
      lines = 0;
    };
    // Before a heavy block: a short pending text becomes its lead instead of a near-empty slide.
    const takeLead = () => {
      if (pending.length && lines <= 3) {
        const lead = pending.map((r) => ({ ...r, options: { ...r.options, bullet: false } }));
        pending = [];
        lines = 0;
        return lead;
      }
      flush();
      return null;
    };
    const addRuns = (runs, cost) => {
      if (lines + cost > 14) flush();
      pending.push(...runs);
      lines += cost;
    };

    for (const b of section.blocks) {
      if (b.type === "text") {
        addRuns([{ text: plain(b.text), options: { breakLine: true } }], Math.ceil(plain(b.text).length / 110) + 1);
      } else if (b.type === "bullets") {
        if (b.title) addRuns([{ text: plain(b.title), options: { bold: true, breakLine: true, color: accent } }], 1);
        for (const it of b.items || []) addRuns([{ text: plain(it), options: { bullet: !b.numbered, breakLine: true } }], Math.ceil(plain(it).length / 100));
      } else if (b.type === "kpis") {
        const { slide: s, top } = newSlide(title, b.title ? plain(b.title) : null, takeLead());
        const items = (b.items || []).slice(0, 6);
        const cols = Math.min(items.length, 3) || 1;
        const tw = (12.1 - (cols - 1) * 0.3) / cols;
        const th = top > 2 ? 1.75 : 2;
        items.forEach((k, i) => {
          const x = 0.6 + (i % cols) * (tw + 0.3);
          const y = top + 0.1 + Math.floor(i / cols) * (th + 0.3);
          s.addShape("rect", { x, y, w: tw, h: th, fill: { color: "F3F4F6" }, line: { color: "F3F4F6" } });
          s.addShape("rect", { x, y, w: 0.08, h: th, fill: { color: t.accents[i % t.accents.length] } });
          s.addText(plain(k.value), { x: x + 0.3, y: y + 0.2, w: tw - 0.4, h: 0.9, fontSize: 30, bold: true, color: t.dark, fontFace: t.headingFont });
          s.addText(plain(k.label), { x: x + 0.3, y: y + th - 0.8, w: tw - 0.4, h: 0.6, fontSize: 14, color: "4B5563", fontFace: t.bodyFont });
        });
      } else if (b.type === "table") {
        const lead = takeLead();
        const rows = b.rows || [];
        chunk(rows, 11).forEach((part, pi) => {
          const { slide: s, top } = newSlide(title, b.title ? `${plain(b.title)}${pi ? " (suite)" : ""}` : null, pi ? null : lead);
          const header = (b.columns || []).map((c) => ({ text: plain(c), options: { bold: true, color: "FFFFFF", fill: { color: t.dark } } }));
          const data = part.map((r, ri) => r.map((c) => ({ text: plain(c), options: { fill: { color: ri % 2 ? "F9FAFB" : "FFFFFF" } } })));
          s.addTable(header.length ? [header, ...data] : data, { x: 0.6, y: top, w: 12.1, fontSize: 11, fontFace: t.bodyFont, color: t.dark, border: { type: "solid", pt: 0.5, color: "E5E7EB" }, autoPage: false });
        });
      } else if (b.type === "image") {
        const img = readImage(workspaceRoot, b.path);
        if (!img) continue;
        const { slide: s, top } = newSlide(title, b.caption ? plain(b.caption) : null, takeLead());
        const maxW = 12.1, maxH = 6.9 - top;
        const ratio = Math.min(maxW / img.w, maxH / img.h);
        const w = img.w * ratio, h = img.h * ratio;
        s.addImage({ data: `data:image/${img.type === "png" ? "png" : "jpeg"};base64,${img.data.toString("base64")}`, x: 0.6 + (maxW - w) / 2, y: top, w, h });
      } else if (b.type === "gantt") {
        const { slide, top } = newSlide(title, "Calendrier des sprints", takeLead());
        renderGanttSlide(slide, b, t, top + 0.1);
      }
    }
    flush();
  });

  return pptx.write({ outputType: "nodebuffer" });
}

function renderGanttSlide(slide, b, t, top = 1.6) {
  const sprints = (b.sprints || []).filter((s) => s.start && s.end).slice(0, 14);
  if (!sprints.length) return;
  const d = (s) => new Date(`${s}T00:00:00`).getTime();
  const min = Math.min(...sprints.map((s) => d(s.start)));
  // A sprint's end date is inclusive: its bar runs to the end of that day.
  const endOf = (s) => d(s.end) + 86400000;
  const max = Math.max(...sprints.map(endOf), ...(b.milestones || []).filter((m) => m.date).map((m) => d(m.date) + 86400000));
  const x0 = 2.2, x1 = 12.6, y0 = top + 0.3;
  const span = Math.max(max - min, 1);
  const xOf = (ms) => x0 + ((ms - min) / span) * (x1 - x0);
  const rowH = Math.min(0.5, (6.2 - y0) / sprints.length);
  const yEnd = y0 + sprints.length * rowH;
  const short = (ms) => new Date(ms).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });

  // Weekly grid (or monthly when the plan is long) with date labels.
  const DAY = 86400000;
  const step = span > 120 * DAY ? 28 * DAY : 7 * DAY;
  for (let ms = min; ms <= max + 1; ms += step) {
    const x = xOf(ms);
    slide.addShape("line", { x, y: y0 - 0.05, w: 0, h: yEnd - y0 + 0.1, line: { color: "E5E7EB", width: 0.75 } });
    slide.addText(short(ms), { x: x - 0.45, y: y0 - 0.4, w: 0.9, h: 0.3, fontSize: 8, color: "6B7280", align: "center", fontFace: t.bodyFont });
  }

  // One colour per lot, sprint goal written inside its bar.
  const lots = [...new Set(sprints.map((s) => s.lot || ""))];
  sprints.forEach((s, i) => {
    const y = y0 + i * rowH;
    const x = xOf(d(s.start));
    const w = Math.max(xOf(endOf(s)) - x, 0.1);
    slide.addText(`${plain(s.id)}${s.lot ? ` · ${plain(s.lot)}` : ""}`, { x: 0.5, y, w: 1.65, h: rowH, fontSize: 10, color: t.dark, fontFace: t.bodyFont, valign: "middle" });
    slide.addShape("rect", { x, y: y + rowH * 0.12, w, h: rowH * 0.76, fill: { color: t.accents[lots.indexOf(s.lot || "") % t.accents.length] }, line: { color: "FFFFFF" } });
    if (s.goal && w > 0.9) {
      slide.addText(plain(s.goal), { x: x + 0.05, y: y + rowH * 0.12, w: w - 0.1, h: rowH * 0.76, fontSize: 9, color: "FFFFFF", fontFace: t.bodyFont, valign: "middle", fit: "shrink" });
    }
  });

  for (const m of b.milestones || []) {
    if (!m.date) continue;
    const x = xOf(d(m.date) + 86400000); // a milestone closes its day, like sprint bars
    slide.addShape("line", { x, y: y0 - 0.05, w: 0, h: yEnd - y0 + 0.15, line: { color: "DC2626", width: 1.5, dashType: "dash" } });
    slide.addText(`${plain(m.title)} · ${short(d(m.date))}`, { x: Math.min(Math.max(x - 1.2, 0.5), W - 2.9), y: yEnd + 0.1, w: 2.4, h: 0.4, fontSize: 9, bold: true, color: "DC2626", align: "center", fontFace: t.bodyFont });
  }
}

// ---------- Word ----------

function docxTable(b, t) {
  const header = (b.columns || []).length
    ? [new TableRow({
        tableHeader: true,
        children: b.columns.map((c) => new TableCell({
          shading: { type: ShadingType.CLEAR, color: "auto", fill: t.dark },
          children: [new Paragraph({ children: [new TextRun({ text: plain(c), bold: true, color: "FFFFFF" })] })]
        }))
      })]
    : [];
  const rows = (b.rows || []).map((r) => new TableRow({
    children: r.map((c) => new TableCell({ children: [new Paragraph(plain(c))] }))
  }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [...header, ...rows] });
}

export async function renderDocx(outline, { theme, stylesXml, workspaceRoot, planning }) {
  const t = theme;
  const children = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: plain(outline.title) })] })
  ];
  if (outline.subtitle) children.push(new Paragraph({ heading: HeadingLevel.SUBTITLE, children: [new TextRun(plain(outline.subtitle))] }));
  children.push(new Paragraph({ children: [new TextRun({ text: new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }), italics: true })] }));

  for (const section of expand(outline, { planning })) {
    if (section.title) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(section.title)] }));
    }
    for (const b of section.blocks) {
      if (b.title && b.type !== "kpis") children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(plain(b.title))] }));
      if (b.type === "text") {
        for (const para of plain(b.text).split(/\n{2,}/)) children.push(new Paragraph(para));
      } else if (b.type === "bullets") {
        for (const it of b.items || []) children.push(b.numbered ? new Paragraph({ text: plain(it), indent: { left: 360 } }) : new Paragraph({ text: plain(it), bullet: { level: 0 } }));
      } else if (b.type === "kpis") {
        children.push(docxTable({ columns: ["Indicateur", "Valeur"], rows: (b.items || []).map((k) => [k.label, k.value]) }, t));
      } else if (b.type === "table") {
        children.push(docxTable(b, t));
      } else if (b.type === "gantt") {
        children.push(docxTable({ columns: ["Sprint", "Début", "Fin", "JH"], rows: (b.sprints || []).map((s) => [s.id, s.start || "", s.end || "", fmt(s.jh)]) }, t));
      } else if (b.type === "image") {
        const img = readImage(workspaceRoot, b.path);
        if (!img) continue;
        const width = 600;
        children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: img.data, type: img.type, transformation: { width, height: Math.round((width * img.h) / img.w) } })] }));
        if (b.caption) children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: plain(b.caption), italics: true })] }));
      }
      children.push(new Paragraph(""));
    }
  }

  const doc = stylesXml
    ? new Document({ externalStyles: stylesXml, sections: [{ children }] })
    : new Document({
        styles: {
          default: {
            document: { run: { font: t.bodyFont, size: 22, color: t.dark } },
            heading1: { run: { font: t.headingFont, size: 34, bold: true, color: t.accents[0] }, paragraph: { spacing: { after: 160 } } },
            heading2: { run: { font: t.headingFont, size: 26, bold: true, color: t.dark }, paragraph: { spacing: { before: 200, after: 100 } } },
            title: { run: { font: t.headingFont, size: 56, bold: true, color: t.dark } }
          }
        },
        sections: [{ children }]
      });
  return Packer.toBuffer(doc);
}

// ---------- Markdown → outline (direct export of a deliverable) ----------

/** Turn a Markdown deliverable into an outline: H1 = title, H2 = sections. */
export function markdownToOutline(md, fallbackTitle) {
  const lines = String(md || "").split(/\r?\n/);
  const outline = { title: fallbackTitle, sections: [] };
  let section = null;
  let para = [];
  let bullets = null;
  let table = null;
  const current = () => {
    if (!section) { section = { title: "", blocks: [] }; outline.sections.push(section); }
    return section;
  };
  const flush = () => {
    if (para.length) { current().blocks.push({ type: "text", text: para.join(" ") }); para = []; }
    if (bullets) { current().blocks.push({ type: "bullets", items: bullets.items, numbered: bullets.numbered }); bullets = null; }
    if (table) { current().blocks.push({ type: "table", columns: table[0], rows: table.slice(1) }); table = null; }
  };
  const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  for (const line of lines) {
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flush(); continue; } // horizontal rule
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flush();
      if (h[1].length === 1 && !outline.sections.length && outline.title === fallbackTitle) outline.title = plain(h[2]);
      else if (h[1].length <= 2) { section = { title: plain(h[2]), blocks: [] }; outline.sections.push(section); }
      else current().blocks.push({ type: "text", text: `**${plain(h[2])}**` });
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (para.length || bullets) { const t = table; table = null; flush(); table = t; }
      if (/^\s*\|?\s*:?-{3,}/.test(line.replace(/\|/g, "|"))) continue;
      table = table || [];
      table.push(cells(line));
      continue;
    }
    const b = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
    if (b) {
      if (para.length || table) { const keep = bullets; bullets = null; flush(); bullets = keep; }
      const numbered = /\d/.test(b[1]);
      bullets = bullets || { items: [], numbered };
      // Numbered lists keep their numbers (a client questionnaire is referenced by number).
      bullets.items.push(numbered ? `${b[1].replace(")", ".")} ${b[2]}` : b[2]);
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    if (bullets || table) flush();
    // "**Label** : value" lines are metadata rows: keep each on its own line.
    if (/^\*\*[^*]+\*\*\s*:/.test(line.trim()) && para.length) flush();
    para.push(line.trim());
    if (/^\*\*[^*]+\*\*\s*:/.test(line.trim())) flush();
  }
  flush();
  return outline;
}

export { readPlanning };
