import assert from "node:assert/strict";
import test from "node:test";

import {
  buildQuickLessonPresentation,
  parseExampleSpot,
  parseMarkdownBlocks,
  parsePokerCards,
  splitCanonicalLessonMarkdown,
} from "../src/lib/quickLessonPresentation.js";

const structuredLesson = {
  resourceType: "quick_lesson",
  body: `# DAILY MTT EDGE #008
**Date:** Monday 31 August 2026
**Category:** Mental Game
**Status:** Draft for review

---

## Today's Edge

Reset before the next decision.

The previous pot does not choose this action.

## Why It Works

**Tilt opens are not strategy opens.** The reason behind the click changes the range.

**Resetting is free EV.** Waiting for a clear decision costs less than forcing action.

## Example Spot

- Blinds now: 300 / 600 with a 600 big-blind ante
- Hero: Cutoff with K♦ T♣, 28bb
- Villain: Big blind, 35bb
- Board: A♠ 8♥ 3♦
- Decision: Open 2.2x or wait?

## Decision Analysis

**Open 2.2x.** A thin line driven by the previous hand.

**Fold / wait.** The default with this marginal holding here.

## When To Use It / When Not To

**Reset when:**
- The decision is marginal

**Do not use this when:**
- The open is standard

**Related spots (same leak, different shape):**
- Revenge river bluffs
- Calling light to get unstuck

## Caption (draft)

Internal social derivative copy.
`,
  exampleSpot: "- Blinds now: 300 / 600\n- Hero: Cutoff with K♦ T♣, 28bb\n- Decision: Open or fold?",
  mistake: "Auto-opening because you need chips back.",
  betterPlay: "Reset and make the normal range decision.",
  whenToUse: ["After a fresh cooler", "When the next decision is marginal"],
  whenNotToUse: ["When the hand is a clear standard open"],
  takeaway: "The next hand is a new hand.",
};

test("structured Quick Lessons map canonical content into designed teaching sections", () => {
  const lesson = buildQuickLessonPresentation(structuredLesson);

  assert.match(lesson.edge, /^Reset before the next decision/);
  assert.equal(lesson.reasons.length, 2);
  assert.equal(lesson.reasons[0].title, "Tilt opens are not strategy opens");
  assert.equal(lesson.decisions.length, 2);
  assert.equal(lesson.decisions[1].recommended, true);
  assert.equal(lesson.mistake, structuredLesson.mistake);
  assert.deepEqual(lesson.whenToUse, structuredLesson.whenToUse);
  assert.equal(lesson.takeaway, structuredLesson.takeaway);
  assert.deepEqual(lesson.extras, [{
    title: "Related spots (same leak, different shape)",
    markdown: "- Revenge river bluffs\n- Calling light to get unstuck",
  }]);
  assert.equal(lesson.extras.some(({ title }) => /caption/i.test(title)), false);
  assert.doesNotMatch(lesson.edge, /\*\*Date:|Draft for review|---/);
});

test("dedicated poker spot parsing separates facts, cards, and the decision", () => {
  const spot = parseExampleSpot(structuredLesson.exampleSpot, {
    villainPositionTags: ["BB"],
  });

  assert.equal(spot.facts.some(({ label }) => label === "Blinds now"), true);
  assert.deepEqual(spot.heroCards.map(({ rank, symbol }) => `${rank}${symbol}`), ["K♦", "T♣"]);
  assert.equal(spot.decision, "Open or fold?");
  assert.equal(spot.facts.some(({ label, value }) => label === "Villain" && value === "BB"), true);
  assert.deepEqual(parsePokerCards("Board: A♠ 8h 3d").map(({ rank }) => rank), ["A", "8", "3"]);
});

test("Markdown fallback creates semantic blocks and removes import metadata prose", () => {
  const blocks = parseMarkdownBlocks(`**Date:** 2026-08-31

## A calmer article heading

Readable **body copy**.

- First idea
- Second idea

> Keep the decision contextual.

---`);

  assert.deepEqual(blocks.map(({ type }) => type), ["heading", "paragraph", "list", "quote", "separator"]);
  assert.equal(blocks.some((block) => JSON.stringify(block).includes("Date")), false);
  assert.equal(blocks[2].items.length, 2);
});

test("canonical splitter prefers semantic headings and omits social captions", () => {
  const parsed = splitCanonicalLessonMarkdown(structuredLesson.body);
  assert.match(parsed.sections.edge, /previous pot/);
  assert.match(parsed.sections.why, /Resetting is free EV/);
  assert.equal(parsed.extras.some(({ title }) => /caption/i.test(title)), false);
});
