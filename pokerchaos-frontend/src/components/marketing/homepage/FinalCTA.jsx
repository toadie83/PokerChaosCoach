export default function FinalCTA({ primaryAction, secondaryAction }) {
  return (
    <section className="home-v2-final">
      <div>
        <p className="home-v2-kicker">Your game. Your next lesson.</p>
        <h2>Your next win starts with better study.</h2>
        <p>Upload a completed tournament and get a free personalised lesson plan.</p>
      </div>
      <div className="home-v2-actions">
          {primaryAction}
          {secondaryAction}
      </div>
    </section>
  );
}
