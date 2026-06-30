import React, { useMemo } from "react";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

// Strip a leading YAML frontmatter block so non-technical readers don't see it.
function stripFrontmatter(md) {
  return md.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, "");
}

export default function MarkdownView({ content }) {
  const html = useMemo(() => {
    if (!content) return "";
    return marked.parse(stripFrontmatter(content));
  }, [content]);
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}
