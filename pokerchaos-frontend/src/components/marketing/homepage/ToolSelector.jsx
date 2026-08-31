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
            <span>Advanced / Tier 1</span>
            <strong>02</strong>
          </div>
          <h3>Tournament Review</h3>
          <p>Review decisions, mistakes, missed opportunities, and recurring tournament-wide patterns in greater detail.</p>
          {reviewAction}
          <small>Free trial access may be available.</small>
        </article>
        <article className="home-v2-tool home-v2-tool-disabled" aria-disabled="true">
          <div className="home-v2-tool-heading">
            <span>Coming later</span>
            <strong>03</strong>
          </div>
          <h3>Poker Coach</h3>
          <p>Personalised ongoing study and coaching shaped around your game.</p>
          <span className="home-v2-disabled-action">Not currently available</span>
        </article>
      </div>
    </section>
  );
}
