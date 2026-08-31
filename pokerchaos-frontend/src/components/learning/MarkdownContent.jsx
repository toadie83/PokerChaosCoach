import { Fragment } from "react";

import { parseMarkdownBlocks } from "../../lib/quickLessonPresentation.js";

function safeHref(value) {
  const href = String(value || "").trim();
  return /^(https?:\/\/|\/|#)/i.test(href) ? href : "#";
}

function InlineMarkdown({ text }) {
  const parts = String(text || "").split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, index) => {
    const key = `${index}-${part.slice(0, 12)}`;
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(part)) return <code key={key}>{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) return <a href={safeHref(link[2])} key={key}>{link[1]}</a>;
    return <Fragment key={key}>{part}</Fragment>;
  });
}

export default function MarkdownContent({ markdown, className = "" }) {
  const blocks = parseMarkdownBlocks(markdown);
  if (!blocks.length) return null;

  return (
    <div className={`learning-markdown ${className}`.trim()}>
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        if (block.type === "heading") {
          const Heading = block.level <= 2 ? "h2" : block.level === 3 ? "h3" : "h4";
          return <Heading key={key}><InlineMarkdown text={block.text} /></Heading>;
        }
        if (block.type === "list") {
          const List = block.ordered ? "ol" : "ul";
          return <List key={key}>{block.items.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}><InlineMarkdown text={item} /></li>)}</List>;
        }
        if (block.type === "quote") return <blockquote key={key}><InlineMarkdown text={block.text} /></blockquote>;
        if (block.type === "separator") return <hr key={key} />;
        return <p key={key}><InlineMarkdown text={block.text} /></p>;
      })}
    </div>
  );
}
