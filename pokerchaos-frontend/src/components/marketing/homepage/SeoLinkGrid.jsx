export default function SeoLinkGrid({ links }) {
  return (
    <section className="home-v2-section home-v2-explore" id="explore">
      <div className="home-v2-section-heading">
        <p className="home-v2-kicker">Explore Playback Poker</p>
        <h2>Practical tournament analysis by workflow.</h2>
      </div>
      <nav className="home-v2-explore-links" aria-label="Poker study guides and tools">
        {links.map((link) => (
          <a href={link.href} key={link.href}>
            <strong>{link.title}</strong>
            <span>{link.description}</span>
          </a>
        ))}
      </nav>
    </section>
  );
}
