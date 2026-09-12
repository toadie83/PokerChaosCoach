import { useEffect, useRef, useState } from "react";
import LocalBetOcrPanel from "./LocalBetOcrPanel.jsx";
import LocalDealerWatcher from "./LocalDealerWatcher.jsx";
import { DEFAULT_TURBO_REGIONS, normalizeTurboRegions, validTurboRegions } from "../vision/turboVisionLogic.js";
import "./turbo-vision.css";
const STORAGE_KEY = "pcc_turbo_regions_v5";
function loadRegions() {
  try {
    const saved = normalizeTurboRegions(
      JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem("pcc_turbo_regions_v4") || localStorage.getItem("pcc_turbo_regions_v3") || localStorage.getItem("pcc_turbo_regions_v2")),
    );
    if (validTurboRegions(saved)) return saved;
  } catch {}
  return DEFAULT_TURBO_REGIONS;
}


export default function LocalTableTrackingPanel({ videoRef, stream, cardContext, seatStatusOverride, absentSeats = [], visible = true, onTrackerUpdate, onDealerObservation, onRegionsChange, blindSeats, handComplete = false, seatCount = 8, trackingReady = false, anteBB = 0 }) {
  const [regions, setRegions] = useState(loadRegions);
  const [calibrating, setCalibrating] = useState(false);
  const [seat, setSeat] = useState(0);
  const [regionType, setRegionType] = useState("bet");
  const [corner, setCorner] = useState(null);
  const canvasRef = useRef(null);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(regions)); } catch {} }, [regions]);
  useEffect(() => { onRegionsChange?.(regions); }, [onRegionsChange, regions]);
  useEffect(() => {
    if (!calibrating || !stream) return;
    const draw = () => {
      const video = videoRef.current, canvas = canvasRef.current;
      if (!canvas || !video?.videoWidth) return;
      canvas.width = Math.min(video.videoWidth, 1000); canvas.height = canvas.width * video.videoHeight / video.videoWidth;
      const ctx = canvas.getContext("2d"); ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      regions.forEach((r, i) => { if (regionType === "totalPot" && i !== 0) return; const rect = r[regionType]; if (!Array.isArray(rect)) return; const [x,y,w,h] = rect;
        ctx.strokeStyle = i === seat ? "#fff" : "#ffc857"; ctx.lineWidth = 2;
        ctx.strokeRect(x*canvas.width,y*canvas.height,w*canvas.width,h*canvas.height);
        ctx.fillStyle = "#ffc857"; ctx.font = "14px sans-serif"; ctx.fillText(regionType === "totalPot" ? "Total pot" : i === 0 ? "Hero" : "V"+i,x*canvas.width,Math.max(15,y*canvas.height-3));
      });
    };
    draw(); const timer = setInterval(draw,500); return () => clearInterval(timer);
  }, [calibrating, regionType, stream, regions, seat, videoRef]);
  const calibrate = event => {
    const rect = event.currentTarget.getBoundingClientRect();
    const point = [(event.clientX-rect.left)/rect.width,(event.clientY-rect.top)/rect.height];
    if (!corner) { setCorner(point); return; }
    const targetSeat = regionType === "totalPot" ? 0 : seat;
    const next = [...regions]; next[targetSeat] = { ...next[targetSeat], [regionType]: [Math.min(corner[0],point[0]),Math.min(corner[1],point[1]),Math.abs(point[0]-corner[0]),Math.abs(point[1]-corner[1])] };
    if(validTurboRegions(next)) setRegions(next); setCorner(null);
  };
  const trackingUnavailable = seatCount !== 8 || !trackingReady;
  return <section className="turbo-vision" aria-label="Local table tracking" hidden={!visible}>
    <div className="turbo-vision-content">
    <header className="local-tracking-header">
      <div>
        <strong>Local table tracking</strong>
        <span className="local-tracking-ready">{Array.isArray(regions?.[0]?.totalPot) ? "Regions + total pot calibrated" : "Seat regions calibrated · total pot optional"}</span>
      </div>
      <button type="button" onClick={() => { setCalibrating(v=>!v); setCorner(null); }}>{calibrating ? "Finish calibration" : "Adjust regions"}</button>
    </header>
    {calibrating && <>
      <p>Tracking pauses during calibration. Select a seat and region, then click two opposite corners. Card regions should contain the two face-down card backs. Action and stack regions should contain only their text. Dealer regions should tightly contain the possible yellow D puck. For Total Pot, include the complete “Total Pot: number BB” label. V1 is clockwise from Hero.</p>
      <select aria-label="Tracking region seat" value={seat} onChange={e=>{setSeat(Number(e.target.value));setCorner(null);}}>{regions.map((_,i)=><option key={i} value={i} disabled={regionType === "totalPot" ? i !== 0 : ["cards","action","stack"].includes(regionType) && i === 0}>{i===0?"Hero / table":"V"+i}</option>)}</select>
      <select aria-label="Region type" value={regionType} onChange={e=>{const nextType=e.target.value;setRegionType(nextType);setSeat(nextType === "totalPot" ? 0 : ["cards","action","stack"].includes(nextType) && seat === 0 ? 1 : seat);setCorner(null);}}><option value="bet">Bet amount</option><option value="cards">Cards/status</option><option value="action">Fold/All-in/Check label</option><option value="stack">Opponent stack</option><option value="dealer">Dealer button</option><option value="totalPot">Total pot</option></select>
      <button type="button" onClick={()=>{setRegions(DEFAULT_TURBO_REGIONS);setCorner(null);}}>Reset layout</button>
      <p>{corner ? "Click opposite corner" : "Click first corner"}</p>
      <canvas ref={canvasRef} className="turbo-preview" onClick={calibrate} />
    </>}
    {seatCount !== 8 ? <p role="status">Local table tracking is currently validated for 8-max only. Switch Coach to 8-max to start it.</p> : null}
    {!trackingReady ? <p role="status">Waiting for Replay Vision to commit Hero cards and the final Hero seat before local reads begin.</p> : null}
    <LocalBetOcrPanel
      videoRef={videoRef}
      regions={regions}
      stream={stream}
      paused={calibrating || trackingUnavailable}
      cardContext={cardContext}
      seatStatusOverride={seatStatusOverride}
      absentSeats={absentSeats}
      onTrackerUpdate={onTrackerUpdate}
      blindSeats={blindSeats}
      handComplete={handComplete}
      seatCount={seatCount}
      anteBB={anteBB}
      diagnosticsLead={<LocalDealerWatcher videoRef={videoRef} regions={regions} absentSeats={absentSeats} stream={stream} paused={calibrating || seatCount !== 8} onObservation={onDealerObservation} />}
    />
    </div>
  </section>;
}
