import assert from "node:assert/strict";
import test from "node:test";

import {
  __livePreflopBaselineTestables,
  buildLivePreflopAnchor,
  canonicalLiveStartingHand,
  describeStructuralPreflopHand,
} from "../src/livePreflopBaselineService.js";
import { __quickOpenRangeTestables } from "../../pokerchaos-frontend/src/lib/quickOpenRange.js";

function context({
  card1,
  card2,
  decisionKind,
  heroSeat,
  opponentSeat = null,
  effectiveStackBB,
  facingSizeBB = null,
  callAmountBB = null,
  legalActions,
  relativePosition = null,
}) {
  return {
    street: "preflop",
    gameType: "tournament",
    heroCards: { card1, card2 },
    decisionNode: {
      street: "preflop",
      gameType: "tournament",
      tableSize: 8,
      decisionKind,
      heroSeat,
      opponentSeat,
      relativePosition,
      effectiveStackBB,
      legalActions,
      facingAction: facingSizeBB === null
        ? null
        : {
            actorSeat: opponentSeat,
            toAmountBB: facingSizeBB,
            callAmountBB,
          },
    },
  };
}

test("canonical and structural classes preserve playable hand families", () => {
  assert.equal(
    canonicalLiveStartingHand({ card1: "4s", card2: "As" }),
    "A4s",
  );
  assert.equal(describeStructuralPreflopHand("A4s").family, "suited_ace");
  assert.equal(describeStructuralPreflopHand("44").family, "pocket_pair");
  assert.equal(describeStructuralPreflopHand("76s").family, "suited_connector");
  assert.doesNotMatch(describeStructuralPreflopHand("44").label, /trash/i);
});

test("20 BB and 21 BB BTN first-in anchors both preserve A3o opens", () => {
  for (const effectiveStackBB of [20, 21]) {
    const anchor = buildLivePreflopAnchor(
      context({
        card1: "As",
        card2: "3h",
        decisionKind: "unopened",
        heroSeat: "BTN",
        effectiveStackBB,
        legalActions: ["fold", "open", "jam"],
      }),
    );
    assert.equal(anchor.verdict, "enter");
    assert.equal(anchor.fallbackAction, "open");
  }
});

test("20 BB BB anchor defends Q9s against a small BTN open", () => {
  const anchor = buildLivePreflopAnchor(
    context({
      card1: "Qs",
      card2: "9s",
      decisionKind: "facing_open",
      heroSeat: "BB",
      opponentSeat: "BTN",
      effectiveStackBB: 20,
      facingSizeBB: 2.2,
      callAmountBB: 1.2,
      legalActions: ["fold", "call", "3-bet", "jam"],
    }),
  );
  assert.equal(anchor.verdict, "continue");
  assert.equal(anchor.fallbackAction, "call");
  assert.match(anchor.rationale, /do not fold solely because.*non-premium/i);
});

test("very short BB still preserves a strongly priced late-open defense", () => {
  const anchor = buildLivePreflopAnchor(
    context({
      card1: "Qs",
      card2: "9s",
      decisionKind: "facing_open",
      heroSeat: "BB",
      opponentSeat: "BTN",
      effectiveStackBB: 12,
      facingSizeBB: 2.2,
      callAmountBB: 1.2,
      legalActions: ["fold", "call", "3-bet", "jam"],
    }),
  );
  assert.equal(anchor.verdict, "continue");
  assert.equal(anchor.fallbackAction, "call");
});

test("middle-position seats retain a conservative non-premium continue range", () => {
  const anchor = buildLivePreflopAnchor(
    context({
      card1: "8s",
      card2: "8h",
      decisionKind: "facing_open",
      heroSeat: "HJ",
      opponentSeat: "LJ",
      effectiveStackBB: 35,
      facingSizeBB: 2.2,
      callAmountBB: 2.2,
      legalActions: ["fold", "call", "3-bet", "jam"],
    }),
  );
  assert.equal(anchor.verdict, "continue");
  assert.equal(anchor.fallbackAction, "call");
  assert.equal(anchor.spot, "early_middle_continue_vs_open");
});

test("suited wheel ace supplies a selective non-premium 3-bet anchor", () => {
  const anchor = buildLivePreflopAnchor(
    context({
      card1: "As",
      card2: "4s",
      decisionKind: "facing_open",
      heroSeat: "SB",
      opponentSeat: "BTN",
      effectiveStackBB: 40,
      facingSizeBB: 2.2,
      callAmountBB: 1.7,
      legalActions: ["fold", "call", "3-bet", "jam"],
    }),
  );
  assert.equal(anchor.verdict, "continue");
  assert.equal(anchor.mixedAggressionCandidate, true);
  assert.equal(anchor.fallbackAction, "3-bet");
});

test("facing a 3-bet protects the in-position suited-broadway call branch", () => {
  const anchor = buildLivePreflopAnchor(
    context({
      card1: "Ks",
      card2: "Qs",
      decisionKind: "facing_3bet",
      heroSeat: "BTN",
      opponentSeat: "SB",
      effectiveStackBB: 40,
      legalActions: ["fold", "call", "4-bet", "jam"],
      relativePosition: "ip",
    }),
  );
  assert.equal(anchor.verdict, "continue");
  assert.equal(anchor.fallbackAction, "call");
  assert.match(anchor.rationale, /protect a calling range/i);
});

test("cold open plus 3-bet remains materially tighter", () => {
  const base = {
    decisionKind: "facing_open_and_3bet",
    heroSeat: "BTN",
    opponentSeat: "CO",
    effectiveStackBB: 40,
    legalActions: ["fold", "call", "4-bet", "jam"],
  };
  const aceJack = buildLivePreflopAnchor(
    context({ ...base, card1: "As", card2: "Js" }),
  );
  const aces = buildLivePreflopAnchor(
    context({ ...base, card1: "As", card2: "Ah" }),
  );
  assert.equal(aceJack.fallbackAction, "fold");
  assert.equal(aces.verdict, "continue");
  assert.equal(aces.fallbackAction, "4-bet");
});

test("Coach and HUD tournament RFI charts remain in exact parity", () => {
  const chartPairs = [
    [
      __livePreflopBaselineTestables.mttRfiStandard,
      __quickOpenRangeTestables.mttStandardRanges,
    ],
    [
      __livePreflopBaselineTestables.mttRfiShallow,
      __quickOpenRangeTestables.mttShortRanges,
    ],
  ];
  for (const [backendChart, frontendChart] of chartPairs) {
    assert.deepEqual(Object.keys(backendChart), Object.keys(frontendChart));
    for (const seat of Object.keys(backendChart)) {
      assert.deepEqual(
        [...backendChart[seat]].sort(),
        [...frontendChart[seat]].sort(),
        `${seat} range should match`,
      );
    }
  }
});
