import {
  formatStackDepth,
  getLearningResourceHref,
  getResourceState,
} from "../lib/studySpotPresentation.js";
import { trackProductEvent } from "../lib/analytics.js";

function positionLabel(spot) {
  const values = [];
  if (spot.heroPosition && spot.heroPosition !== "unknown") values.push(`Hero ${spot.heroPosition}`);
  if (spot.villainPosition && spot.villainPosition !== "unknown") values.push(`Villain ${spot.villainPosition}`);
  return values.join(" / ");
}

export default function StudySpotCard({
  spot,
  saved = false,
  saving = false,
  queueStatus = "",
  onSave,
  onStatusChange,
  onRemove,
  onOpenReport,
  compact = false,
}) {
  const resourceState = getResourceState(spot);
  const context = spot?.handContext || {};
  const board = Array.isArray(context.board) ? context.board : [];
  const handReference = context.handId || spot.primaryHandKey || "";
  const metadata = [formatStackDepth(spot.stackDepthBb), positionLabel(spot)].filter(Boolean);

  return (
    <article className={`study-spot-card${compact ? " study-spot-card--compact" : ""}`} data-spot-type={spot.type}>
      <div className="study-spot-rank" aria-label={`Priority ${spot.rank || ""}`}>{spot.rank || "-"}</div>
      <div className="study-spot-content">
        <div className="study-spot-heading">
          <div>
            <p className="study-spot-category">{String(spot.category || "Study").replaceAll("-", " ")}</p>
            <h2>{spot.title}</h2>
          </div>
          <span className="study-spot-type">{String(spot.type || "interesting_spot").replaceAll("_", " ")}</span>
        </div>

        {metadata.length > 0 ? <p className="study-spot-meta">{metadata.join(" | ")}</p> : null}
        <p className="study-spot-summary">{spot.summary}</p>
        <div className="study-spot-reason">
          <h3>Why this is worth studying</h3>
          <p>{spot.whyStudyThis}</p>
        </div>
        <p className="study-spot-pattern">
          {spot.occurrenceCount > 1
            ? `${spot.occurrenceCount} similar decisions found`
            : handReference
              ? `Hand ${handReference}`
              : "Single decision"}
        </p>

        {board.length > 0 || context.heroCards?.length > 0 ? (
          <details className="study-hand-context">
            <summary>View hand context</summary>
            <div>
              {context.heroCards?.length > 0 ? <span>Hero: {context.heroCards.join(" ")}</span> : null}
              {board.length > 0 ? <span>Board: {board.join(" ")}</span> : null}
              {context.actionTaken ? <span>Action: {context.actionTaken}</span> : null}
            </div>
          </details>
        ) : null}

        <div className="study-resource" data-resource-state={resourceState.kind}>
          <p>{resourceState.label}</p>
          {resourceState.resource ? (
            <>
              <h3>{resourceState.resource.title}</h3>
              <a
                href={getLearningResourceHref(resourceState.resource)}
                onClick={() =>
                  trackProductEvent("study_resource_opened", {
                    spot_category: spot.category,
                    resource_id: resourceState.resource.id,
                    match_quality: resourceState.kind,
                  })
                }
              >
                Read lesson
              </a>
            </>
          ) : (
            <>
              <h3>{spot.title}</h3>
              <span>This topic is being tracked as a content gap.</span>
            </>
          )}
        </div>

        <div className="study-spot-actions">
          {onSave ? <button type="button" onClick={() => onSave(spot.id)} disabled={saved || saving}>{saved ? "Saved to My Study" : saving ? "Saving..." : "Save to My Study"}</button> : null}
          {onStatusChange ? <button type="button" onClick={() => onStatusChange(spot.id, queueStatus === "completed" ? "to_review" : "completed")}>{queueStatus === "completed" ? "Move to review" : "Mark completed"}</button> : null}
          {onOpenReport ? <button type="button" onClick={() => onOpenReport(spot.reportId)}>Open report</button> : null}
          {onRemove ? <button type="button" className="text-action" onClick={() => onRemove(spot.id)}>Remove</button> : null}
        </div>
      </div>
    </article>
  );
}
