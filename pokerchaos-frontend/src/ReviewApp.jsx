import HandReviewPanel from "./components/HandReviewPanel.jsx";
import "./review-dashboard.css";

export default function ReviewApp({ entitlements = null }) {
  return (
    <div className="wrap review-wrap review-dashboard" data-theme="dark">
      <HandReviewPanel entitlements={entitlements} />
    </div>
  );
}
