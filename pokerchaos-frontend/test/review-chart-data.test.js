import assert from "node:assert/strict";
import test from "node:test";
import { buildPositionFrequencies, buildStackSeries } from "../src/lib/reviewChartData.js";

const hand = (id, minute, stack, bigBlind = 100, tournamentId = "T1") => ({
  handId: id, playedAtEpoch: Date.UTC(2026, 8, 1, 20, minute),
  heroStack: stack, blinds: { bigBlind }, tournamentId,
});

test("stack progression restores chronological order and uses each hand's blind level", () => {
  const hands = [hand("latest", 3, 3000, 200), hand("first", 1, 2000), hand("middle", 2, 2700)];
  const series = buildStackSeries(hands);
  assert.deepEqual(series.points.map((point) => [point.handId, point.stackBb]), [["first", 20], ["middle", 27], ["latest", 15]]);
  assert.equal(hands[0].handId, "latest");
  assert.equal(series.ordering, "chronological");
});

test("missing stacks and invalid blinds leave gaps instead of reporting zero or interpolating", () => {
  const series = buildStackSeries([hand("first", 1, 2000), hand("missing", 2, null), hand("third", 3, 1800), hand("bad-blind", 4, 2000, 0), hand("last", 5, 0)]);
  assert.deepEqual(series.points.map((point) => point.stackBb), [20, null, 18, null, 0]);
  assert.deepEqual(series.segments.map((segment) => segment.map((point) => point.handId)), [["first"], ["third"], ["last"]]);
  assert.equal(series.missingStackCount, 2);
});

test("a tournament switch cannot look like a stack gain in the same tournament", () => {
  const series = buildStackSeries([hand("a", 1, 2000), hand("b", 2, 1000), hand("c", 3, 4000, 100, "T2")]);
  assert.equal(series.tournamentCount, 2);
  assert.deepEqual(series.segments.map((segment) => segment.length), [2, 1]);
});

test("unknown dates are counted and excluded from a chronological sample", () => {
  const unknown = { ...hand("unknown", 0, 2000), playedAtEpoch: null, playedAt: "unknown" };
  const series = buildStackSeries([unknown, hand("known", 1, 2000)]);
  assert.deepEqual(series.points.map((point) => point.handId), ["known"]);
  assert.equal(series.omittedUndatedCount, 1);
  const onlyUnknown = buildStackSeries([unknown, { ...unknown, handId: "second" }]);
  assert.equal(onlyUnknown.ordering, "import");
  assert.equal(onlyUnknown.omittedUndatedCount, 0);
  assert.deepEqual(onlyUnknown.points.map((point) => point.handId), ["unknown", "second"]);
});

test("a valid raw timestamp is accepted, but rolled calendar dates are rejected", () => {
  const base = { heroStack: 1000, blinds: { bigBlind: 100 } };
  const series = buildStackSeries([{ ...base, handId: "invalid", playedAt: "2026/02/31 20:00:00" }, { ...base, handId: "valid", playedAt: "2026/02/28 20:00:00" }]);
  assert.deepEqual(series.points.map((point) => point.handId), ["valid"]);
  assert.equal(series.omittedUndatedCount, 1);
  assert.equal(buildStackSeries(null).validPoints.length, 0);
});

test("position rates use relevant opportunities rather than all hands and retain sample counts", () => {
  const summary = { totalHands: 100, preflopBreakdown: {
    openByPositionRows: [{ position: "BB", spots: 3, opens: 0 }, { position: "CO", spots: 12, opens: 6 }, { position: "UTG", spots: 8, opens: 2 }],
    defendByPositionRows: [{ position: "BB", spots: 20, defends: 5 }],
  } };
  const opening = buildPositionFrequencies(summary);
  assert.deepEqual(opening.map((row) => [row.position, row.percent, row.smallSample]), [["UTG", 25, false], ["CO", 50, false], ["BB", 0, true]]);
  assert.deepEqual(buildPositionFrequencies(summary, "defend"), [{ position: "BB", count: 5, spots: 20, percent: 25, smallSample: false }]);
});

test("unavailable or corrupt opportunities are not rendered as zero percent", () => {
  assert.deepEqual(buildPositionFrequencies(null), []);
  assert.deepEqual(buildPositionFrequencies({ preflopBreakdown: { openByPositionRows: [
    { position: "CO", spots: 0, opens: 0 }, { position: "BTN", spots: 2, opens: null },
    { position: "SB", spots: 3, opens: 5 }, { position: "BB", spots: -1, opens: 0 },
  ] } }), []);
});
