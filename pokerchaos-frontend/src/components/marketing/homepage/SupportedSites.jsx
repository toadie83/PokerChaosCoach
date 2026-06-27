export default function SupportedSites({ sites, formats }) {
  return (
    <section className="home-section" id="supported-sites">
      <div className="home-section-heading">
        <p className="home-eyebrow">Supported sites</p>
        <h2>Works with the sites you already play.</h2>
      </div>
      <div className="home-supported-layout">
        <div className="home-card-grid is-compact">
          {sites.map((site) => (
            <article className="home-feature-card" key={site.label}>
              <h3>{site.label}</h3>
              <p>{site.description}</p>
            </article>
          ))}
        </div>
        <aside className="home-supported-list-card">
          <p className="home-preview-label">Currently supported</p>
          <ul className="home-supported-list">
            {formats.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="home-supported-note">
            Additional sites and formats are coming soon. If you have a specific
            request, please reach out to us via the contact form.
          </p>
        </aside>
      </div>
    </section>
  );
}
