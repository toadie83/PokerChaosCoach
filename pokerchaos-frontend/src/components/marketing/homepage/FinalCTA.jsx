export default function FinalCTA({ primaryAction, secondaryAction }) {
  return (
    <section className="home-section">
      <div className="home-final-cta">
        <div>
          <p className="home-eyebrow">Ready to review</p>
          <h2>Got a hand you&apos;re still thinking about?</h2>
          <p>
            Paste it into Playback Poker and get a clear review in minutes.
          </p>
        </div>
        <div className="home-final-actions">
          {primaryAction}
          {secondaryAction}
        </div>
      </div>
    </section>
  );
}
