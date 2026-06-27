export default function SeoLinkGrid({ links }) {
  return (
    <section className="home-section" id="seo-links">
      <div className="home-section-heading">
        <p className="home-eyebrow">Explore poker review tools</p>
        <h2>Go deeper by workflow, site, or study goal.</h2>
      </div>
      <div className="home-card-grid">
        {links.map((link) => (
          <a className="home-seo-card" href={link.href} key={link.href}>
            <h3>{link.title}</h3>
            <p>{link.description}</p>
          </a>
        ))}
      </div>
    </section>
  );
}
