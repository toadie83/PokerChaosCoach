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
  const secondaryPresets = useMemo(
    () =>
      (Array.isArray(config?.secondaryPresets)
        ? config.secondaryPresets.filter(Number.isFinite)
        : []),
    [config],
  );
  const [amount, setAmount] = useState("");
  const [secondaryAmount, setSecondaryAmount] = useState("");

  useEffect(() => {
    setAmount(presets[0] ? String(presets[0]) : "");
    const configuredSecondary = Number(config?.secondaryDefault);
    setSecondaryAmount(
      Number.isFinite(configuredSecondary) && configuredSecondary > 0
        ? String(configuredSecondary)
        : secondaryPresets[0]
          ? String(secondaryPresets[0])
          : "",
    );
  }, [config, presets, secondaryPresets]);

  if (!config) return null;
  const numeric = Number(amount);
  const secondaryNumeric = Number(secondaryAmount);
  const hasSecondary = Boolean(config?.secondaryAmountKey);
  const secondaryValid =
    !hasSecondary || (Number.isFinite(secondaryNumeric) && secondaryNumeric > 0);
  const sequenceValid =
    !config?.amountMustExceedSecondary ||
    (secondaryValid && numeric > secondaryNumeric);
  const valid =
    Number.isFinite(numeric) &&
    numeric > 0 &&
    (!hasMinimum || numeric >= minimum) &&
    secondaryValid &&
    sequenceValid;
  const confirm = () =>
    onConfirm(
      numeric,
      hasSecondary
        ? { [config.secondaryAmountKey]: secondaryNumeric }
        : {},
    );

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
          {hasSecondary ? (
            <>
              <label className="action-amount-field">
                <span>{config.secondaryAmountLabel || "Initial amount (BB)"}</span>
                <input
                  type="number"
                  min={0.01}
                  step="0.05"
                  value={secondaryAmount}
                  autoFocus
                  onChange={(event) => setSecondaryAmount(event.target.value)}
                />
              </label>
              {secondaryPresets.length ? (
                <div className="action-amount-presets" aria-label="Initial action quick sizes">
                  {secondaryPresets.map((preset) => (
                    <button
                      type="button"
                      key={preset}
                      className={Number(secondaryAmount) === preset ? "active" : ""}
                      onClick={() => setSecondaryAmount(String(preset))}
                    >
                      {preset} BB
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
          <label className="action-amount-field">
            <span>{config.amountLabel || "Amount (BB)"}</span>
            <input
              type="number"
              min={hasMinimum ? minimum : 0.01}
              step="0.05"
              value={amount}
              autoFocus={!hasSecondary}
              onChange={(event) => setAmount(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && valid) confirm();
              }}
            />
          </label>
          {hasMinimum ? (
            <span className="drawer-hint">Minimum legal size: {minimum} BB</span>
          ) : null}
          {hasSecondary && !sequenceValid ? (
            <span className="drawer-hint">The 3-bet must be larger than the initial open.</span>
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
            onClick={confirm}
          >
            Record action
          </button>
        </div>
      </section>
    </div>
  );
}
