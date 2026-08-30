import {
  buildOpponentSnapshot,
  compactHandForApi,
  filterHandsForReview,
  parseHandHistory,
  sortHands,
} from "./handHistoryService.js";
import { upsertTournamentUpload } from "./db.js";

export class TournamentUploadError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = "TournamentUploadError";
    this.code = code;
    this.status = 400;
    this.details = details;
  }
}

function summarizeTournamentHands(allHands, filteredHands, heroName) {
  const heroFoldedPreflopCount = allHands.filter((hand) =>
    Boolean(hand?.heroPreflop?.didFold),
  ).length;
  const heroEnteredPreflopCount = allHands.filter(
    (hand) =>
      Boolean(hand?.heroPreflop?.acted) && !Boolean(hand?.heroPreflop?.didFold),
  ).length;
  return {
    heroName,
    totalHands: allHands.length,
    filteredHands: filteredHands.length,
    returnedHands: filteredHands.length,
    heroFoldedPreflopCount,
    heroEnteredPreflopCount,
    sort: "newest",
  };
}

function resolveTournamentPlayedAtEpoch(hands) {
  const epochs = (Array.isArray(hands) ? hands : [])
    .map((hand) => Number(hand?.playedAtEpoch))
    .filter((value) => Number.isFinite(value));
  return epochs.length > 0 ? Math.min(...epochs) : null;
}

function resolveTournamentId(hands, requestedTournamentId) {
  const requested = String(requestedTournamentId || "").trim();
  const detectedTournamentIds = Array.from(
    new Set(
      hands
        .map((hand) => String(hand?.tournamentId || "").trim())
        .filter(Boolean),
    ),
  );
  if (requested) return { tournamentId: requested, detectedTournamentIds };
  if (detectedTournamentIds.length === 1) {
    return { tournamentId: detectedTournamentIds[0], detectedTournamentIds };
  }
  return { tournamentId: "", detectedTournamentIds };
}

function parseFailure(historyText) {
  const text = String(historyText || "");
  if (/Winamax|888poker|Winning Poker|PartyPoker/i.test(text)) {
    return new TournamentUploadError(
      "This poker-site format is not supported yet.",
      "UNSUPPORTED_FORMAT",
    );
  }
  return new TournamentUploadError(
    "No valid poker hands were found in the upload.",
    "MALFORMED_UPLOAD",
  );
}

export function prepareTournamentHistory({
  historyText,
  heroName = "Hero",
  tournamentId: requestedTournamentId,
  tournamentName = null,
  uploadSource = "unknown",
}) {
  const parsedHands = parseHandHistory(historyText, { heroName });
  if (parsedHands.length === 0) throw parseFailure(historyText);
  const allTournamentHands = parsedHands.filter(
    (hand) => String(hand?.gameType || "").toLowerCase() === "tournament",
  );
  if (allTournamentHands.length === 0) {
    throw new TournamentUploadError(
      "Study Spots currently accepts tournament hand histories only.",
      "NO_TOURNAMENT_HANDS",
    );
  }

  const { tournamentId, detectedTournamentIds } = resolveTournamentId(
    allTournamentHands,
    requestedTournamentId,
  );
  if (!tournamentId) {
    throw new TournamentUploadError(
      detectedTournamentIds.length > 1
        ? "The upload contains more than one tournament. Upload one tournament at a time."
        : "The tournament ID could not be resolved from this upload.",
      detectedTournamentIds.length > 1
        ? "MULTIPLE_TOURNAMENTS"
        : "MALFORMED_UPLOAD",
      { detectedTournamentIds },
    );
  }

  const tournamentHands = allTournamentHands.filter(
    (hand) => String(hand?.tournamentId || "").trim() === tournamentId,
  );
  if (tournamentHands.length === 0) {
    throw new TournamentUploadError(
      "No hands matched the selected tournament ID.",
      "NO_TOURNAMENT_HANDS",
      { tournamentId, detectedTournamentIds },
    );
  }

  const filteredHands = filterHandsForReview(tournamentHands, {
    includeOnlyHeroDidNotFoldPreflop: false,
  });
  const sortedHands = sortHands(filteredHands, "newest");
  const compactHands = sortedHands.map(compactHandForApi);
  const summary = summarizeTournamentHands(
    tournamentHands,
    filteredHands,
    heroName,
  );
  const opponentSnapshot = buildOpponentSnapshot(tournamentHands, {
    heroName,
    minHands: 1,
  });

  return {
    tournamentId,
    tournamentName: tournamentName || null,
    heroName,
    uploadSource,
    historyText,
    tournamentPlayedAtEpoch: resolveTournamentPlayedAtEpoch(tournamentHands),
    allHands: tournamentHands,
    compactHands,
    summary,
    opponentSnapshot,
    detectedTournamentIds,
  };
}

export async function saveTournamentHistory(input) {
  const prepared = prepareTournamentHistory(input);
  const saved = await upsertTournamentUpload({
    userId: input.userId,
    tournamentId: prepared.tournamentId,
    heroName: prepared.heroName,
    tournamentName: prepared.tournamentName,
    tournamentPlayedAtEpoch: prepared.tournamentPlayedAtEpoch,
    uploadSource: prepared.uploadSource,
    historyText: prepared.historyText,
    parsedHands: prepared.compactHands,
    opponentSnapshot: prepared.opponentSnapshot,
    summary: prepared.summary,
  });
  return { ...prepared, saved };
}

