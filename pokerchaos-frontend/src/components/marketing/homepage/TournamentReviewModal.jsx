import { useEffect, useState } from "react";
import { SignInButton, SignUpButton } from "@clerk/react";

const GALLERY = [
  {
    src: "https://pub-1f64fd7c586548cbb026391e26e2d358.r2.dev/tournament-review1.png",
    alt: "Tournament Review workspace showing the complete tournament decision trail",
    label: "Tournament workspace",
  },
  {
    src: "https://pub-1f64fd7c586548cbb026391e26e2d358.r2.dev/ReplayVision.png",
    alt: "Tournament Review hand replay showing the poker table, street guidance, and decision log",
    label: "Decision replay",
  },
];

const BENEFITS = [
  ["Every hand analysed", "See the decisions that shaped your tournament, not just a small preview."],
  ["Recurring leak detection", "Spot patterns that repeat across positions, streets, and stack depths."],
  ["Deeper decision review", "Move from a headline result into the context behind each decision."],
  ["Tournament-wide patterns", "Understand your progression, frequencies, and next adjustments in one view."],
  ["Decision-by-decision replay", "Revisit every action and street as the table, cards, pot, and stacks update around the hand."],
];

export default function TournamentReviewModal({ open, onClose }) {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    if (open) setActiveSlide(0);
  }, [open]);

  if (!open) return null;

  const slide = GALLERY[activeSlide];
  const showSlide = (index) => {
    setActiveSlide((index + GALLERY.length) % GALLERY.length);
  };

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
        <div className="home-v2-review-modal-gallery">
          <div className="home-v2-review-modal-visual">
            <img key={slide.src} src={slide.src} alt={slide.alt} />
            <button
              className="home-v2-review-gallery-arrow is-previous"
              type="button"
              onClick={() => showSlide(activeSlide - 1)}
              aria-label="Previous Tournament Review image"
            >
              ‹
            </button>
            <button
              className="home-v2-review-gallery-arrow is-next"
              type="button"
              onClick={() => showSlide(activeSlide + 1)}
              aria-label="Next Tournament Review image"
            >
              ›
            </button>
          </div>
          <div className="home-v2-review-gallery-footer">
            <p>{slide.label}</p>
            <div className="home-v2-review-gallery-tabs" role="tablist" aria-label="Tournament Review gallery">
              {GALLERY.map((item, index) => (
                <button
                  key={item.src}
                  type="button"
                  role="tab"
                  aria-selected={activeSlide === index}
                  aria-label={`Show ${item.label}`}
                  onClick={() => showSlide(index)}
                >
                  <span aria-hidden="true" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
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
