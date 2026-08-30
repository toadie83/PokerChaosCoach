import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  requestRetryStudyReport,
  requestSaveStudySpot,
  requestStudyQueue,
  requestStudyReport,
} from "../api/aiService.js";
import { getStudyPriorities } from "../lib/studySpotPresentation.js";
import { trackProductEvent } from "../lib/analytics.js";
import StudySpotCard from "./StudySpotCard.jsx";

function reportIdFromPath(routePath) {
  return String(routePath || "").split("/").filter(Boolean).at(-1) || "";
}

export default function StudyReportPage({ routePath, navigate }) {
  const reportId = reportIdFromPath(routePath);
  const [report, setReport] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [savedIds, setSavedIds] = useState(new Set());
  const [savingId, setSavingId] = useState("");
  const trackedUpsellReportId = useRef("");

  const load = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const reportResponse = await requestStudyReport(reportId);
      setReport(reportResponse?.report || null);
      try {
        const queueResponse = await requestStudyQueue();
        setSavedIds(new Set((queueResponse?.items || []).map((item) => item.id)));
      } catch {
        setSavedIds(new Set());
      }
      setStatus("ready");
    } catch (loadError) {
      setError(loadError?.message || "Study Report could not be loaded.");
      setStatus("error");
    }
  }, [reportId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (status !== "ready" || !report?.id || report.spotCount < 1) return;
    if (trackedUpsellReportId.current === report.id) return;
    trackedUpsellReportId.current = report.id;
    trackProductEvent("tournament_review_upsell_viewed", {
      spot_count: report.spotCount,
    });
  }, [report, status]);

  const priorities = useMemo(() => getStudyPriorities(report?.spots || []), [report?.spots]);

  const saveSpot = async (spotId) => {
    if (savingId || savedIds.has(spotId)) return;
    setSavingId(spotId);
    try {
      await requestSaveStudySpot(spotId);
      setSavedIds((current) => new Set([...current, spotId]));
    } catch (saveError) {
      setError(saveError?.message || "Study Spot could not be saved.");
    } finally {
      setSavingId("");
    }
  };

  const retry = async () => {
    setStatus("loading");
    setError("");
    try {
      const result = await requestRetryStudyReport(reportId);
      const nextId = result?.report?.id;
      if (!nextId) throw new Error("Retry did not return a Study Report.");
      navigate(`/tools/study-spots/reports/${nextId}`);
    } catch (retryError) {
      setError(retryError?.message || "Study Report retry failed.");
      setStatus("error");
    }
  };

  if (status === "loading") {
    return <main className="tools-page"><p className="study-loading">Loading Study Report...</p></main>;
  }
  if (status === "error" || !report) {
    return (
      <main className="tools-page tools-page--focused">
        <div className="study-state-message">
          <h1>Study Report unavailable</h1>
          <p>{error}</p>
          <button type="button" onClick={load}>Try again</button>
        </div>
      </main>
    );
  }
  if (report.status === "failed") {
    return (
      <main className="tools-page tools-page--focused">
        <div className="study-state-message">
          <p className="tools-page-kicker">Tournament saved</p>
          <h1>Analysis did not finish</h1>
          <p>Your upload is safe. Retry the analysis without uploading it again.</p>
          <button type="button" onClick={retry}>Retry analysis</button>
        </div>
      </main>
    );
  }

  const spots = Array.isArray(report.spots) ? report.spots : [];
  return (
    <main className="study-report-page">
      <header className="study-report-header">
        <p className="tools-page-kicker">Tournament Study Report</p>
        <h1>{report.tournamentName || `Tournament ${report.tournamentId}`}</h1>
        <div className="study-report-stats">
          <span><strong>{report.handsAnalysed}</strong> hands analysed</span>
          <span><strong>{report.spotCount}</strong> study {report.spotCount === 1 ? "opportunity" : "opportunities"}</span>
        </div>
        {report.handsAnalysed < 20 ? (
          <p className="study-sample-note">
            Small sample: useful decisions are shown, but repeated patterns may not be visible yet.
          </p>
        ) : null}
      </header>

      {spots.length > 0 ? (
        <>
          <section className="study-priorities" aria-labelledby="study-priorities-title">
            <h2 id="study-priorities-title">Your Study Priorities</h2>
            <ol>{priorities.map((priority) => <li key={priority}>{priority}</li>)}</ol>
          </section>
          <section className="study-queue-section" aria-labelledby="study-queue-title">
            <div className="study-section-heading">
              <h2 id="study-queue-title">Study Queue</h2>
              <button type="button" onClick={() => navigate("/study")}>Open My Study</button>
            </div>
            <div className="study-spot-list">
              {spots.map((spot) => (
                <StudySpotCard
                  key={spot.id}
                  spot={spot}
                  saved={savedIds.has(spot.id)}
                  saving={savingId === spot.id}
                  onSave={saveSpot}
                />
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="study-state-message">
          <h2>No high-confidence study spots found</h2>
          <p>We analysed {report.handsAnalysed} hands, but no opportunities cleared the study-value threshold. Nothing was added just to fill the report.</p>
          <button type="button" onClick={() => navigate("/tools/study-spots")}>Analyse another tournament</button>
        </section>
      )}

      {spots.length > 0 ? <section className="study-review-upsell">
        <div>
          <p className="tools-page-kicker">Tournament Review</p>
          <h2>Want the complete tournament analysis?</h2>
          <p>Study Spots finds the decisions worth learning from. Tournament Review explains what happened across your tournament in detail.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            trackProductEvent("tournament_review_upsell_clicked", {
              spot_count: report.spotCount,
            });
            navigate("/tools/tournament-review");
          }}
        >
          Try Tournament Review
        </button>
      </section> : null}
    </main>
  );
}
