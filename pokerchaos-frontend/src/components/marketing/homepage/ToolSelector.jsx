import { COACH_ACCESS_DESCRIPTION, COACH_EARLY_ACCESS_URL } from "../../../lib/coachAccess.js";
import { REVIEW_MONTHLY_CREDITS, REVIEW_PLAN_PRICE, REVIEW_TRIAL_CREDITS } from "../../../lib/reviewPricing.js";

export default function ToolSelector({ studyAction, reviewAction }) {
  return (
    <section className="home-v2-section home-v2-tools" id="tools">
      <div className="home-v2-section-heading">
        <p className="home-v2-kicker">Playback Poker tools</p>
        <h2>One place to improve your tournament game.</h2>
        <p>Start with what to study, then go deeper when you need the full decision trail.</p>
      </div>
      <div className="home-v2-tool-grid">
        <article className="home-v2-tool home-v2-tool-primary">
          <div className="home-v2-tool-heading">
            <span>Free</span>
            <strong>01</strong>
          </div>
          <h3>Find My Study Spots</h3>
          <p>Upload a tournament, find the decisions most worth studying, and get matched with relevant lessons.</p>
          {studyAction}
        </article>
        <article className="home-v2-tool">
          <div className="home-v2-tool-heading">
            <span>{REVIEW_PLAN_PRICE} · {REVIEW_MONTHLY_CREDITS} credits</span>
            <strong>02</strong>
          </div>
          <h3>Tournament Review</h3>
          <p>Review decisions, mistakes, missed opportunities, and recurring tournament-wide patterns in greater detail.</p>
          {reviewAction}
          <small>Start with {REVIEW_TRIAL_CREDITS} free review credits. Credits are applied automatically when you use AI Review. Coach is separate.</small>
        </article>
        <article className="home-v2-tool">
          <div className="home-v2-tool-heading">
            <span>Paid early access</span>
            <strong>03</strong>
          </div>
          <h3>Poker Coach</h3>
          <p>{COACH_ACCESS_DESCRIPTION}</p>
          <a className="tool-card-action" href={COACH_EARLY_ACCESS_URL}>Contact me — request early access</a>
          <small>Opens your email app to request pricing and an agreed usage allowance.</small>
        </article>
      </div>
    </section>
  );
}
