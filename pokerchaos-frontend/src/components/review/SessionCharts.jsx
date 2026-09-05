import { useId, useMemo, useState } from "react";
import { buildPositionFrequencies, buildStackSeries } from "../../lib/reviewChartData.js";
import "./session-charts.css";

const PLOT = { width: 620, height: 218, left: 42, right: 16, top: 15, bottom: 29 };
const numberLabel = (value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 });

function StackChart({ hands }) {
  const chartId = useId().replaceAll(":", "");
  const [activeIndex, setActiveIndex] = useState(null);
  const series = useMemo(() => buildStackSeries(hands), [hands]);
  const chart = useMemo(() => {
    const maximum = Math.max(10, series.maxStackBb);
    const step = maximum <= 40 ? 10 : maximum <= 100 ? 25 : maximum <= 200 ? 50 : Math.ceil(maximum / 400) * 100;
    const ceiling = Math.ceil(maximum / step) * step;
    const plotWidth = PLOT.width - PLOT.left - PLOT.right;
    const plotHeight = PLOT.height - PLOT.top - PLOT.bottom;
    const x = (point) => PLOT.left + plotWidth * (series.points.length <= 1 ? 0.5 : point.index / (series.points.length - 1));
    const y = (point) => PLOT.top + plotHeight * (1 - point.stackBb / ceiling);
    const ticks = Array.from({ length: Math.round(ceiling / step) + 1 }, (_, index) => index * step);
    return { x, y, ticks, ceiling, plotHeight, plotWidth };
  }, [series]);
  const inspectionIndex = Math.min(Math.max(0, activeIndex ?? series.validPoints.length - 1), series.validPoints.length - 1);
  const activePoint = series.validPoints[inspectionIndex];
  const label = activePoint
    ? `${activePoint.handId}: ${numberLabel(activePoint.stackBb)} big blinds at the start of hand ${activePoint.index + 1}`
    : "No stack data available";
  const inspectPointer = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * PLOT.width;
    let closest = 0;
    series.validPoints.forEach((point, index) => {
      if (Math.abs(chart.x(point) - x) < Math.abs(chart.x(series.validPoints[closest]) - x)) closest = index;
    });
    setActiveIndex(closest);
  };
  const inspectKey = (event) => {
    let next = inspectionIndex;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") next -= 1;
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") next += 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = series.validPoints.length - 1;
    else return;
    event.preventDefault();
    setActiveIndex(Math.max(0, Math.min(series.validPoints.length - 1, next)));
  };

  return (
    <section className="review-chart-panel review-stack-panel" aria-labelledby={`${chartId}-heading`}>
      <div className="review-chart-heading">
        <div>
          <span className="review-chart-eyebrow">TOURNAMENT PULSE</span>
          <h4 id={`${chartId}-heading`}>Stack progression</h4>
        </div>
        <span className="review-chart-key"><i aria-hidden="true" /> Stack in BB</span>
      </div>
      {activePoint ? (
        <>
          <div className="review-stack-readout" aria-live="polite" aria-atomic="true">
            <strong>{numberLabel(activePoint.stackBb)}<span> BB</span></strong>
            <span>Hand {activePoint.index + 1} <b aria-hidden="true">/</b> {series.points.length}<small>{activePoint.handId}</small></span>
          </div>
          <div
            className="review-stack-interactive"
            tabIndex={0}
            role="slider"
            aria-label="Inspect stack progression"
            aria-valuemin={1}
            aria-valuemax={series.validPoints.length}
            aria-valuenow={inspectionIndex + 1}
            aria-valuetext={label}
            aria-describedby={`${chartId}-help`}
            onKeyDown={inspectKey}
          >
            <svg viewBox={`0 0 ${PLOT.width} ${PLOT.height}`} onPointerMove={inspectPointer} onPointerDown={inspectPointer} aria-hidden="true">
              <defs>
                <linearGradient id={`${chartId}-fill`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand-accent-green, #00e39a)" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="var(--brand-accent-green, #00e39a)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {chart.ticks.map((tick) => {
                const y = PLOT.top + chart.plotHeight * (1 - tick / chart.ceiling);
                return <g key={tick}><line className="review-chart-gridline" x1={PLOT.left} x2={PLOT.width - PLOT.right} y1={y} y2={y} /><text className="review-chart-axis" x={PLOT.left - 12} y={y + 4} textAnchor="end">{numberLabel(tick)}</text></g>;
              })}
              {series.segments.map((segment, index) => {
                const path = segment.map((point, pointIndex) => `${pointIndex ? "L" : "M"} ${chart.x(point)} ${chart.y(point)}`).join(" ");
                const baseline = PLOT.height - PLOT.bottom;
                const area = `${path} L ${chart.x(segment[segment.length - 1])} ${baseline} L ${chart.x(segment[0])} ${baseline} Z`;
                return <g key={index}>
                  {segment.length > 1 ? <><path d={area} fill={`url(#${chartId}-fill)`} /><path className="review-stack-line" d={path} /></> : <circle className="review-stack-dot" cx={chart.x(segment[0])} cy={chart.y(segment[0])} r="3" />}
                </g>;
              })}
              <line className="review-stack-crosshair" x1={chart.x(activePoint)} x2={chart.x(activePoint)} y1={PLOT.top} y2={PLOT.height - PLOT.bottom} />
              <circle className="review-stack-halo" cx={chart.x(activePoint)} cy={chart.y(activePoint)} r="8" />
              <circle className="review-stack-dot" cx={chart.x(activePoint)} cy={chart.y(activePoint)} r="3.5" />
              <text className="review-chart-axis" x={PLOT.left} y={PLOT.height - 4}>{series.points.length === 1 ? "1 hand" : "Hand 1"}</text>
              {series.points.length > 1 ? <text className="review-chart-axis" x={PLOT.width - PLOT.right} y={PLOT.height - 4} textAnchor="end">Hand {series.points.length}</text> : null}
            </svg>
          </div>
          <p className="review-chart-note" id={`${chartId}-help`}>Start-of-hand stack · {series.ordering === "chronological" ? "oldest to newest" : "import order; dates unavailable"}. Hover, touch or use arrow keys.</p>
          {series.omittedUndatedCount || series.missingStackCount || series.tournamentCount > 1 ? <p className="review-chart-data-note">
            {series.omittedUndatedCount ? `${series.omittedUndatedCount} undated hands omitted. ` : ""}
            {series.missingStackCount ? `${series.missingStackCount} unavailable stacks shown as gaps. ` : ""}
            {series.tournamentCount > 1 ? "Lines break between tournaments." : ""}
          </p> : null}
        </>
      ) : <div className="review-chart-empty"><span aria-hidden="true">↗</span><strong>Stack history unavailable</strong><p>Hands with a starting stack and big blind will appear here.</p></div>}
    </section>
  );
}

function PositionChart({ summary, onOpenAudit }) {
  const [mode, setMode] = useState("open");
  const rows = useMemo(() => buildPositionFrequencies(summary, mode), [summary, mode]);
  const sampleCount = rows.reduce((total, row) => total + row.spots, 0);
  return (
    <section className="review-chart-panel review-position-panel" aria-label="Preflop activity by position">
      <div className="review-chart-heading">
        <div><span className="review-chart-eyebrow">PREFLOP PROFILE</span><h4>Activity by position</h4></div>
        <div className="review-chart-toggle" role="group" aria-label="Position frequency">
          <button type="button" aria-pressed={mode === "open"} onClick={() => setMode("open")}>Open</button>
          <button type="button" aria-pressed={mode === "defend"} onClick={() => setMode("defend")}>Defend</button>
        </div>
      </div>
      <p className="review-position-description">{mode === "open" ? "Raised with no prior raise" : "Continued when facing a raise"}<span>{sampleCount} spots</span></p>
      {rows.length ? <>
        <div className="review-position-bars" role="list" aria-label={`${mode === "open" ? "Open" : "Defend"} frequencies`}>
          {rows.map((row) => <div className={`review-position-row${row.smallSample ? " is-small-sample" : ""}`} role="listitem" key={row.position}>
            <span className="review-position-label">{row.position}</span>
            <div className="review-position-track" aria-hidden="true"><span style={{ width: `${row.percent}%` }} /></div>
            <strong>{Math.round(row.percent)}%</strong>
            <span className="review-position-sample" title={row.smallSample ? "Small sample: fewer than 8 opportunities" : "Actions / opportunities"}>{row.count}/{row.spots}{row.smallSample ? <span aria-label="small sample">*</span> : null}</span>
          </div>)}
        </div>
        <div className="review-position-footer"><span>* Small sample · actions / opportunities</span>{onOpenAudit ? <button type="button" onClick={() => onOpenAudit(mode === "open" ? "preflop_opportunity" : "blind_defense")}>Explore spots <span aria-hidden="true">↗</span></button> : null}</div>
      </> : <div className="review-chart-empty"><span aria-hidden="true">▥</span><strong>No {mode === "open" ? "opening" : "defending"} opportunities yet</strong><p>Position frequencies appear when relevant hands are available.</p></div>}
    </section>
  );
}

export default function SessionCharts({ hands = [], summary = null, onOpenAudit = null }) {
  return <div className="review-session-charts"><StackChart hands={hands} /><PositionChart summary={summary} onOpenAudit={onOpenAudit} /></div>;
}
