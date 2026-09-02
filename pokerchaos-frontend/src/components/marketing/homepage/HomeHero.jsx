import pokerNightfall from "../../../assets/marketing/emerald-poker-nightfall.png";

const PRODUCT_MARKERS = [
  "Private upload",
  "100% free",
  "Instant results",
];

export default function HomeHero({ upload }) {
  return (
    <section className="home-v2-hero" id="top">
      <img
        className="home-v2-hero-art"
        src={pokerNightfall}
        alt=""
        aria-hidden="true"
        decoding="async"
      />
      <div className="home-v2-hero-copy">
        <p className="home-v2-kicker">Free tournament review</p>
        <h1>Find My Study Spots <span>— Free</span></h1>
        <p className="home-v2-hero-lead">
          Upload a recent tournament and get 2–3 matched MTT lessons based on the
          decisions worth studying.
        </p>
        <div className="home-v2-hero-markers" aria-label="Product details">
          {PRODUCT_MARKERS.map((marker) => (
            <span key={marker}><i aria-hidden="true">✓</i>{marker}</span>
          ))}
        </div>
        <div className="home-v2-hero-product" id="upload">
          {upload}
        </div>
      </div>
    </section>
  );
}
