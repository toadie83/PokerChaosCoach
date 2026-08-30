export default function ActionButtons({
  actions,
  onAction,
  embedded = false,
  title = "Actions",
  disabled = false,
  highlightedCodes = [],
}) {
  const content = (
    <div className="row action-button-row">
      {(actions || []).map((a) => {
        const isHighlighted = highlightedCodes.includes(a.code);
        return (
          <button
            key={a.code}
            type="button"
            onClick={() => onAction(a)}
            disabled={disabled}
            className={`action-btn${isHighlighted ? " highlighted" : ""}`}
          >
            {a.label}
          </button>
        );
      })}
    </div>
  );

  if (embedded) return content;
  return (
    <div className="panel">
      <div className="title">{title}</div>
      {content}
    </div>
  );
}
