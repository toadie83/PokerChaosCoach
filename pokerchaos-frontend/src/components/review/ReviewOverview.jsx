import SessionCharts from "./SessionCharts.jsx";

function Frequency({ label, count, total, detail, onClick }) {
  const available = Number.isFinite(count) && Number.isFinite(total) && total > 0;
  const percent = available ? (count / total) * 100 : null;
  return (
    <button type="button" className="review-frequency" onClick={onClick}>
      <span className="review-eyebrow">{label} <span aria-hidden="true">↗</span></span>
      <strong>{available ? percent.toFixed(1) : "—"}<small>{available ? "%" : ""}</small></strong>
      <span className="review-frequency-track" aria-hidden="true"><i style={{ width: `${Math.min(100, percent || 0)}%` }} /></span>
      <span className="review-muted">{available ? `${count} / ${total} ${detail}` : "No opportunities yet"}</span>
    </button>
  );
}

function InsightLine({ item, onOpenAudit, clean }) {
  const text = clean(item.text);
  return item.auditTarget ? (
    <button type="button" className={`review-evidence-row ${item.tone || "watch"}`} onClick={() => onOpenAudit(item.auditTarget)}>
      <span className="review-evidence-dot" aria-hidden="true" /><span>{text}</span><span aria-hidden="true">↗</span>
    </button>
  ) : (
    <p className={`review-evidence-row ${item.tone || "watch"}`}><span className="review-evidence-dot" aria-hidden="true" /><span>{text}</span></p>
  );
}

export default function ReviewOverview({
  hands, summary, coaching, primaryLeak, adjustment, strongestArea,
  evidence = [], additional = [], saveAction, onOpenAudit, onOpenStats,
  clean = (text) => text,
}) {
  const rating = coaching?.rating;
  const score = Number(rating?.score10);
  const hasScore = rating?.score10 != null && Number.isFinite(score);
  const preflop = summary?.preflopBreakdown || {};
  const priority = adjustment?.auditTarget ? adjustment : primaryLeak;
  return (
    <div className="review-overview">
      <div className="review-metric-grid">
        <section className="review-score-card" aria-label="Session verdict">
          <div className="review-score-ring" style={{ "--score-progress": `${hasScore ? Math.max(0, Math.min(10, score)) * 10 : 0}%` }}>
            <div><strong>{hasScore ? score.toFixed(1) : "—"}</strong><span>/ 10</span></div>
          </div>
          <div className="review-score-copy">
            <span className="review-eyebrow">Session verdict</span>
            <strong>{rating?.prelimNote ? "Early read" : "Decision score"}</strong>
            <span className="review-muted">{summary.sampleHands} hands analysed</span>
            {saveAction}
          </div>
          {rating?.prelimNote ? <p className="review-score-note">{rating.prelimNote}</p> : null}
        </section>
        <Frequency label="Opening frequency" count={preflop.openedWhenNoRaiseBeforeHero} total={preflop.noRaiseBeforeHeroSpots} detail="unopened spots" onClick={onOpenStats} />
        <Frequency label="Defend vs open" count={preflop.defendedFacingOpen} total={preflop.facingOpenSpots} detail="facing an open" onClick={() => onOpenAudit("preflop_opportunity")} />
        <Frequency label="Blind fold vs open" count={preflop.blindFoldFacingOpen} total={preflop.blindFacingOpenSpots} detail="blind opportunities" onClick={() => onOpenAudit("blind_defense")} />
      </div>

      <SessionCharts hands={hands} summary={summary} onOpenAudit={onOpenAudit} />

      <div className="review-insight-grid">
        <section className="review-priority-panel">
          <div className="review-panel-heading"><span className="review-eyebrow">Your next adjustment</span><span className="review-signal-label"><i /> Study priority</span></div>
          <h3>{clean(primaryLeak?.text || coaching?.primaryLeak || "Build your next edge")}</h3>
          {adjustment ? <p>{clean(adjustment.text)}</p> : null}
          {priority?.auditTarget ? <button type="button" className="review-action-link" onClick={() => onOpenAudit(priority.auditTarget)}>Review the key hands <span aria-hidden="true">↗</span></button> : null}
          {strongestArea ? <div className="review-strength"><span aria-hidden="true">✓</span><div><span className="review-eyebrow">Keep doing this</span><strong>{clean(strongestArea)}</strong></div></div> : null}
        </section>

        <section className="review-evidence-panel">
          <div className="review-panel-heading"><h3>Behind the verdict</h3><span className="review-muted">{evidence.length} signals</span></div>
          <div>{evidence.map((item, index) => <InsightLine key={index} item={item} clean={clean} onOpenAudit={onOpenAudit} />)}</div>
          {!evidence.length ? <p className="review-muted">More hands will help establish your session tendencies.</p> : null}
          {rating?.topDrags?.length ? <details className="review-detail-disclosure"><summary>What affected my score?</summary><div className="review-score-drags">{rating.topDrags.map((drag, index) => <div key={index}><span>{drag.label}</span><strong>−{drag.points.toFixed(1)} pts</strong></div>)}</div></details> : null}
        </section>
      </div>
      {additional.length ? <details className="review-detail-disclosure review-additional"><summary>More ways to improve <span>{additional.length} observations</span></summary><div>{additional.map((item, index) => <InsightLine key={index} item={item} clean={clean} onOpenAudit={onOpenAudit} />)}</div></details> : null}
    </div>
  );
}
