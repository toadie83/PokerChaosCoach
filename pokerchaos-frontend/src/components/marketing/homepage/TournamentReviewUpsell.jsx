const BENEFITS = [
  "Every hand analysed",
  "Recurring leak detection",
  "Deeper decision review",
  "Tournament-wide patterns",
];

export default function TournamentReviewUpsell({ action }) {
  return (
    <aside className="home-v2-review-upsell">
      <span className="home-v2-upsell-label">Go deeper when you are ready</span>
      <div className="home-v2-upsell-mark" aria-hidden="true">♛</div>
      <h3>Want the full tournament review?</h3>
      <p>Turn the free preview into a complete decision trail for the whole tournament.</p>
      <ul>
        {BENEFITS.map((benefit) => <li key={benefit}><span>✓</span>{benefit}</li>)}
      </ul>
      {action}
      <small>Poker Coach is coming later. Tournament Review is available now.</small>
    </aside>
  );
}
