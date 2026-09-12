import { useEffect, useRef, useState } from "react";
import { captureTableFrame } from "../vision/localBetOcr.js";
import { detectDealerButtonFromFrame, settleDealerObservation } from "../vision/localDealerWatcher.js";

export default function LocalDealerWatcher({ videoRef, regions, absentSeats = [], stream, paused = false, onObservation }) {
  const [observation, setObservation] = useState(null);
  const onObservationRef = useRef(onObservation);
  useEffect(() => { onObservationRef.current = onObservation; }, [onObservation]);

  useEffect(() => {
    if (!stream || paused || !Array.isArray(regions)) return undefined;
    let previous = null;
    const scan = () => {
      const frame = captureTableFrame(videoRef.current);
      const absent = new Set(absentSeats.map(Number));
      const detection = detectDealerButtonFromFrame(
        frame,
        regions.map((region, seat) => absent.has(seat) ? { ...region, dealer: null } : region),
      );
      if (!detection) return;
      const next = settleDealerObservation(previous, detection);
      previous = next;
      setObservation(next);
      onObservationRef.current?.(next);
    };
    scan();
    const timer = window.setInterval(scan, 300);
    return () => window.clearInterval(timer);
  }, [absentSeats.join(","), paused, regions, stream, videoRef]);

  const bestSeat = observation?.bestSeat;
  const label = Number.isInteger(observation?.dealerScreenSeat)
    ? observation.dealerScreenSeat === 0 ? "Hero" : `V${observation.dealerScreenSeat}`
    : Number.isInteger(bestSeat)
      ? bestSeat === 0 ? "Hero" : `V${bestSeat}`
      : "none";
  const statusText = observation?.confirmed
    ? `${label} confirmed`
    : Number.isInteger(bestSeat)
      ? `${label} candidate`
      : "searching";
  return (
    <p className="local-dealer-status" role="status">
      Dealer watcher: {statusText}
      {Number.isFinite(observation?.confidence) ? ` · ${Math.round(observation.confidence * 100)}%` : ""}
      {observation?.repeats ? ` · repeat ${observation.repeats}` : ""}
      {paused ? " · paused during calibration" : ""}
    </p>
  );
}
