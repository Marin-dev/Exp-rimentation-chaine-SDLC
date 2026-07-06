import React, { useMemo } from "react";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

// Strip a leading YAML frontmatter block so non-technical readers don't see it.
function stripFrontmatter(md) {
  return md.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, "");
}

// Windows deliverables carry CRLF line endings; marked's GFM table/list detection
// only triggers on plain "\n", so normalize first (else tables render as raw text).
function normalize(md) {
  return md.replace(/\r\n?/g, "\n");
}

export default function MarkdownView({ content, className = "" }) {
  const html = useMemo(() => {
    if (!content) return "";
    return marked.parse(stripFrontmatter(normalize(content)));
  }, [content]);
  return <div className={`md ${className}`.trim()} dangerouslySetInnerHTML={{ __html: html }} />;
}
