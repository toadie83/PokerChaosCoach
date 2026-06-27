export default function HowItWorks({ steps, primaryAction }) {
  return (
    <section className="home-section" id="how-it-works">
      <div className="home-section-heading">
        <p className="home-eyebrow">How it works</p>
        <h2>Playback Poker turns hand histories into useful feedback.</h2>
      </div>
      <div className="home-steps-grid">
        {steps.map((step) => (
          <article className="home-step-card" key={step.number}>
            <span className="home-step-number">{step.number}</span>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
          </article>
        ))}
      </div>
      <div className="home-inline-cta">
        {primaryAction}
      </div>
    </section>
  );
}
