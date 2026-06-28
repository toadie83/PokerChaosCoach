import { useMemo, useState } from "react";

const MIN_VALID_TOURNAMENT_DATE_MS = Date.UTC(2000, 0, 1);

function toFiniteNumber(value, fallback = null) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function resolveSnapshotDate(snapshot) {
  const tournamentDate = new Date(snapshot?.tournamentPlayedAt);
  if (
    Number.isFinite(tournamentDate.getTime()) &&
    tournamentDate.getTime() >= MIN_VALID_TOURNAMENT_DATE_MS
  ) {
    return tournamentDate;
  }

  const createdDate = new Date(snapshot?.createdAt);
  if (Number.isFinite(createdDate.getTime())) return createdDate;
  return null;
}

function formatDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatScore(value) {
  const score = toFiniteNumber(value, 0);
  return `${score.toFixed(1)}/10`;
}

function normaliseSnapshots(snapshots) {
  return (Array.isArray(snapshots) ? snapshots : [])
    .map((snapshot) => {
      const date = resolveSnapshotDate(snapshot);
      const score10 = toFiniteNumber(snapshot?.score10);
      const tournamentId = String(snapshot?.tournamentId || "").trim();
      if (!tournamentId || score10 === null || !date) {
        return null;
      }
      return {
        ...snapshot,
        tournamentId,
        label:
          String(snapshot?.tournamentName || "").trim() ||
          `Tournament ${tournamentId}`,
        date,
        dateMs: date.getTime(),
        score10: Math.max(0, Math.min(10, score10)),
        scorePct: toFiniteNumber(snapshot?.scorePct),
        sampleHands: toFiniteNumber(snapshot?.sampleHands),
        totalHands: toFiniteNumber(snapshot?.totalHands),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.dateMs - b.dateMs);
}

export default function TournamentPerformanceChart({
  snapshots = [],
  loading = false,
  error = "",
  onRemoveSnapshot = null,
  removingSnapshotId = "",
}) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const [pinnedIndex, setPinnedIndex] = useState(null);
  const points = useMemo(() => normaliseSnapshots(snapshots), [snapshots]);

  const chart = useMemo(() => {
    const width = 720;
    const height = 260;
    const pad = { top: 26, right: 28, bottom: 38, left: 44 };
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;
    const minDate = points[0]?.dateMs || Date.now();
    const maxDate = points[points.length - 1]?.dateMs || minDate;
    const span = Math.max(1, maxDate - minDate);
    const uniqueDayCount = new Set(
      points.map((point) => point.date.toISOString().slice(0, 10)),
    ).size;
    const useEvenSpacing = points.length > 1 && uniqueDayCount <= 1;

    const plotted = points.map((point, index) => {
      const x =
        points.length === 1
          ? pad.left + plotWidth / 2
          : useEvenSpacing
            ? pad.left + (index / Math.max(1, points.length - 1)) * plotWidth
            : pad.left + ((point.dateMs - minDate) / span) * plotWidth;
      const y = pad.top + ((10 - point.score10) / 10) * plotHeight;
      return { ...point, x, y };
    });

    return {
      width,
      height,
      pad,
      plotWidth,
      plotHeight,
      points: plotted,
      segments: plotted.slice(1).map((point, index) => {
        const previous = plotted[index];
        const dx = point.x - previous.x;
        const dy = point.y - previous.y;
        return {
          key: `${previous.tournamentId}-${point.tournamentId}-${index}`,
          leftPct: (previous.x / width) * 100,
          topPct: (previous.y / height) * 100,
          widthPct: (Math.sqrt(dx * dx + dy * dy) / width) * 100,
          angle: (Math.atan2(dy, dx) * 180) / Math.PI,
        };
      }),
      linePath: plotted
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
        .join(" "),
    };
  }, [points]);

  const latest = points[points.length - 1] || null;
  const best = points.reduce(
    (currentBest, point) =>
      !currentBest || point.score10 > currentBest.score10 ? point : currentBest,
    null,
  );
  const delta =
    points.length >= 2 ? latest.score10 - points[0].score10 : null;
  const activeIndex = Number.isInteger(pinnedIndex) ? pinnedIndex : hoverIndex;
  const activePoint =
    Number.isInteger(activeIndex) && chart.points[activeIndex]
      ? chart.points[activeIndex]
      : null;
  const activePointIsPinned =
    Number.isInteger(pinnedIndex) && chart.points[pinnedIndex];
  const activeTooltipLeftPct = activePoint
    ? Math.min(82, Math.max(18, (activePoint.x / chart.width) * 100))
    : 50;
  const activeTooltipTopPct = activePoint
    ? Math.min(86, Math.max(14, (activePoint.y / chart.height) * 100))
    : 50;
  const activeTooltipPlacement =
    activePoint && activePoint.y < chart.pad.top + 70
      ? "is-below"
      : "is-above";
  const removingActivePoint =
    activePoint &&
    String(activePoint.tournamentId || "").trim() ===
      String(removingSnapshotId || "").trim();

  return (
    <section className="performance-chart" aria-label="Tournament performance trend">
      <div className="performance-chart-head">
        <div>
          <p className="performance-chart-kicker">Performance Trend</p>
          <h3>Saved session verdicts</h3>
        </div>
        <p className="performance-chart-copy">
          Track tournament scores over time from saved review verdicts.
        </p>
      </div>

      {points.length > 0 ? (
        <div className="performance-chart-summary" aria-label="Performance summary">
          <div className="performance-chart-stat">
            <span>Saved</span>
            <strong>{points.length}</strong>
          </div>
          <div className="performance-chart-stat">
            <span>Latest</span>
            <strong>{formatScore(latest.score10)}</strong>
          </div>
          <div className="performance-chart-stat">
            <span>Best</span>
            <strong>{formatScore(best.score10)}</strong>
          </div>
          <div className="performance-chart-stat">
            <span>Delta</span>
            <strong>
              {delta === null
                ? "n/a"
                : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`}
            </strong>
          </div>
        </div>
      ) : null}

      <div className="performance-chart-body">
        {loading ? (
          <div className="performance-chart-empty">Loading performance trend...</div>
        ) : error ? (
          <div className="performance-chart-error">{error}</div>
        ) : points.length === 0 ? (
          <div className="performance-chart-empty">
            Save session verdicts after parsing tournaments to build your trend.
          </div>
        ) : (
          <>
            <svg
              className="performance-chart-svg"
              viewBox={`0 0 ${chart.width} ${chart.height}`}
              role="img"
              aria-label={`${points.length} saved tournament performance scores from 0 to 10`}
            >
              <defs>
                <linearGradient id="performanceChartLine" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#a76155" />
                  <stop offset="100%" stopColor="#0f766e" />
                </linearGradient>
              </defs>

              {[0, 2, 4, 6, 8, 10].map((tick) => {
                const y =
                  chart.pad.top + ((10 - tick) / 10) * chart.plotHeight;
                return (
                  <g key={tick}>
                    <line
                      className="performance-chart-grid"
                      x1={chart.pad.left}
                      x2={chart.width - chart.pad.right}
                      y1={y}
                      y2={y}
                    />
                    <text
                      className="performance-chart-axis-label"
                      x={chart.pad.left - 12}
                      y={y + 4}
                      textAnchor="end"
                    >
                      {tick}
                    </text>
                  </g>
                );
              })}

              {chart.points.length > 1 ? (
                <path
                  className="performance-chart-line"
                  d={chart.linePath}
                  fill="none"
                  stroke="#a76155"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="5"
                />
              ) : null}

              {chart.points.map((point, index) => (
                <circle
                  key={`${point.tournamentId}-${point.dateMs}`}
                  className="performance-chart-dot"
                  cx={point.x}
                  cy={point.y}
                  fill="#a76155"
                  r={activeIndex === index ? 8 : 6}
                  stroke="#ffffff"
                  strokeWidth="3"
                  tabIndex={0}
                  role="button"
                  aria-label={`${point.label}, ${formatDate(point.date)}, ${formatScore(point.score10)}`}
                  onMouseEnter={() => setHoverIndex(index)}
                  onMouseLeave={() => setHoverIndex(null)}
                  onFocus={() => setHoverIndex(index)}
                  onBlur={() => setHoverIndex(null)}
                  onClick={() =>
                    setPinnedIndex((previous) =>
                      previous === index ? null : index,
                    )
                  }
                >
                  <title>
                    {`${point.label} - ${formatDate(point.date)} - ${formatScore(point.score10)}`}
                  </title>
                </circle>
              ))}
            </svg>

            <div className="performance-chart-overlay">
              {chart.segments.map((segment) => (
                <span
                  key={segment.key}
                  className="performance-chart-segment"
                  style={{
                    left: `${segment.leftPct}%`,
                    top: `${segment.topPct}%`,
                    width: `${segment.widthPct}%`,
                    transform: `rotate(${segment.angle}deg)`,
                  }}
                />
              ))}
              {chart.points.map((point, index) => (
                <button
                  type="button"
                  key={`overlay-${point.tournamentId}-${point.dateMs}`}
                  className={`performance-chart-point ${
                    activeIndex === index ? "is-active" : ""
                  }`}
                  style={{
                    left: `${(point.x / chart.width) * 100}%`,
                    top: `${(point.y / chart.height) * 100}%`,
                  }}
                  aria-label={`${point.label}, ${formatDate(point.date)}, ${formatScore(point.score10)}`}
                  onMouseEnter={() => setHoverIndex(index)}
                  onMouseLeave={() => setHoverIndex(null)}
                  onFocus={() => setHoverIndex(index)}
                  onBlur={() => setHoverIndex(null)}
                  onClick={() =>
                    setPinnedIndex((previous) =>
                      previous === index ? null : index,
                    )
                  }
                ></button>
              ))}
            </div>

            {activePoint ? (
              <div
                className={`performance-chart-tooltip ${activeTooltipPlacement}`}
                style={{
                  left: `${activeTooltipLeftPct}%`,
                  top: `${activeTooltipTopPct}%`,
                }}
              >
                <strong>{activePoint.label}</strong>
                <span>{formatDate(activePoint.date)}</span>
                <span>{formatScore(activePoint.score10)}</span>
                {activePoint.sampleHands || activePoint.totalHands ? (
                  <span>
                    Hands: {activePoint.sampleHands ?? "n/a"}
                    {activePoint.totalHands ? ` / ${activePoint.totalHands}` : ""}
                  </span>
                ) : null}
                {activePointIsPinned ? (
                  <div className="performance-chart-actions">
                    <button type="button" disabled>
                      Go to tournament (TBC)
                    </button>
                    <button
                      type="button"
                      className="performance-chart-remove"
                      disabled={
                        removingActivePoint || typeof onRemoveSnapshot !== "function"
                      }
                      onClick={async (event) => {
                        event.stopPropagation();
                        if (typeof onRemoveSnapshot !== "function") return;
                        await onRemoveSnapshot(activePoint.tournamentId);
                        setPinnedIndex(null);
                      }}
                    >
                      {removingActivePoint ? "Removing..." : "Remove session"}
                    </button>
                  </div>
                ) : (
                  <span className="performance-chart-click-hint">
                    Click the dot for actions
                  </span>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
