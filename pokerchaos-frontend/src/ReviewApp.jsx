import HandReviewPanel from "./components/HandReviewPanel.jsx";

export default function ReviewApp() {
  return (
    <div className="wrap">
      <div className="panel">
        <div className="panel-heading">
          <div>
            <h1 className="title">Hand Review</h1>
            <p className="sub">
              Parse histories, select hands, and run structured AI review.
            </p>
          </div>
        </div>
        <HandReviewPanel />
      </div>
    </div>
  );
}
