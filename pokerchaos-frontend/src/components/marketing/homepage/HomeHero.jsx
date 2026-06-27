export default function HomeHero({
  imageSrc,
  trustMarkers,
  primaryAction,
  secondaryAction,
}) {
  return (
    <section className="home-hero" id="top">
      <div className="home-hero-copy">
        <p className="home-eyebrow">Smarter review for practical poker study</p>
        <h1>Review poker hands in minutes, not hours.</h1>
        <p className="home-hero-summary">
          Upload a GGPoker or PokerStars hand history and get clear,
          street-by-street feedback on your decisions, leaks, sizing, and missed
          opportunities.
        </p>
        <div className="home-hero-actions">
          {primaryAction}
          {secondaryAction}
        </div>
        <div className="home-trust-row" aria-label="Trust markers">
          {trustMarkers.map((item) => (
            <span className="home-trust-pill" key={item}>
              {item}
            </span>
          ))}
        </div>
      </div>
      <div className="home-hero-visual">
        <div className="home-hero-visual-card">
          <div className="home-hero-visual-meta">
            <span className="home-visual-badge">Hero Spot Review</span>
            <span className="home-visual-badge home-visual-badge-soft">
              GGPoker + PokerStars
            </span>
          </div>
          <img
            src={imageSrc}
            alt="Playback Poker placeholder poker chip hero visual"
            className="home-hero-chip-image"
          />
          <div className="home-hero-floating home-hero-floating-top">
            <span className="home-floating-label">Street review</span>
            <strong>Clear feedback, not solver noise</strong>
          </div>
          <div className="home-hero-floating home-hero-floating-bottom">
            <span className="home-floating-label">Takeaway</span>
            <strong>Spot the leak before the next session</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
