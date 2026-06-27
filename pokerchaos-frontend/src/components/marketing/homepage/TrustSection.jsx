export default function TrustSection({ links }) {
  return (
    <section className="home-section" id="trust">
      <div className="home-trust-card">
        <div className="home-trust-copy">
          <p className="home-eyebrow">Trust and limitations</p>
          <h2>Clear feedback, not fake certainty.</h2>
          <p>
            Playback Poker uses AI to interpret hand histories and explain
            decision points clearly. It is designed to support your review
            process, not replace your judgement or guarantee perfect GTO output.
          </p>
        </div>
        <div className="home-trust-links">
          {links.map((link) => (
            <a className="home-trust-link" href={link.href} key={link.href}>
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
