export default function ProductPreview({ notes }) {
  return (
    <section className="home-section" id="product-preview">
      <div className="home-section-heading">
        <p className="home-eyebrow">Product preview</p>
        <h2>See the decision that changed the hand.</h2>
        <p>
          A clean review surface keeps the focus on practical decision quality,
          not on dumping theory for theory&apos;s sake.
        </p>
      </div>
      <div className="home-preview-shell">
        <div className="home-preview-browser">
          <span />
          <span />
          <span />
        </div>
        <div className="home-preview-layout">
          <aside className="home-preview-sidecard">
            <p className="home-preview-label">Input</p>
            <h3>Paste a hand history</h3>
            <p>
              Import a hand from GGPoker or PokerStars and let Playback Poker
              structure the review.
            </p>
            <div className="home-preview-upload">
              <span>Hand_Review_1287.txt</span>
              <span className="home-preview-status">Ready</span>
            </div>
          </aside>
          <div className="home-preview-main">
            <div className="home-preview-summary">
              <p className="home-preview-label">Review summary</p>
              <h3>Leak-focused feedback with street context</h3>
              <p>
                Practical notes highlight the pressure points and the one thing
                worth fixing first.
              </p>
            </div>
            <div className="home-preview-note-grid">
              {notes.map((note) => (
                <article
                  className={`home-preview-note tone-${note.tone}`}
                  key={note.street}
                >
                  <span className="home-preview-note-street">{note.street}</span>
                  <p>{note.note}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
