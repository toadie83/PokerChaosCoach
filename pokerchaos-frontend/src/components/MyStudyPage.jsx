import { useCallback, useEffect, useMemo, useState } from "react";

import {
  requestDeleteStudySpot,
  requestStudyQueue,
  requestUpdateStudySpotStatus,
} from "../api/aiService.js";
import StudySpotCard from "./StudySpotCard.jsx";

export default function MyStudyPage({ navigate }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("to_review");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await requestStudyQueue();
      setItems(Array.isArray(response?.items) ? response.items : []);
      setError("");
      setStatus("ready");
    } catch (loadError) {
      setError(loadError?.message || "My Study could not be loaded.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(
    () => ({
      to_review: items.filter((item) => item.queueStatus === "to_review").length,
      completed: items.filter((item) => item.queueStatus === "completed").length,
    }),
    [items],
  );
  const topicCounts = useMemo(() => {
    const countsByTopic = new Map();
    for (const item of items) {
      const topic = item.title || item.category;
      countsByTopic.set(topic, (countsByTopic.get(topic) || 0) + 1);
    }
    return Array.from(countsByTopic.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [items]);
  const visibleItems = items.filter((item) => item.queueStatus === filter);

  const changeStatus = async (spotId, nextStatus) => {
    try {
      await requestUpdateStudySpotStatus(spotId, nextStatus);
      setItems((current) => current.map((item) => item.id === spotId ? { ...item, queueStatus: nextStatus } : item));
    } catch (updateError) {
      setError(updateError?.message || "Study Spot could not be updated.");
    }
  };

  const remove = async (spotId) => {
    try {
      await requestDeleteStudySpot(spotId);
      setItems((current) => current.filter((item) => item.id !== spotId));
    } catch (removeError) {
      setError(removeError?.message || "Study Spot could not be removed.");
    }
  };

  return (
    <main className="study-report-page">
      <header className="study-report-header">
        <p className="tools-page-kicker">My Study</p>
        <h1>Your saved study queue</h1>
        <div className="study-filter-tabs" role="tablist" aria-label="Study status">
          <button type="button" role="tab" aria-selected={filter === "to_review"} className={filter === "to_review" ? "active" : ""} onClick={() => setFilter("to_review")}>To review <strong>{counts.to_review}</strong></button>
          <button type="button" role="tab" aria-selected={filter === "completed"} className={filter === "completed" ? "active" : ""} onClick={() => setFilter("completed")}>Completed <strong>{counts.completed}</strong></button>
        </div>
      </header>

      {topicCounts.length > 0 ? (
        <section className="study-topic-summary" aria-labelledby="topics-heading">
          <h2 id="topics-heading">Topics</h2>
          <div>{topicCounts.map(([topic, count]) => <span key={topic}>{topic} <strong>{count}</strong></span>)}</div>
        </section>
      ) : null}
      {error ? <p className="study-form-error" role="alert">{error}</p> : null}
      {status === "loading" ? <p className="study-loading">Loading My Study...</p> : null}
      {status !== "loading" && visibleItems.length === 0 ? (
        <section className="study-state-message">
          <h2>{filter === "completed" ? "No completed spots yet" : "Your study queue is clear"}</h2>
          <p>Save useful spots from a Tournament Study Report to see them here.</p>
          <button type="button" onClick={() => navigate("/tools/study-spots")}>Find study spots</button>
        </section>
      ) : null}
      <div className="study-spot-list">
        {visibleItems.map((item) => (
          <StudySpotCard
            key={item.id}
            spot={item}
            queueStatus={item.queueStatus}
            onStatusChange={changeStatus}
            onRemove={remove}
            onOpenReport={(reportId) => navigate(`/tools/study-spots/reports/${reportId}`)}
          />
        ))}
      </div>
    </main>
  );
}

