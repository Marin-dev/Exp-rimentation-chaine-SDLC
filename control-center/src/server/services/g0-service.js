import fs from "node:fs/promises";
import path from "node:path";
import { readJson, readMaybe, writeJson } from "../utils/fs-utils.js";
import { isoStamp, slugify } from "../utils/text-utils.js";

function normalizeQuestion(raw, index, source) {
  const text = raw?.prompt || raw?.question || raw?.label || raw?.title || "";
  if (!text.trim()) return null;
  return {
    id: raw?.id || `${source}-${index + 1}`,
    label: raw?.label || raw?.title || `Question agent ${index + 1}`,
    severity: raw?.severity || raw?.priority || "important",
    prompt: text,
    source
  };
}

function parseQuestionsFromMarkdown(markdown, source) {
  const lines = markdown.split(/\r?\n/);
  const questions = [];
  let inOpenSection = source.startsWith("g0-open-questions");

  for (const line of lines) {
    const heading = line.match(/^#{1,4}\s+(.+)$/);
    if (heading) {
      const title = heading[1].toLowerCase();
      inOpenSection = /question|clarifier|manquant|blocage|ouverte/.test(title);
      continue;
    }

    if (!inOpenSection) continue;
    const item = line.match(/^\s*(?:[-*]|\d+[.)]|\[(?: |x)\])\s*(.+)$/);
    if (!item) continue;
    const prompt = item[1].replace(/^\[(?: |x)\]\s*/, "").trim();
    const normalized = normalizeQuestion({ prompt }, questions.length, source);
    if (normalized) questions.push(normalized);
  }

  return questions;
}

function uniqueQuestions(questions) {
  const seen = new Set();
  return questions.filter((question) => {
    const key = `${question.id}:${question.prompt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function createG0Service(configService) {
  async function listAgentGeneratedQuestions() {
    const { g0OpenQuestionsJsonPath, g0OpenQuestionsMarkdownPath, gatesDir } = await configService.getWorkspacePaths();
    const generated = [];
    const json = await readJson(g0OpenQuestionsJsonPath, null);
    const jsonQuestions = Array.isArray(json) ? json : json?.questions;
    if (Array.isArray(jsonQuestions)) {
      generated.push(
        ...jsonQuestions
          .map((question, index) => normalizeQuestion(question, index, "g0-open-questions.json"))
          .filter(Boolean)
      );
    }

    const markdownQuestions = parseQuestionsFromMarkdown(
      await readMaybe(g0OpenQuestionsMarkdownPath),
      "g0-open-questions.md"
    );
    generated.push(...markdownQuestions);

    const report = await readMaybe(path.join(gatesDir, "G0-project-context-ready.md"));
    generated.push(...parseQuestionsFromMarkdown(report, "G0-project-context-ready.md"));

    return uniqueQuestions(generated);
  }

  async function listG0Questions() {
    const questions = await listAgentGeneratedQuestions();
    const responses = await listG0Responses();
    return questions.map((question) => ({
      ...question,
      responses: responses.filter((response) => response.questionId === question.id)
    }));
  }

  async function listG0Responses() {
    const { g0ResponsesDir } = await configService.getWorkspacePaths();
    const entries = await fs.readdir(g0ResponsesDir).catch(() => []);
    const responses = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const response = await readJson(path.join(g0ResponsesDir, entry), null);
      if (response) responses.push(response);
    }
    return responses.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async function answerG0Question(body) {
    const { g0ResponsesDir, workspaceRoot } = await configService.getWorkspacePaths();
    const response = {
      id: `${isoStamp()}-${slugify(body.questionId || "g0")}`,
      questionId: body.questionId || "",
      questionPrompt: body.questionPrompt || "",
      answer: body.answer || "",
      linkedIntakePath: body.linkedIntakePath || "",
      createdAt: new Date().toISOString()
    };
    const filePath = path.join(g0ResponsesDir, `${response.id}.json`);
    await writeJson(filePath, response);
    return { ...response, file: path.relative(workspaceRoot, filePath) };
  }

  return { listG0Questions, answerG0Question };
}
