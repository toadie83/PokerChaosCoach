export default function SeatSelection({ heroSeat, tableSize, onChange }) {
  return (
    <div className="panel">
      <div className="title">Seat Selection</div>
      <div className="row">
        <label htmlFor="tableSize">Table Size</label>
        <select
          id="tableSize"
          value={tableSize}
          onChange={(e) => onChange("tableSize", Number(e.target.value))}
        >
          {[6, 8, 9].map((n) => (
            <option key={n} value={n}>
              {n}-max
            </option>
          ))}
        </select>

        <label htmlFor="heroSeat">Hero Seat</label>
        <input
          id="heroSeat"
          placeholder="e.g. BTN, SB, UTG"
          value={heroSeat}
          onChange={(e) => onChange("heroSeat", e.target.value)}
        />
      </div>
    </div>
  );
}

