export default function LearningDropdown({
  isOpen,
  labelId,
  panelId,
  sections,
  onToggle,
  onClose,
  triggerClassName = "",
}) {
  return (
    <div className="home-learning">
      <button
        type="button"
        className={`home-nav-link home-nav-link-button ${triggerClassName}`.trim()}
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-labelledby={labelId}
        onClick={onToggle}
      >
        <span id={labelId}>Learning</span>
        <span className={`home-nav-caret ${isOpen ? "is-open" : ""}`} aria-hidden="true">
          ^
        </span>
      </button>
      <div
        id={panelId}
        className={`home-learning-panel ${isOpen ? "is-open" : ""}`}
        role="group"
        aria-label="Learning links"
      >
        {sections.map((section) => (
          <div className="home-learning-group" key={section.title}>
            <p className="home-learning-title">{section.title}</p>
            <div className="home-learning-grid">
              {section.items.map((item) => (
                <a
                  key={item.href}
                  className="home-learning-card"
                  href={item.href}
                  onClick={onClose}
                >
                  <span className="home-learning-card-title">{item.label}</span>
                  <span className="home-learning-card-copy">
                    {item.description}
                  </span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
