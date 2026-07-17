import { useMemo, useState } from "react";

function truncate(text, limit = 120) {
  if (!text) return "";
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit - 1)}...`;
}

function formatTickerItem(item) {
  if (!item) return "";
  return item;
}

export default function DecisionCard({
  coach,
  isLoading,
  handComplete,
  onNextStreet,
  onResetHand,
  sizingNote,
  previewSizing,
  statusBadges = [],
  ticker = [],
  alternativeSizes = [],
  onSelectAlternativeSize,
  comparison,
}) {
  const [expanded, setExpanded] = useState(false);
  const action = coach?.hero_action ? String(coach.hero_action).toUpperCase() : null;
  const sizing = coach?.sizing ?? "";
  const flavor = coach?.flavor_text ?? "";
  const reasoning = coach?.reasoning ?? "";
  const confidence = coach?.confidence ?? "";
  const assumptions = Array.isArray(coach?.assumptions)
    ? coach.assumptions.filter(Boolean)
    : [];
  const alternativeAction = coach?.alternative_action ?? "";
  const alternativeSizing = coach?.alternative_sizing ?? "";
  const hasDetails = flavor && flavor.length > 0;
  const summary = useMemo(() => truncate(flavor), [flavor]);

  // const showAlternative = Array.isArray(alternativeSizes) && alternativeSizes.length > 0;

  return (
    <div className="decision-card">
      <div className="decision-card-header">
        <div className="decision-headline">
          {isLoading ? (
            <span className="decision-loading">Summoning chaos...</span>
          ) : action ? (
            <>
              <span className="decision-action">{action}</span>
              {sizing ? <span className="decision-sizing">{sizing}</span> : null}
            </>
          ) : (
            <span className="decision-placeholder">Trigger an event to get guidance.</span>
          )}
        </div>
        <div className="decision-cta">
          {handComplete ? (
            <button className="primary" onClick={onResetHand}>
              Start Next Hand
            </button>
          ) : (
            <button className="primary" onClick={onNextStreet} disabled={!onNextStreet}>
              Next Street
            </button>
          )}
        </div>
      </div>

      {statusBadges.length > 0 ? (
        <div className="decision-badges">
          {statusBadges.map((badge) => {
            const key = `${badge.label}-${badge.value ?? ""}`;
            const content = (
              <>
                {badge.icon ? <span className="badge-icon">{badge.icon}</span> : null}
                <span className="badge-label">{badge.label}</span>
                {badge.value ? <span className="badge-value">{badge.value}</span> : null}
              </>
            );
            const clickable = typeof badge.onClick === "function";
            const variantClass = badge.variant ? ` ${badge.variant}` : "";
            if (clickable) {
              return (
                <button
                  type="button"
                  key={key}
                  className={`badge badge-button clickable${variantClass}`}
                  onClick={badge.onClick}
                >
                  {content}
                </button>
              );
            }
            return (
              <span key={key} className={`badge${variantClass}`}>
                {content}
              </span>
            );
          })}
        </div>
      ) : null}

      {isLoading ? null : (
        <>
          {hasDetails ? (
            <p className="decision-summary">
              {expanded ? flavor : summary}
              {flavor.length > summary.length ? (
                <button
                  type="button"
                  className="link-btn decision-toggle"
                  onClick={() => setExpanded((v) => !v)}
                >
                  {expanded ? "Hide details" : "Show details"}
                </button>
              ) : null}
            </p>
          ) : null}

          {action && (confidence || reasoning || assumptions.length || alternativeAction) ? (
            <div className="decision-analysis">
              {confidence ? (
                <span className={`decision-confidence confidence-${confidence}`}>
                  {String(confidence).toUpperCase()} confidence
                </span>
              ) : null}
              {reasoning && reasoning !== flavor ? (
                <p><strong>Why:</strong> {reasoning}</p>
              ) : null}
              {alternativeAction ? (
                <p>
                  <strong>Alternative:</strong> {String(alternativeAction).toUpperCase()}
                  {alternativeSizing ? ` · ${alternativeSizing}` : ""}
                </p>
              ) : null}
              {assumptions.length ? (
                <p><strong>Assumptions:</strong> {assumptions.join("; ")}</p>
              ) : null}
            </div>
          ) : null}

          {sizingNote ? (
            <p className="decision-note">
              <span className="badge muted">Sizing</span> {sizingNote}
            </p>
          ) : null}

          {comparison?.actualAction ? (
            <div
              className={`decision-comparison ${
                comparison.lineMatched ? "is-match" : "is-different"
              }`}
            >
              <strong>
                {comparison.lineMatched
                  ? "Line matched"
                  : comparison.actionMatched
                    ? "Action matched · sizing differs"
                    : "Review the action difference"}
              </strong>
              <span>
                Hero: {String(comparison.actualAction).toUpperCase()}
                {comparison.actualAmountBB ? ` ${comparison.actualAmountBB} BB` : ""}
              </span>
              <span>
                Coach: {String(comparison.recommendedAction || "unknown").toUpperCase()}
                {comparison.recommendedSizing ? ` · ${comparison.recommendedSizing}` : ""}
              </span>
              {comparison.confidence ? (
                <span>Confidence: {comparison.confidence}</span>
              ) : null}
              {comparison.sizingMatched === false ? (
                <span>
                  Suggested size: {comparison.recommendedAmountBB} BB · recorded: {comparison.actualAmountBB} BB
                </span>
              ) : null}
            </div>
          ) : null}

          {/* {previewSizing ? (
            <p className="decision-note muted">
              Previewing: {previewSizing}
            </p>
          ) : null}

          {showAlternative ? (
            <div className="decision-sizing-ladder">
              {alternativeSizes.map((size) => (
                <button
                  key={size.code || size.label}
                  type="button"
                  className="sizing-pill"
                  onClick={() => onSelectAlternativeSize?.(size)}
                  title={size.hint || "Preview sizing"}
                >
                  {size.label}
                </button>
              ))}
            </div>
          ) : null} */}
        </>
      )}

      {ticker.length > 0 ? (
        <div className="decision-ticker" aria-live="polite">
          {ticker
            .filter(Boolean)
            .map((item, idx) => (
              <span key={`${item}-${idx}`} className="ticker-item">
                {formatTickerItem(item)}
                {idx < ticker.length - 1 ? (
                  <span className="ticker-sep">&#8594;</span>
                ) : null}
              </span>
            ))}
        </div>
      ) : null}
    </div>
  );
}




