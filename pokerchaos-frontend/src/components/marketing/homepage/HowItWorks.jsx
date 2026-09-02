function StepIcon({ name }) {
  if (name === "upload") {
    return (
      <path d="M 14.5 18.5h-7A4.5 4.5 0 0 1 7 9.6 6.5 6.5 0 0 1 19.6 7a5.5 5.5 0 0 1 .9 11.4H18M14 16V7m0 0-3 3m3-3 3 3" />
    );
  }
  if (name === "search") {
    return (
      <>
        <circle cx="11" cy="11" r="6" />
        <path d="m16 16 5 5M11 8v6M8 11h6" />
      </>
    );
  }
  if (name === "match") {
    return (
      <>
        <path d="M9.5 14.5 8 16a4 4 0 0 1-5.7-5.7l3-3A4 4 0 0 1 11 7" />
        <path d="m14.5 9.5 1.5-1.5a4 4 0 0 1 5.7 5.7l-3 3A4 4 0 0 1 13 17M8.5 12h7" />
      </>
    );
  }
  if (name === "plan") {
    return (
      <>
        <path d="M7 4h10l3 3v13H7zM17 4v4h3" />
        <path d="m10 13 1.5 1.5L15 11M10 18h6" />
      </>
    );
  }
  return (
    <>
      <path d="M20 8a8 8 0 1 0 1.2 7.8" />
      <path d="M20 4v4h-4" />
      <path d="m11 10 6 3-6 3z" />
    </>
  );
}

export default function HowItWorks({ steps }) {
  return (
    <section className="home-v2-section home-v2-loop" id="how-it-works">
      <div className="home-v2-section-heading">
        <p className="home-v2-kicker">How it works</p>
        <h2>Upload, Study, and Improve</h2>
      </div>
      <ol className="home-v2-loop-track">
        {steps.map((step, index) => (
          <li className={index === 1 ? "is-emphasis" : ""} key={step.title}>
            <div className="home-v2-loop-card-topline">
              <span className="home-v2-loop-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="home-v2-loop-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <StepIcon name={step.icon} />
                </svg>
              </span>
            </div>
            <div className="home-v2-loop-card-copy">
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
