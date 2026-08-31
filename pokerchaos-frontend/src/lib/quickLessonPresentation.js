const INTERNAL_METADATA_KEYS = new Set([
  "date",
  "category",
  "topic",
  "subtopic",
  "hook",
  "status",
  "publication status",
  "published at",
  "external id",
  "lesson number",
  "series",
  "resource type",
  "main concept",
  "example",
  "takeaway",
  "source",
  "source paths",
  "taxonomy",
  "primary study tag",
  "secondary study tags",
  "stack depth bands",
  "hero positions",
  "villain positions",
  "opponent types",
  "study spot types",
]);

const SECTION_ALIASES = new Map([
  ["today's edge", "edge"],
  ["todays edge", "edge"],
  ["core lesson", "edge"],
  ["why it works", "why"],
  ["example spot", "example"],
  ["example", "example"],
  ["decision analysis", "decision"],
  ["the decision", "decision"],
  ["the mistake", "mistake"],
  ["common mistake", "mistake"],
  ["the better play", "betterPlay"],
  ["better play", "betterPlay"],
  ["when to use", "whenToUse"],
  ["when to use it", "whenToUse"],
  ["when not to use", "whenNotToUse"],
  ["when not to use it", "whenNotToUse"],
  ["sizing", "sizing"],
  ["sizing reference", "sizing"],
  ["one thing to remember", "takeaway"],
  ["takeaway", "takeaway"],
]);

const OMITTED_SECTIONS = new Set([
  "caption",
  "caption draft",
  "instagram caption",
  "metadata",
  "source metadata",
  "taxonomy",
  "publication",
]);

function cleanHeading(value) {
  return String(value || "")
    .replace(/[*_`]/g, "")
    .replace(/\s*\/\s*/g, " / ")
    .trim();
}

function headingKey(value) {
  return cleanHeading(value)
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[?:]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isInternalMetadataLine(line) {
  const match = String(line || "").trim().match(/^\*\*([^*]+):\*\*\s*/);
  return Boolean(match && INTERNAL_METADATA_KEYS.has(match[1].trim().toLowerCase()));
}

function cleanMarkdownSource(source) {
  return String(source || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => !isInternalMetadataLine(line))
    .join("\n")
    .trim();
}

export function parseMarkdownBlocks(source) {
  const lines = cleanMarkdownSource(source).split("\n");
  const blocks = [];
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    const text = paragraph.join(" ").trim();
    if (text) blocks.push({ type: "paragraph", text });
    paragraph = [];
  };
  const flushList = () => {
    if (list?.items.length) blocks.push(list);
    list = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: heading[1].length, text: cleanHeading(heading[2]) });
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ type: "separator" });
      continue;
    }

    const unordered = line.match(/^[-*+]\s+(.+)$/);
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const orderedList = Boolean(ordered);
      if (!list || list.ordered !== orderedList) flushList();
      list ||= { type: "list", ordered: orderedList, items: [] };
      list.items.push((unordered || ordered)[1].trim());
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push({ type: "quote", text: quote[1].trim() });
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

export function splitCanonicalLessonMarkdown(source) {
  const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");
  const sections = {};
  const extras = [];
  let current = { key: "preamble", title: "", lines: [] };

  const commit = () => {
    const text = current.lines.join("\n").trim();
    if (!text) return;
    if (current.key === "preamble") {
      const useful = current.lines
        .filter((line) => !isInternalMetadataLine(line))
        .filter((line) => !/^#\s+/.test(line.trim()))
        .filter((line) => !/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim()))
        .join("\n")
        .trim();
      if (useful) sections.edge ||= useful;
      return;
    }
    if (current.key === "omit") return;
    if (current.key === "extra") extras.push({ title: current.title, markdown: text });
    else sections[current.key] ||= text;
  };

  for (const line of lines) {
    const heading = line.trim().match(/^(#{1,6})\s+(.+)$/);
    if (!heading) {
      current.lines.push(line);
      continue;
    }

    const title = cleanHeading(heading[2]);
    const key = headingKey(title);
    if (SECTION_ALIASES.has(key) || OMITTED_SECTIONS.has(key)) {
      commit();
      current = {
        key: OMITTED_SECTIONS.has(key) ? "omit" : SECTION_ALIASES.get(key),
        title,
        lines: [],
      };
    } else if (heading[1].length > 1) {
      commit();
      current = { key: "extra", title, lines: [] };
    } else if (current.key !== "preamble") {
      current.lines.push(line);
    }
  }
  commit();

  return { sections, extras };
}

function textValue(value) {
  return Array.isArray(value) ? value.filter(Boolean).join("\n") : String(value || "").trim();
}

function optionFromParagraph(text, index) {
  const leadingStrong = String(text || "").match(/^\*\*([^*]+)\*\*\s*(.*)$/s);
  const title = leadingStrong ? leadingStrong[1].trim().replace(/[.:]$/, "") : `Option ${index + 1}`;
  const detail = leadingStrong ? leadingStrong[2].trim() : String(text || "").trim();
  const recommendationText = `${title} ${detail}`.toLowerCase();
  return {
    title,
    detail,
    recommended: /\brecommend|\bdefault|\bbetter play|\bpreferred/.test(recommendationText),
  };
}

export function buildQuickLessonPresentation(resource = {}) {
  const parsed = splitCanonicalLessonMarkdown(resource.body);
  const section = (key, fallback = "") => textValue(parsed.sections[key] || fallback);
  const whyBlocks = parseMarkdownBlocks(section("why"));
  const decisionBlocks = parseMarkdownBlocks(section("decision"));
  const extras = parsed.extras.flatMap((extra) => {
    const key = headingKey(extra.title);
    const isCombinedConditions = key.includes("when to use") && key.includes("when not to");
    if (!isCombinedConditions || !(resource.whenToUse?.length || resource.whenNotToUse?.length)) {
      return [extra];
    }

    const related = extra.markdown.match(/\*\*(Related spots[^*]*)\*\*\s*([\s\S]+)$/i);
    return related ? [{ title: related[1].replace(/:$/, "").trim(), markdown: related[2].trim() }] : [];
  });

  return {
    edge: section("edge", resource.body),
    reasons: whyBlocks
      .filter((block) => block.type === "paragraph")
      .map((block, index) => optionFromParagraph(block.text, index)),
    example: textValue(resource.exampleSpot) || section("example"),
    decisions: decisionBlocks
      .filter((block) => block.type === "paragraph")
      .map((block, index) => optionFromParagraph(block.text, index)),
    mistake: textValue(resource.mistake) || section("mistake"),
    betterPlay: textValue(resource.betterPlay) || section("betterPlay"),
    whenToUse: Array.isArray(resource.whenToUse) && resource.whenToUse.length
      ? resource.whenToUse.filter(Boolean)
      : parseMarkdownBlocks(section("whenToUse")).flatMap((block) => block.type === "list" ? block.items : []),
    whenNotToUse: Array.isArray(resource.whenNotToUse) && resource.whenNotToUse.length
      ? resource.whenNotToUse.filter(Boolean)
      : parseMarkdownBlocks(section("whenNotToUse")).flatMap((block) => block.type === "list" ? block.items : []),
    sizing: section("sizing"),
    takeaway: textValue(resource.takeaway) || section("takeaway"),
    extras,
  };
}

const SUIT_MAP = {
  s: { suit: "spades", symbol: "♠", color: "black" },
  "♠": { suit: "spades", symbol: "♠", color: "black" },
  h: { suit: "hearts", symbol: "♥", color: "red" },
  "♥": { suit: "hearts", symbol: "♥", color: "red" },
  d: { suit: "diamonds", symbol: "♦", color: "red" },
  "♦": { suit: "diamonds", symbol: "♦", color: "red" },
  c: { suit: "clubs", symbol: "♣", color: "black" },
  "♣": { suit: "clubs", symbol: "♣", color: "black" },
};

export function parsePokerCards(value) {
  const cards = [];
  const expression = /(?:^|[\s,:[(])((?:10|[2-9TJQKA]))\s*([shdc♠♥♦♣])(?=$|[\s,.)\]])/gi;
  for (const match of String(value || "").matchAll(expression)) {
    const suit = SUIT_MAP[match[2].toLowerCase()] || SUIT_MAP[match[2]];
    if (suit) cards.push({ rank: match[1].toUpperCase(), ...suit });
  }
  return cards;
}

export function parseExampleSpot(markdown, resource = {}) {
  const blocks = parseMarkdownBlocks(markdown);
  const listItems = blocks.flatMap((block) => block.type === "list" ? block.items : []);
  const facts = [];
  const narrative = [];
  let decision = "";
  let heroCards = [];
  let boardCards = [];

  for (const item of listItems) {
    const field = item.match(/^([^:]{2,32}):\s*(.+)$/s);
    if (!field) {
      narrative.push(item);
      continue;
    }
    const label = field[1].trim();
    const value = field[2].trim();
    const normalized = label.toLowerCase();
    if (normalized.includes("decision")) {
      decision = value;
      continue;
    }
    if (normalized === "hero") heroCards = parsePokerCards(value);
    if (normalized.includes("board")) boardCards = parsePokerCards(value);
    facts.push({ label, value });
  }

  const paragraphText = blocks
    .filter((block) => block.type === "paragraph")
    .map((block) => block.text);
  narrative.push(...paragraphText);

  if (!facts.some((fact) => /effective|stack|hero/i.test(fact.label)) && resource.stackDepthTags?.length) {
    facts.push({ label: "Stack", value: resource.stackDepthTags.join(", ") + " BB" });
  }
  if (!facts.some((fact) => /^hero$/i.test(fact.label)) && resource.heroPositionTags?.length) {
    facts.push({ label: "Hero", value: resource.heroPositionTags.join(", ") });
  }
  if (!facts.some((fact) => /^villain/i.test(fact.label)) && resource.villainPositionTags?.length) {
    facts.push({ label: "Villain", value: resource.villainPositionTags.join(", ") });
  }

  return { facts, heroCards, boardCards, decision, narrative };
}
