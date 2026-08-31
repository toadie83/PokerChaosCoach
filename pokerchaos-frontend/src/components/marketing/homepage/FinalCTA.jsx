export default function FinalCTA({ primaryAction, secondaryAction }) {
  return (
    <section className="home-v2-final">
      <div>
        <p className="home-v2-kicker">Your game. Your study plan.</p>
        <h2>Your next study session is already in your hand history.</h2>
        <p>Upload a tournament and let Playback Poker find the spots worth revisiting.</p>
      </div>
      <div className="home-v2-actions">
          {primaryAction}
          {secondaryAction}
      </div>
    </section>
  );
}
