import { useCallback, useEffect, useState } from "react";

import {
  requestDeleteStudyReport,
  requestStudyReports,
} from "../api/aiService.js";

function reportTitle(report) {
  return report.tournamentName || `Tournament ${report.tournamentId}`;
}

function reportDate(report) {
  const value = report.completedAt || report.createdAt;
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default function MyTournamentsPage({ navigate }) {
  const [reports, setReports] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [removingId, setRemovingId] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await requestStudyReports();
      setReports(Array.isArray(response?.reports) ? response.reports : []);
      setError("");
      setStatus("ready");
    } catch (loadError) {
      setError(loadError?.message || "Tournament history could not be loaded.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const removeReport = async (report) => {
    if (removingId) return;
    const title = reportTitle(report);
    const confirmed = window.confirm(
      `Remove "${title}"? Its Study Report, Study Spots, and saved queue history will be permanently deleted.`,
    );
    if (!confirmed) return;

    setRemovingId(report.id);
    setError("");
    setNotice("");
    try {
      await requestDeleteStudyReport(report.id);
      setReports((current) => current.filter((item) => item.id !== report.id));
      setNotice(`Removed ${title} from Study Report history.`);
    } catch (removeError) {
      setError(removeError?.message || "Study Report could not be removed.");
    } finally {
      setRemovingId("");
    }
  };

  return (
    <main className="tools-page study-history-page">
      <header className="tools-page-header">
        <p className="tools-page-kicker">My Tournaments</p>
        <h1>Study Report history</h1>
      </header>
      {error ? <p className="study-form-error" role="alert">{error}</p> : null}
      {notice ? <p className="study-form-notice" role="status">{notice}</p> : null}
      {status === "loading" ? <p className="study-loading">Loading tournaments...</p> : null}
      {status === "ready" && reports.length === 0 ? (
        <div className="study-state-message">
          <h2>No tournaments analysed yet</h2>
          <button type="button" onClick={() => navigate("/tools/study-spots")}>Analyse a tournament</button>
        </div>
      ) : null}
      <div className="study-report-history">
        {reports.map((report) => (
          <article key={report.id}>
            <div className="study-report-history-copy">
              <p>{report.status === "complete" ? `${report.spotCount} study opportunities` : "Analysis needs attention"}</p>
              <h2>{reportTitle(report)}</h2>
              <div className="study-report-history-meta">
                <span>{report.handsAnalysed} hands</span>
                {reportDate(report) ? <span>{reportDate(report)}</span> : null}
              </div>
            </div>
            <div className="study-report-history-actions">
              <button type="button" onClick={() => navigate(`/tools/study-spots/reports/${report.id}`)}>
                {report.status === "failed" ? "Open retry" : "Open"}
              </button>
              <button
                type="button"
                className="study-report-remove"
                aria-label={`Remove ${reportTitle(report)}`}
                disabled={Boolean(removingId)}
                onClick={() => removeReport(report)}
              >
                {removingId === report.id ? "Removing..." : "Remove"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
