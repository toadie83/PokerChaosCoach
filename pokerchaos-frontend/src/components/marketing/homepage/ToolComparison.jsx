export default function ToolComparison({ rows }) {
  return (
    <section className="home-v2-section home-v2-comparison" id="compare-tools">
      <div className="home-v2-section-heading">
        <p className="home-v2-kicker">Choose the right depth</p>
        <h2>What to study, or what happened and why.</h2>
      </div>
      <div className="home-v2-table-wrap">
        <table>
          <thead><tr><th>Capability</th><th>Study Spots</th><th>Tournament Review</th></tr></thead>
          <tbody>
            {rows.map((row) => <tr key={row.label}><th>{row.label}</th><td>{row.studySpots}</td><td>{row.review}</td></tr>)}
          </tbody>
        </table>
      </div>
    </section>
  );
}
