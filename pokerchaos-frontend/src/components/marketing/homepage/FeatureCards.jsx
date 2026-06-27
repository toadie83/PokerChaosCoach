export default function FeatureCards({ eyebrow, title, cards, id, compact }) {
  return (
    <section className="home-section" id={id}>
      <div className="home-section-heading">
        {eyebrow ? <p className="home-eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
      </div>
      <div className={`home-card-grid ${compact ? "is-compact" : ""}`}>
        {cards.map((card) => (
          <article className="home-feature-card" key={card.title}>
            <h3>{card.title}</h3>
            <p>{card.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
