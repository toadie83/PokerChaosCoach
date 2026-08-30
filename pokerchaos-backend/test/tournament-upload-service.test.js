import assert from "node:assert/strict";
import test from "node:test";

import {
  TournamentUploadError,
  prepareTournamentHistory,
} from "../src/tournamentUploadService.js";

function expectUploadError(input, code) {
  assert.throws(
    () => prepareTournamentHistory(input),
    (error) => error instanceof TournamentUploadError && error.code === code,
  );
}

function ggTournamentHand({ handId = "TM1001", tournamentId = "T100" } = {}) {
  return `Poker Hand #${handId}: Tournament #${tournamentId}, Hold'em No Limit - Level1 (50/100) - 2026/08/29 20:00:00
Table 'Final' 2-max Seat #1 is the button
Seat 1: Villain (5000 in chips)
Seat 2: Hero (3100 in chips)
Villain: posts small blind 50
Hero: posts big blind 100
*** HOLE CARDS ***
Dealt to Hero [Kh 9d]
Villain: raises 120 to 220
Hero: folds
*** SUMMARY ***
Total pot 200 | Rake 0`;
}

function pokerStarsTournamentHand() {
  return `PokerStars Hand #3001: Tournament #T300, Hold'em No Limit - Level I (50/100) - 2026/08/29 20:00:00
Table 'Final' 2-max Seat #1 is the button
Seat 1: Villain (5000 in chips)
Seat 2: Hero (3100 in chips)
Villain: posts small blind 50
Hero: posts big blind 100
*** HOLE CARDS ***
Dealt to Hero [Kh 9d]
Villain: raises 120 to 220
Hero: folds
*** SUMMARY ***
Total pot 200 | Rake 0`;
}

test("shared tournament preparation rejects malformed and unsupported uploads", () => {
  expectUploadError({ historyText: "not a hand history" }, "MALFORMED_UPLOAD");
  expectUploadError(
    { historyText: "Winamax Poker - HandId: 123" },
    "UNSUPPORTED_FORMAT",
  );
});

test("shared tournament preparation rejects supported cash histories", () => {
  const cash = `Poker Hand #RC1: Hold'em No Limit ($0.50/$1) - 2026/08/29 20:00:00
Table 'Cash' 6-max Seat #1 is the button
Seat 1: Hero ($100 in chips)
Seat 2: Villain ($100 in chips)
Hero: posts small blind $0.50
Villain: posts big blind $1
Dealt to Hero [Ah Kd]
Hero: folds`;
  expectUploadError({ historyText: cash, heroName: "Hero" }, "NO_TOURNAMENT_HANDS");
});

test("shared preparation keeps preflop folds in a valid short tournament", () => {
  const prepared = prepareTournamentHistory({
    historyText: ggTournamentHand(),
    heroName: "Hero",
  });
  assert.equal(prepared.tournamentId, "T100");
  assert.equal(prepared.compactHands.length, 1);
  assert.equal(prepared.compactHands[0].heroPreflop.didFold, true);
  assert.equal(prepared.summary.heroFoldedPreflopCount, 1);
});

test("shared preparation rejects uploads containing multiple tournaments", () => {
  expectUploadError(
    {
      historyText: `${ggTournamentHand()}\n${ggTournamentHand({ handId: "TM2001", tournamentId: "T200" })}`,
      heroName: "Hero",
    },
    "MULTIPLE_TOURNAMENTS",
  );
});

test("shared preparation accepts the tested PokerStars tournament format", () => {
  const prepared = prepareTournamentHistory({
    historyText: pokerStarsTournamentHand(),
    heroName: "Hero",
  });
  assert.equal(prepared.tournamentId, "T300");
  assert.equal(prepared.compactHands[0].site, "pokerstars");
});
