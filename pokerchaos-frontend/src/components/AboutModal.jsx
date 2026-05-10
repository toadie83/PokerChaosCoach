import { useEffect, useMemo, useState } from "react";

const ABOUT_SLIDES = [
  {
    id: "getting-started",
    title: "Getting Started",
    points: [
      "Export your tournament hand history from PokerCraft.",
      "Upload the hand history file in Hand Review and let PlaybackPoker parse it.",
      "Once parsed, your hands are ready for filtering, tagging, and deeper review.",
    ],
  },
  {
    id: "reviewing",
    title: "Reviewing Hands",
    points: [
      "Use tournament summary panels to spot key leaks and pressure points.",
      "Filter by position, stack depth, stage, and action pattern to focus on specific spots.",
      "Core tournament review and filtering tools are local-first and free by default.",
    ],
  },
  {
    id: "ai-features",
    title: "AI Features",
    points: [
      "Look for the AI symbol ⚡ or AI Review button on supported views.",
      "Our poker-tuned AI can analyze your decisions and suggest improvements.",
      "AI analysis is available with a low-cost subscription to cover model usage.",
    ],
  },
];

export default function AboutModal({ open, onClose }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const totalSlides = ABOUT_SLIDES.length;

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, totalSlides - 1));
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open, totalSlides]);

  const slide = useMemo(() => ABOUT_SLIDES[activeIndex], [activeIndex]);

  if (!open) return null;

  const handleBackdropClick = (event) => {
    if (event.target !== event.currentTarget) return;
    onClose?.();
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div
        className="modal about-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 className="modal-title">About PlaybackPoker</h2>
            <p className="about-modal-step">
              {activeIndex + 1} of {totalSlides}
            </p>
          </div>
          <button type="button" className="link-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="modal-body about-modal-body">
          <h3 className="about-slide-title">{slide.title}</h3>
          <ul className="about-slide-points">
            {slide.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
        <div className="modal-footer about-modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setActiveIndex((index) => Math.max(index - 1, 0))}
            disabled={activeIndex === 0}
          >
            Back
          </button>
          <div
            className="about-slide-dots"
            role="tablist"
            aria-label="About slide navigation"
          >
            {ABOUT_SLIDES.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`about-slide-dot ${index === activeIndex ? "active" : ""}`}
                onClick={() => setActiveIndex(index)}
                aria-label={`Go to slide ${index + 1}`}
                aria-current={index === activeIndex}
              />
            ))}
          </div>
          {activeIndex < totalSlides - 1 ? (
            <button
              type="button"
              onClick={() =>
                setActiveIndex((index) => Math.min(index + 1, totalSlides - 1))
              }
            >
              Next
            </button>
          ) : (
            <button type="button" onClick={onClose}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
