import { SignUpButton, useAuth } from "@clerk/react";
import { useEffect, useMemo } from "react";

import { loadFreeStudyPlanResult } from "../../lib/freeStudyPlanSession.js";
import { trackProductEvent } from "../../lib/analytics.js";
import MarketingSiteShell from "./MarketingSiteShell.jsx";
import MatchedLesson from "./homepage/MatchedLesson.jsx";
import "./homepage/homepage-v2.css";

function readable(value, fallback = "Tournament study") {
  const text = String(value || "").replaceAll("-", " ").replaceAll("_", " ").trim();
  if (!text) return fallback;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function spotContext(spot) {
  const values = [];
  if (spot?.stackDepthBb) values.push(`${Math.round(Number(spot.stackDepthBb))} BB`);
  else if (spot?.stackDepthTag) values.push(readable(spot.stackDepthTag));
  if (spot?.heroPosition && spot.heroPosition !== "unknown") values.push(`Hero ${spot.heroPosition}`);
  if (spot?.villainPosition && spot.villainPosition !== "unknown") values.push(`vs ${spot.villainPosition}`);
  if (Number(spot?.occurrenceCount) > 1) values.push(`${spot.occurrenceCount} similar decisions`);
  return values.join(" · ");
}

function FreeSuggestionCard({ spot, rank }) {
  const matches = Array.isArray(spot?.resourceMatches)
    ? spot.resourceMatches.filter((match) => match?.resource).slice(0, 2)
    : [];
  return (
    <article className="free-plan-suggestion">
      <div className="free-plan-suggestion-rank">{String(rank).padStart(2, "0")}</div>
      <div className="free-plan-suggestion-main">
        <div className="free-plan-suggestion-meta">
          <span>{readable(spot?.category)}</span>
          {spotContext(spot) ? <small>{spotContext(spot)}</small> : null}
        </div>
        <h2>{spot?.title || "Tournament decision worth revisiting"}</h2>
        <p>{spot?.whyStudyThis || spot?.summary}</p>
        {spot?.summary && spot?.whyStudyThis ? <blockquote>{spot.summary}</blockquote> : null}
      </div>
      <div className="free-plan-lessons">
        {matches.length > 0 ? matches.map((match) => (
          <MatchedLesson
            key={match.resource.id || match.resource.canonicalPath}
            lesson={match.resource.title}
            lessonType={`${readable(match.resource.resourceType, "Lesson")} · ${readable(match.quality, "Matched")}`}
            href={match.resource.canonicalPath || "/learn"}
          />
        )) : (
          <MatchedLesson
            lesson={`Explore ${readable(spot?.category)} lessons`}
            lessonType="Learning Library"
            href="/learn"
          />
        )}
      </div>
    </article>
  );
}

export default function FreeStudyPlanPage() {
  const { isSignedIn } = useAuth();
  const result = useMemo(() => loadFreeStudyPlanResult(), []);
  const spots = result?.report?.spots || [];
  const tournament = result?.tournament || {};

  useEffect(() => {
    document.title = "Your Free Tournament Study Plan | Playback Poker";
    let robots = document.head.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement("meta");
      robots.setAttribute("name", "robots");
      document.head.appendChild(robots);
    }
    robots.setAttribute("content", "noindex,follow");
  }, []);

  const accountAction = isSignedIn ? (
    <a className="home-v2-button home-v2-button-primary" href="/tools/study-spots">
      Open registered Study Spots
    </a>
  ) : (
    <SignUpButton mode="modal">
      <button className="home-v2-button home-v2-button-primary" type="button">
        Sign up to analyse more
      </button>
    </SignUpButton>
  );

  if (!result) {
    return (
      <MarketingSiteShell currentPath="/free-study-plan" pageClassName="home-v2 home-v2-free-result-page" headerCtaLabel="Upload Tournament Free" headerCtaHref="/#upload">
        <section className="free-plan-expired">
          <p className="home-v2-kicker">Free Study Plan</p>
          <h1>Your result is no longer in this tab.</h1>
          <p>Run another free tournament check to build a fresh personalised plan.</p>
          <a className="home-v2-button home-v2-button-primary" href="/#upload">Upload a tournament free</a>
        </section>
      </MarketingSiteShell>
    );
  }

  return (
    <MarketingSiteShell currentPath="/free-study-plan" pageClassName="home-v2 home-v2-free-result-page" headerCtaLabel="Check Another Tournament" headerCtaHref="/#upload">
      <section className="free-plan-hero">
        <div>
          <p className="home-v2-kicker">Analysis complete</p>
          <h1>Your tournament has a study plan.</h1>
          <p>These are the decisions with the strongest learning value—and the Playback Poker lessons that can help you improve them.</p>
        </div>
        <div className="free-plan-summary">
          <span>Free tournament check</span>
          <h2>{tournament.name || "Uploaded tournament"}</h2>
          <div>
            <p><strong>{result.report.handsAnalysed || 0}</strong> hands read</p>
            <p><strong>{spots.length}</strong> Study Spots</p>
            <p><strong>{readable(result.report.priorityTheme, "Mixed")}</strong> priority</p>
          </div>
        </div>
      </section>

      <section className="free-plan-results">
        <header>
          <div>
            <p className="home-v2-kicker">Your learning suggestions</p>
            <h2>Start with these decisions.</h2>
          </div>
          <a href="/#upload">Analyse another tournament</a>
        </header>
        {spots.length > 0 ? (
          <div className="free-plan-suggestion-list">
            {spots.map((spot, index) => <FreeSuggestionCard key={spot.id || spot.title} spot={spot} rank={index + 1} />)}
          </div>
        ) : (
          <div className="free-plan-zero">
            <h2>No high-confidence Study Spots were found.</h2>
            <p>This result is honest: the uploaded hands did not produce a useful match. Try a tournament with more hands or browse the Learning Library.</p>
            <a href="/learn">Explore the Learning Library</a>
          </div>
        )}
      </section>

      <section className="free-plan-signup">
        <div>
          <p className="home-v2-kicker">Keep building your game</p>
          <h2>Want more than the free preview?</h2>
          <p>Create an account to analyse more tournaments, save Study Spots, and build a learning queue that grows with your game.</p>
        </div>
        <ul>
          <li><span>✓</span> Save tournaments and Study Spots</li>
          <li><span>✓</span> Revisit your learning queue</li>
          <li><span>✓</span> Unlock deeper Tournament Review</li>
        </ul>
        <div onClick={() => trackProductEvent("tournament_review_upsell_clicked", { spot_count: spots.length })}>
          {accountAction}
        </div>
      </section>
    </MarketingSiteShell>
  );
}
