import { useEffect, useMemo, useState } from "react";
import { resolveHandBbResult } from "../lib/handResult.js";

const STREET_ORDER = ["preflop", "flop", "turn", "river"];

function formatCards(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return "Unknown";
  return cards.join(" ");
}

function confidenceLabel(value) {
  const confidence = String(value || "")
    .trim()
    .toLowerCase();
  if (confidence === "high") return "High confidence";
  if (confidence === "low") return "Low confidence";
  return "Moderate confidence";
}

function normalizeStreetReviews(streetReviews = []) {
  const rows = Array.isArray(streetReviews) ? streetReviews : [];
  return rows
    .slice()
    .sort((a, b) => {
      const aIdx = STREET_ORDER.indexOf(String(a?.street || "").toLowerCase());
      const bIdx = STREET_ORDER.indexOf(String(b?.street || "").toLowerCase());
      return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
    });
}

function actionLabel(action = {}) {
  const verb = String(action?.action || "").trim() || "n/a";
  const sizing =
    String(action?.sizing || action?.size || "")
      .trim() || "";
  return sizing ? `${verb} (${sizing})` : verb;
}

function normalizeCard(card) {
  const raw = String(card || "").trim();
  if (!raw) return "";
  if (raw.length < 2) return raw;
  const rank = raw.slice(0, -1).toUpperCase();
  const suit = raw.slice(-1).toLowerCase();
  return `${rank}${suit}`;
}

function boardCardsForStreet(hand, street) {
  const streetKey = String(street || "").toLowerCase();
  if (streetKey === "preflop") return [];
  const flop = Array.isArray(hand?.board?.flop) ? hand.board.flop : [];
  const turn = hand?.board?.turn;
  const river = hand?.board?.river;
  const cards = [];
  flop.forEach((card) => {
    const normalized = normalizeCard(card);
    if (normalized) cards.push(normalized);
  });
  if ((streetKey === "turn" || streetKey === "river") && turn) {
    const normalizedTurn = normalizeCard(turn);
    if (normalizedTurn) cards.push(normalizedTurn);
  }
  if (streetKey === "river" && river) {
    const normalizedRiver = normalizeCard(river);
    if (normalizedRiver) cards.push(normalizedRiver);
  }
  return cards;
}

function formatBoardMetric(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return "-";
  return cards.join("");
}

function formatHeroSeat(hand) {
  const label = String(hand?.heroPosition || hand?.heroSeat || "")
    .trim()
    .toUpperCase();
  return label || "";
}

function normalizeQaItems(items = []) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => item && typeof item === "object");
}

function normalizeReviewHeadline(raw) {
  const value = String(raw || "").trim();
  if (!value) return "Full Hand Review";
  if (/street-by-street decision review|street-by-street review/i.test(value)) {
    return "Full Hand Review";
  }
  if (/preflop decision leak/i.test(value)) return "Preflop Pressure Spot";
  if (/flop decision leak/i.test(value)) return "Flop Decision Spot";
  if (/turn decision leak/i.test(value)) return "Tough Turn Decision";
  if (/river decision leak/i.test(value)) return "River Decision Spot";
  return value;
}

function mistakesPillLabel(count) {
  const total = Math.max(0, Number(count) || 0);
  if (total === 0) return "No major mistakes found";
  if (total === 1) return "1 key adjustment";
  return `${total} key adjustments`;
}

function summaryFocusText(raw, mistakesFound) {
  const text = String(raw || "").trim();
  if (!text || /no major leak flagged/i.test(text)) {
    return mistakesFound <= 0 ? "Solid overall execution." : "No single dominant issue; review timeline spots.";
  }
  return text;
}
function compactText(text, max = 180) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3)).trim()}...`;
}

function firstSentences(text, count = 1, max = 180) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  const parts = value
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return compactText(value, max);
  return compactText(parts.slice(0, count).join(" "), max);
}

function bannerHeadline(text, fallback = "") {
  const value = firstSentences(text, 1, 170);
  if (!value) return firstSentences(fallback, 1, 170);
  return value;
}

function buildHeroInsightBanner({ focusText, strategicSummary, primaryAdjustment, mistakesFound }) {
  const focus = bannerHeadline(focusText);
  const summary = bannerHeadline(strategicSummary);
  const adjustment = bannerHeadline(primaryAdjustment);
  if (mistakesFound <= 0) {
    return bannerHeadline(
      summary || focus || "Solid overall execution with no major adjustments required.",
      "Solid overall execution.",
    );
  }
  return bannerHeadline(
    focus || adjustment || summary || "Main adjustment identified in this hand.",
    "Main adjustment identified in this hand.",
  );
}

function normalizeTagKey(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const STRATEGIC_THEME_LABELS = {
  pressure_leak: "Pressure Spot",
  high_pressure_node: "Pressure Spot",
  missed_jam: "Short Stack Jam",
  stack_off_threshold: "Stack-Off Spot",
  thin_value: "Thin Value",
  hero_call: "Bluff Catch",
  bluff_catcher_node: "Bluff Catch",
  overfold_river: "River Discipline",
  passive_line: "Passive Line",
  passive_leak: "Passive Line",
  pot_control: "Pot Control",
  sizing_leak: "Sizing Discipline",
  suspicious_sizing: "Sizing Discipline",
  open_raise: "Opening Discipline",
  preflop_aggression: "Preflop Aggression",
  medium_pressure: "Pressure Spot",
  low_pressure: "Pressure Spot",
  stack_depth_30bb: "Stack Depth Spot",
  value_bet: "Value Betting",
  protection_bet: "Protection Spot",
  range_advantage: "Range Advantage",
  blind_defense: "Blind Defense",
};

function simplifiedStrategicThemes(tags = []) {
  const normalized = Array.isArray(tags) ? tags : [];
  const mapped = normalized
    .map((tag) => {
      const key = normalizeTagKey(tag);
      if (!key) return "";
      return STRATEGIC_THEME_LABELS[key] || String(tag || "").replace(/_/g, " ").trim();
    })
    .map((label) =>
      String(label || "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
  return Array.from(new Set(mapped)).slice(0, 5);
}

function classifyStreetChip(streetReview = {}) {
  const tags = (
    Array.isArray(streetReview?.strategic_tags)
      ? streetReview.strategic_tags
      : Array.isArray(streetReview?.tags)
        ? streetReview.tags
        : []
  )
    .map((tag) => normalizeTagKey(tag))
    .filter(Boolean);
  const score = Number(streetReview?.score);
  if (tags.includes("thin_value")) return { label: "Thin Value", tone: "info" };
  if (tags.includes("overfold_river") || tags.includes("sizing_leak")) {
    return { label: "Overplayed", tone: "bad" };
  }
  if (tags.includes("passive_line") || tags.includes("passive_leak")) {
    return { label: "Passive", tone: "warn" };
  }
  if (Number.isFinite(score) && score <= -2) return { label: "Major Mistake", tone: "bad" };
  if (Number.isFinite(score) && score === -1) return { label: "Slight Mistake", tone: "warn" };
  if (Number.isFinite(score) && score >= 1) return { label: "Well Played", tone: "good" };
  return { label: "Good", tone: "good" };
}

export default function HandReviewV2Modal({
  open,
  hand,
  review,
  onClose,
  showDeveloperQa = false,
}) {
  const [activeTab, setActiveTab] = useState("insight");
  const [activeTimelineStreet, setActiveTimelineStreet] = useState("");
  const streetIntelligence =
    review && typeof review === "object" ? review.street_intelligence || {} : {};
  const summary =
    streetIntelligence && typeof streetIntelligence.hand_summary === "object"
      ? streetIntelligence.hand_summary
      : {};
  const streetReviews = useMemo(
    () => normalizeStreetReviews(streetIntelligence?.street_reviews || []),
    [streetIntelligence],
  );
  const allTags = useMemo(() => {
    const tags = Array.isArray(streetIntelligence?.tags) ? streetIntelligence.tags : [];
    return tags.filter(Boolean).slice(0, 14);
  }, [streetIntelligence]);
  const keyMistakes = useMemo(() => {
    const items = Array.isArray(streetIntelligence?.key_mistakes)
      ? streetIntelligence.key_mistakes
      : [];
    return items.filter(Boolean).slice(0, 6);
  }, [streetIntelligence]);
  const qaEvaluation =
    review && typeof review?.evaluation === "object" ? review.evaluation : null;
  const qaWarnings = useMemo(() => {
    const reportWarnings = normalizeQaItems(review?.evaluation_report?.warnings);
    if (reportWarnings.length > 0) return reportWarnings;
    return normalizeQaItems(qaEvaluation?.warnings);
  }, [review, qaEvaluation]);
  const qaSuggestions = useMemo(() => {
    const reportSuggestions = Array.isArray(review?.evaluation_report?.suggestions)
      ? review.evaluation_report.suggestions.filter(Boolean)
      : [];
    if (reportSuggestions.length > 0) return reportSuggestions;
    return Array.isArray(qaEvaluation?.suggestions)
      ? qaEvaluation.suggestions.filter(Boolean)
      : [];
  }, [review, qaEvaluation]);
  const qaScore = Number(qaEvaluation?.overall_score);
  const qaScoreLabel = Number.isFinite(qaScore) ? Math.round(qaScore) : null;
  const qaHallucinationRisk = Number(qaEvaluation?.categories?.hallucination_risk);
  const qaCoherence = Number(qaEvaluation?.categories?.coherence);

  useEffect(() => {
    if (!open) return;
    setActiveTab("insight");
    const firstStreet = STREET_ORDER.find((street) =>
      streetReviews.some((row) => String(row?.street || "").toLowerCase() === street),
    );
    setActiveTimelineStreet(firstStreet || "");
  }, [open, streetReviews]);

  if (!open) return null;

  const handLabel = String(hand?.handId || "").trim() || "Hand review";
  const heroSeat = formatHeroSeat(hand);
  const heroCards = formatCards(hand?.heroCards);
  const resultLabel =
    String(hand?.heroOutcome?.label || "").trim() ||
    String(hand?.heroOutcome?.code || "").trim() ||
    "Outcome unknown";
  const playedAt = String(hand?.playedAt || "").trim() || "Unknown time";
  const headline = normalizeReviewHeadline(summary?.headline);
  const confidence = confidenceLabel(summary?.confidence || review?.confidence);
  const handBbResult = resolveHandBbResult(hand || {});
  const mistakesFound = Math.max(0, Number(summary?.mistakes_found) || 0);
  const focusLabel = mistakesFound <= 0 ? "Overall note" : "Primary focus";
  const focusText = summaryFocusText(
    summary?.biggest_leak || review?.primary_leak || "",
    mistakesFound,
  );
  const strategicSummaryText = String(
    summary?.strategic_summary || review?.what_was_good || "No additional summary provided.",
  ).trim();
  const primaryAdjustmentText = String(
    summary?.primary_adjustment || review?.better_line || "No adjustment provided.",
  ).trim();
  const heroInsightBanner = buildHeroInsightBanner({
    focusText,
    strategicSummary: strategicSummaryText,
    primaryAdjustment: primaryAdjustmentText,
    mistakesFound,
  });
  const coachingTakeaway =
    firstSentences(focusText || primaryAdjustmentText || strategicSummaryText, 1, 220) ||
    "No major mistakes found.";
  const coachingWhyItMatters =
    firstSentences(strategicSummaryText || focusText, 2, 260) ||
    "This spot is mostly about preserving EV through disciplined pressure management.";
  const coachingAlternative =
    firstSentences(primaryAdjustmentText || focusText, 2, 220) ||
    "Keep a disciplined default line and deviate only with clear exploit evidence.";
  const simplifiedThemes = simplifiedStrategicThemes(allTags);
  const headerMeta = [handLabel, heroSeat, heroCards, resultLabel, playedAt].filter(Boolean).join(" | ");

  const streetReviewByStreet = useMemo(() => {
    const map = new Map();
    streetReviews.forEach((row) => {
      const key = String(row?.street || "").toLowerCase();
      if (!key) return;
      map.set(key, row);
    });
    return map;
  }, [streetReviews]);

  const selectedStreetReview =
    streetReviewByStreet.get(String(activeTimelineStreet || "").toLowerCase()) ||
    streetReviews[0] ||
    null;
  const insightStreetReviews = useMemo(
    () =>
      streetReviews.filter((row) => {
        if (row?.skipped) return false;
        const action = String(row?.action_taken?.action || "").trim().toLowerCase();
        if (!action || action === "none") return false;
        return Number.isFinite(Number(row?.score));
      }),
    [streetReviews],
  );

  return (
    <div className="modal-backdrop review-v2-backdrop" onClick={onClose}>
      <div
        className="modal hand-review-modal review-v2-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Review for ${handLabel}`}
      >
        <div className="modal-header review-v2-header">
          <div className="review-v2-header-main">
            <h3 className="modal-title">{headline}</h3>
            <p className="review-v2-header-meta">
              {headerMeta}
            </p>
            <div className="review-v2-summary-pills">
              <span className={`score-pill ${handBbResult.tone}`}>
                Result {handBbResult.label}
              </span>
              <span className="review-confidence-pill">{confidence}</span>
              <span className="review-confidence-pill">
                {mistakesPillLabel(mistakesFound)}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="hand-review-modal-close"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="review-v2-tabs" role="tablist" aria-label="Review sections">
          {[
            { id: "insight", label: "Insight" },
            { id: "timeline", label: "Timeline" },
            { id: "chat", label: "Chat" },
            { id: "replay", label: "Replay" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`review-v2-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="modal-body review-v2-body">
          {activeTab === "insight" ? (
            <div className="review-v2-panel">
              <section className="review-v2-insight-banner" aria-label="Hero insight banner">
                <p className="review-v2-label">Hero insight</p>
                <p className="review-v2-insight-banner-copy">{heroInsightBanner}</p>
              </section>

              {insightStreetReviews.length > 0 ? (
                <section className="review-v2-street-summary-chips" aria-label="Quick street summary">
                  {insightStreetReviews.map((row) => {
                  const street = String(row?.street || "").toLowerCase();
                  if (!street) return null;
                  const chip = classifyStreetChip(row);
                  return (
                    <span
                      key={`street-chip-${street}`}
                      className={`review-v2-street-chip ${chip.tone}`}
                    >
                      <strong>{street.toUpperCase()}</strong>: {chip.label}
                    </span>
                  );
                  })}
                </section>
              ) : null}

              <section className="review-v2-coaching-block" aria-label="Main coaching section">
                <div className="review-v2-coaching-row">
                  <p className="review-v2-label">Biggest takeaway</p>
                  <p>{coachingTakeaway}</p>
                </div>
                <div className="review-v2-coaching-row">
                  <p className="review-v2-label">Why it matters</p>
                  <p>{coachingWhyItMatters}</p>
                </div>
                <div className="review-v2-coaching-row">
                  <p className="review-v2-label">Better alternative</p>
                  <p>{coachingAlternative}</p>
                </div>
              </section>

              {simplifiedThemes.length > 0 ? (
                <section className="review-v2-themes" aria-label="Strategic themes">
                  <p className="review-v2-label">Strategic themes</p>
                  <div className="review-v2-tags-wrap">
                    {simplifiedThemes.map((theme) => (
                      <span key={`theme-${theme}`} className="review-v2-tag review-v2-theme-tag">
                        {theme}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              {showDeveloperQa ? (
                <details className="review-v2-devqa">
                  <summary className="review-v2-devqa-summary">
                    Developer QA
                    {qaScoreLabel !== null ? ` • ${qaScoreLabel}` : ""}
                    {qaWarnings.length > 0 ? ` • ! ${qaWarnings.length}` : ""}
                  </summary>
                  {qaEvaluation ? (
                    <div className="review-v2-devqa-body">
                      <div className="review-v2-devqa-metrics">
                        <span>Review quality {qaScoreLabel ?? "-"}</span>
                        <span>
                          Hallucination risk{" "}
                          {Number.isFinite(qaHallucinationRisk)
                            ? `${Math.round(qaHallucinationRisk)}`
                            : "-"}
                        </span>
                        <span>
                          Coherence{" "}
                          {Number.isFinite(qaCoherence) ? `${Math.round(qaCoherence)}` : "-"}
                        </span>
                      </div>
                      <div className="review-v2-devqa-columns">
                        <div>
                          <p className="review-v2-label">Warnings</p>
                          {qaWarnings.length > 0 ? (
                            <ul className="review-v2-devqa-list">
                              {qaWarnings.slice(0, 8).map((warning, index) => {
                                const code = String(warning?.code || "").trim();
                                const message = String(warning?.message || "").trim();
                                return (
                                  <li key={`warning-${code || index}`}>
                                    {code || "warning"}
                                    {message ? ` — ${message}` : ""}
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="review-v2-devqa-empty">No warnings.</p>
                          )}
                        </div>
                        <div>
                          <p className="review-v2-label">Suggestions</p>
                          {qaSuggestions.length > 0 ? (
                            <ul className="review-v2-devqa-list">
                              {qaSuggestions.slice(0, 8).map((suggestion, index) => (
                                <li key={`suggestion-${index}`}>{String(suggestion)}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="review-v2-devqa-empty">No suggestions.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="review-v2-devqa-body">
                      <p className="review-v2-devqa-empty">
                        QA telemetry is not available for this review.
                      </p>
                    </div>
                  )}
                </details>
              ) : null}
            </div>
          ) : null}
          {activeTab === "timeline" ? (
            <div className="review-v2-panel review-v2-timeline">
              <div className="review-v2-street-panel">
                <div className="review-v2-street-toolbar">
                  <div className="review-v2-street-tabs" role="tablist" aria-label="Street timeline">
                    {STREET_ORDER.map((street) => {
                      const isActive = street === String(activeTimelineStreet || "").toLowerCase();
                      const hasStreetReview = streetReviewByStreet.has(street);
                      return (
                        <button
                          key={street}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          aria-disabled={!hasStreetReview}
                          className={`review-v2-street-tab ${isActive ? "active" : ""}`}
                          onClick={() => {
                            if (!hasStreetReview) return;
                            setActiveTimelineStreet(street);
                          }}
                          disabled={!hasStreetReview}
                        >
                          {street.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                  {selectedStreetReview ? (
                    <div className="review-v2-summary-pills review-v2-street-score-pills">
                      <span className={`score-pill ${handBbResult.tone}`}>
                        Result {handBbResult.label}
                      </span>
                    </div>
                  ) : null}
                </div>
                {selectedStreetReview ? (
                  <article className="review-v2-street-card review-v2-street-card--active">
                    {(() => {
                      const boardCards = boardCardsForStreet(hand, selectedStreetReview?.street);
                      return (
                        <div className="review-v2-street-body">
                          {(Array.isArray(selectedStreetReview?.strategic_tags)
                            ? selectedStreetReview.strategic_tags
                            : Array.isArray(selectedStreetReview?.tags)
                              ? selectedStreetReview.tags
                              : []
                          ).length > 0 ? (
                            <div className="review-v2-tags-wrap">
                              {(Array.isArray(selectedStreetReview?.strategic_tags)
                                ? selectedStreetReview.strategic_tags
                                : Array.isArray(selectedStreetReview?.tags)
                                  ? selectedStreetReview.tags
                                  : []
                              )
                                .slice(0, 6)
                                .map((tag) => (
                                  <span key={`${selectedStreetReview?.street}-${tag}`} className="review-v2-tag">
                                    {tag}
                                  </span>
                                ))}
                            </div>
                          ) : null}
                          <div className="review-v2-metric-row">
                            <span>Board {formatBoardMetric(boardCards)}</span>
                            <span>Pot {selectedStreetReview?.metrics?.pot_size_bb ?? "-"}bb</span>
                            <span>SPR {selectedStreetReview?.metrics?.spr ?? "-"}</span>
                            <span>Facing {selectedStreetReview?.metrics?.facing_size_bb ?? "-"}bb</span>
                            <span>Odds {selectedStreetReview?.metrics?.pot_odds || "-"}</span>
                          </div>
                          <div className="review-v2-action-row">
                            <p>
                              <strong>Action taken:</strong>{" "}
                              {actionLabel(selectedStreetReview?.action_taken)}
                            </p>
                            <p>
                              <strong>Preferred action:</strong>{" "}
                              {actionLabel(selectedStreetReview?.preferred_action)}
                            </p>
                          </div>
                          <div className="review-v2-analysis-grid">
                            <div>
                              <p className="review-v2-label">Insight</p>
                              <p>{selectedStreetReview?.analysis?.insight || "-"}</p>
                            </div>
                            <div>
                              <p className="review-v2-label">Range context</p>
                              <p>{selectedStreetReview?.analysis?.range_context || "-"}</p>
                            </div>
                            <div>
                              <p className="review-v2-label">Board texture</p>
                              <p>{selectedStreetReview?.analysis?.board_texture || "-"}</p>
                            </div>
                            <div>
                              <p className="review-v2-label">Sizing commentary</p>
                              <p>{selectedStreetReview?.analysis?.sizing_commentary || "-"}</p>
                            </div>
                            <div>
                              <p className="review-v2-label">Plan commentary</p>
                              <p>{selectedStreetReview?.analysis?.plan_commentary || "-"}</p>
                            </div>
                            <div>
                              <p className="review-v2-label">Takeaway</p>
                              <p>{selectedStreetReview?.analysis?.takeaway || "-"}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </article>
                ) : null}
              </div>
            </div>
          ) : null}

          {activeTab === "chat" ? (
            <div className="review-v2-placeholder">
              <p>Chat tab placeholder for future AI hand discussion.</p>
            </div>
          ) : null}

          {activeTab === "replay" ? (
            <div className="review-v2-placeholder">
              <p>Replay controls placeholder for future action timeline and animation overlays.</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}



