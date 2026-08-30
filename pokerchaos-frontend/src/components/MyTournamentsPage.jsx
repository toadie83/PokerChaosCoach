import { useCallback, useEffect, useState } from "react";

import { requestStudyReports } from "../api/aiService.js";

export default function MyTournamentsPage({ navigate }) {
  const [reports, setReports] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

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

  return (
    <main className="tools-page">
      <header className="tools-page-header">
        <p className="tools-page-kicker">My Tournaments</p>
        <h1>Study Report history</h1>
      </header>
      {error ? <p className="study-form-error">{error}</p> : null}
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
            <div>
              <p>{report.status === "complete" ? `${report.spotCount} study opportunities` : "Analysis needs attention"}</p>
              <h2>{report.tournamentName || `Tournament ${report.tournamentId}`}</h2>
              <span>{report.handsAnalysed} hands</span>
            </div>
            <button type="button" onClick={() => navigate(`/tools/study-spots/reports/${report.id}`)}>
              {report.status === "failed" ? "Open retry" : "Open report"}
            </button>
          </article>
        ))}
      </div>
    </main>
  );
}
