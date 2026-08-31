export default function HomeHero({
  spots,
  primaryAction,
  secondaryAction,
}) {
  return (
    <section className="home-v2-hero" id="top">
      <div className="home-v2-hero-copy">
        <p className="home-v2-kicker">Playback Poker for MTT players</p>
        <h1>Turn your tournaments into better decisions.</h1>
        <p>
          Upload your hand history. Playback Poker finds the decisions worth
          studying and connects them to practical MTT lessons.
        </p>
        <div className="home-v2-actions">
          {primaryAction}
          {secondaryAction}
        </div>
        <div className="home-v2-hero-proof" aria-label="Product access">
          <span>Free for registered users</span>
          <span>GGPoker and PokerStars MTT histories</span>
        </div>
      </div>
      <div className="home-v2-study-preview" aria-label="Example Playback Poker Study Spots report">
        <header className="home-v2-preview-header">
          <div>
            <span className="home-v2-preview-status">Tournament uploaded</span>
            <strong>Sunday Main Event</strong>
          </div>
          <div className="home-v2-preview-count">
            <strong>6</strong>
            <span>Study Spots found</span>
          </div>
        </header>
        <div className="home-v2-preview-list">
          {spots.map((spot, index) => (
            <article className="home-v2-preview-row" key={spot.title}>
              <span className="home-v2-preview-rank">{index + 1}</span>
              <div>
                <p>{spot.category}</p>
                <h2>{spot.title}</h2>
                <span>{spot.context}</span>
              </div>
              <div className="home-v2-preview-lesson">
                <span>Recommended lesson</span>
                <strong>{spot.lesson}</strong>
              </div>
            </article>
          ))}
        </div>
        <footer className="home-v2-preview-footer">
          <span>Ranked by learning value</span>
          <span>Matched to your game</span>
        </footer>
      </div>
    </section>
  );
}
