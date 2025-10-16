export default function TableUI({ state }) {
  return (
    <div className="panel">
      <div className="title">Table</div>
      <p className="sub">
        Street: <strong>{state.street}</strong> · Seat: <strong>{state.heroSeat || "?"}</strong> ·
        Table: <strong>{state.tableSize}-max</strong>
      </p>
      <p className="sub">Aggressors: {state.aggressors}</p>
      <p className="sub">Previous: {state.previousActions.join(", ") || "(none)"}</p>
    </div>
  );
}

