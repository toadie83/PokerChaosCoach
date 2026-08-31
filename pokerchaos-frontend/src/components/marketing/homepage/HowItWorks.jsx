export default function HowItWorks({ steps }) {
  return (
    <section className="home-v2-section home-v2-loop" id="how-it-works">
      <div className="home-v2-section-heading">
        <p className="home-v2-kicker">How it works</p>
        <h2>Your tournament becomes your curriculum.</h2>
      </div>
      <ol className="home-v2-loop-track">
        {steps.map((step) => (
          <li key={step.title}>
            <span>{step.number}</span>
            <div><h3>{step.title}</h3><p>{step.description}</p></div>
          </li>
        ))}
      </ol>
    </section>
  );
}
