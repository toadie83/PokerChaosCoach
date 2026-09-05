import { SignInButton, SignUpButton } from "@clerk/react";

const BENEFITS = [
  ["Every hand analysed", "See the decisions that shaped your tournament, not just a small preview."],
  ["Recurring leak detection", "Spot patterns that repeat across positions, streets, and stack depths."],
  ["Deeper decision review", "Move from a headline result into the context behind each decision."],
  ["Tournament-wide patterns", "Understand your progression, frequencies, and next adjustments in one view."],
];

export default function TournamentReviewModal({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="home-v2-review-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="home-v2-review-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="home-v2-review-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="home-v2-review-modal-close" type="button" onClick={onClose} aria-label="Close Tournament Review introduction">
          ×
        </button>
        <div className="home-v2-review-modal-visual">
          <img src="/images/tournament-review1.png" alt="Tournament Review dashboard showing a complete tournament decision trail" />
        </div>
        <div className="home-v2-review-modal-copy">
          <p className="home-v2-kicker">Tournament intelligence</p>
          <h2 id="home-v2-review-modal-title">See the whole tournament clearly.</h2>
          <p className="home-v2-review-modal-lead">
            Turn a free Study Spots preview into a complete review of your tournament, with the evidence and patterns behind your next edge.
          </p>
          <ul>
            {BENEFITS.map(([title, detail]) => (
              <li key={title}>
                <span aria-hidden="true">✓</span>
                <div><strong>{title}</strong><p>{detail}</p></div>
              </li>
            ))}
          </ul>
          <div className="home-v2-review-modal-actions">
            <SignUpButton mode="modal">
              <button type="button" className="home-v2-button home-v2-button-primary" onClick={onClose}>Create a free account</button>
            </SignUpButton>
            <SignInButton mode="modal">
              <button type="button" className="home-v2-button home-v2-button-secondary" onClick={onClose}>Log in</button>
            </SignInButton>
          </div>
          <small>Tournament Review is available now. Poker Coach is coming later.</small>
        </div>
      </section>
    </div>
  );
}
