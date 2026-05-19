import HandReviewPanel from "./components/HandReviewPanel.jsx";

export default function ReviewApp({ entitlements = null }) {
  return (
    <div className="wrap review-wrap">
      <HandReviewPanel entitlements={entitlements} />
    </div>
  );
}
