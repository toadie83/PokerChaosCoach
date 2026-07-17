import { useEffect, useMemo, useState } from "react";

export default function ActionAmountModal({ config, onCancel, onConfirm }) {
  const minimum = Number(config?.minAmountBB);
  const hasMinimum = Number.isFinite(minimum) && minimum > 0;
  const presets = useMemo(
    () =>
      (Array.isArray(config?.presets) ? config.presets.filter(Number.isFinite) : [])
        .filter((value) => !hasMinimum || value >= minimum),
    [config, hasMinimum, minimum],
  );
  const [amount, setAmount] = useState("");

  useEffect(() => {
    setAmount(presets[0] ? String(presets[0]) : "");
  }, [config, presets]);

  if (!config) return null;
  const numeric = Number(amount);
  const valid =
    Number.isFinite(numeric) && numeric > 0 && (!hasMinimum || numeric >= minimum);

  return (
    <div className="modal-backdrop action-amount-backdrop" onClick={onCancel}>
      <section
        className="modal action-amount-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2 className="modal-title">{config.label || "Enter action size"}</h2>
          <button type="button" className="link-btn" onClick={onCancel}>
            Cancel
          </button>
        </header>
        <div className="modal-body action-amount-body">
          <label className="action-amount-field">
            <span>{config.amountLabel || "Amount (BB)"}</span>
            <input
              type="number"
              min={hasMinimum ? minimum : 0.01}
              step="0.05"
              value={amount}
              autoFocus
              onChange={(event) => setAmount(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && valid) onConfirm(numeric);
              }}
            />
          </label>
          {hasMinimum ? (
            <span className="drawer-hint">Minimum legal size: {minimum} BB</span>
          ) : null}
          {presets.length ? (
            <div className="action-amount-presets" aria-label="Quick sizes">
              {presets.map((preset) => (
                <button
                  type="button"
                  key={preset}
                  className={Number(amount) === preset ? "active" : ""}
                  onClick={() => setAmount(String(preset))}
                >
                  {preset} BB
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            className="primary action-amount-confirm"
            disabled={!valid}
            onClick={() => onConfirm(numeric)}
          >
            Record action
          </button>
        </div>
      </section>
    </div>
  );
}
