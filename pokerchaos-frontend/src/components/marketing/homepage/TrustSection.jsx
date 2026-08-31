export default function TrustSection({ links }) {
  return (
    <section className="home-v2-section home-v2-methodology" id="methodology">
      <div>
        <p className="home-v2-kicker">Constructive by design</p>
        <h2>Not every Study Spot is a mistake.</h2>
        <p>
          Playback Poker looks for decisions with learning value, including
          close spots, missed opportunities, and recurring patterns grounded in
          the actual hand-history context.
        </p>
      </div>
      <nav aria-label="Playback Poker methodology">
          {links.map((link) => (
            <a href={link.href} key={link.href}>
              {link.label}
            </a>
          ))}
      </nav>
    </section>
  );
}
