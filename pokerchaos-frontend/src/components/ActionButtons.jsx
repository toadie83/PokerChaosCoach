export default function ActionButtons({ actions, onAction, embedded = false, title = "Actions", disabled = false }) {
  const content = (
    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
      {(actions || []).map((a) => (
        <button key={a.code} onClick={() => onAction(a.code)} disabled={disabled}>
          {a.label}
        </button>
      ))}
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
