import { useEffect, useRef, useState } from "react";
import { newLocalHand, changeLocalStreet, seedLocalBlinds, applyLocalAbsentSeats, applyLocalAmounts, applyLocalCardStates, applyLocalSeatEvidence, applyLocalStackStates, applyLocalTotalPot, confirmLocalSeatStatus, overrideLocalSeatStatus, localSeatCurrentStackBB, localSeatStackReconciled, localStackSnapshot, localStackTargetSeats, appendLocalDebug, summarizeLocalHand } from "../vision/localHandTracker.js";
import { captureActionCrops, captureBetCrops, captureCardStates, captureStackCrops, captureTableFrame, captureTotalPotCrop, settleLocalActionLabel, settleLocalBet, settleLocalTotalPot, validateSplitBet } from "../vision/localBetOcr.js";

export default function LocalBetOcrPanel({ videoRef, regions, stream, paused, cardContext, seatStatusOverride, absentSeats = [], onTrackerUpdate, blindSeats, handComplete = false, seatCount = 8, diagnosticsLead = null, anteBB = 0 }) {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [readings, setReadings] = useState([]);
  const [totalPotDiagnostic, setTotalPotDiagnostic] = useState(null);
  const [stats, setStats] = useState({ batches: 0, durationMs: 0 });
  const evidence = useRef([]);
  const [debug, setDebug] = useState(false);
  const [stackReads, setStackReads] = useState(true);
  const [actionLabelReads, setActionLabelReads] = useState(false);
  const debugRef = useRef(false);
  const epoch = useRef(0);
  const handRef = useRef(newLocalHand(1, "preflop", seatCount));
  const [hand, setHand] = useState(handRef.current);
  const [sb, setSb] = useState(1);
  const [bb, setBb] = useState(2);
  const trackingRequested = useRef(false);
  const openingStackSeedRef = useRef({ at: 0, observations: [] });
  const handledStatusOverrideRef = useRef(Number(seatStatusOverride?.id || 0));
  const onTrackerUpdateRef = useRef(onTrackerUpdate);
  const mappingKeyRef = useRef(`${seatCount}:${blindSeats?.sb ?? ""}:${blindSeats?.bb ?? ""}`);
  useEffect(() => { onTrackerUpdateRef.current = onTrackerUpdate; }, [onTrackerUpdate]);
  useEffect(() => () => onTrackerUpdateRef.current?.(null), []);
  useEffect(() => {
    if (!paused && stream) onTrackerUpdateRef.current?.(handRef.current);
  }, [paused, stream]);
  function updateHand(next) { handRef.current = next; setHand(next); onTrackerUpdateRef.current?.(next); }
  function clearDebug() { evidence.current = []; setReadings([]); setTotalPotDiagnostic(null); }
  function seedNewLocalHand(next, includeVisionStacks = false) {
    let seeded = applyLocalAbsentSeats(next, absentSeats);
    seeded = seeded.street === "preflop" && blindSeats ? seedLocalBlinds(seeded, blindSeats.sb, blindSeats.bb) : seeded;
    if (includeVisionStacks && seeded.street === "preflop" && openingStackSeedRef.current.observations.length) {
      seeded = applyLocalStackStates(seeded, openingStackSeedRef.current.observations, openingStackSeedRef.current.at);
    }
    return seeded;
  }
  function resetHand(includeVisionStacks = false) {
    epoch.current++;
    const next = newLocalHand(handRef.current.id + 1, cardContext?.street || "preflop", seatCount);
    if (!includeVisionStacks) openingStackSeedRef.current = { at: 0, observations: [] };
    updateHand(seedNewLocalHand(next, includeVisionStacks));
    clearDebug();
  }
  useEffect(() => {
    updateHand(applyLocalAbsentSeats(handRef.current, absentSeats));
  }, [absentSeats.join(",")]);
  useEffect(() => {
    const requestId = Number(seatStatusOverride?.id || 0);
    if (!requestId || requestId <= handledStatusOverrideRef.current) return;
    handledStatusOverrideRef.current = requestId;
    updateHand(overrideLocalSeatStatus(
      handRef.current,
      Number(seatStatusOverride.seat),
      seatStatusOverride.status,
      Number(seatStatusOverride.at || Date.now()),
    ));
  }, [seatStatusOverride?.id]);
  useEffect(() => {
    if (!debug) return;
    const timer = setInterval(() => {
      const cutoff = Date.now() - 10000;
      evidence.current = evidence.current.filter(b => b.capturedAt >= cutoff);
      setReadings(rows => rows.length && rows[0].capturedAt < cutoff ? [] : rows);
    }, 1000);
    return () => clearInterval(timer);
  }, [debug]);
  useEffect(() => {
    if (!stream || handComplete) {
      setRunning(false);
      clearDebug();
    } else if (paused) clearDebug();
  }, [paused, stream, handComplete]);
  useEffect(() => {
    if (stream && !paused && !handComplete && trackingRequested.current) setRunning(true);
  }, [paused, stream, handComplete]);
  useEffect(() => {
    const mappingKey = `${seatCount}:${blindSeats?.sb ?? ""}:${blindSeats?.bb ?? ""}`;
    if (mappingKeyRef.current === mappingKey) return;
    mappingKeyRef.current = mappingKey;
    resetHand(true);
  }, [seatCount, blindSeats?.sb, blindSeats?.bb]);
  useEffect(() => {
    if (!cardContext || cardContext.street === "unknown") return;
    epoch.current++;
    const visionStacks = Array.isArray(cardContext.opponentStacks)
      ? cardContext.opponentStacks
          .filter((entry) => Number.isInteger(Number(entry?.screenSeat)) && Number.isFinite(Number(entry?.stackBehindBB)) && Number(entry.stackBehindBB) > 0)
          .map((entry) => ({
            seat: Number(entry.screenSeat),
            stackBehindBB: Number(entry.stackBehindBB),
            confidence: entry.confidence,
            source: "replay_vision",
          }))
      : [];
    if (cardContext.street === "preflop") {
      openingStackSeedRef.current = { at: Number(cardContext.at || Date.now()), observations: visionStacks };
    }
    let nextHand;
    if (cardContext.newHand) {
      nextHand = newLocalHand(handRef.current.id + 1, cardContext.street, seatCount);
      nextHand = seedNewLocalHand(nextHand, true);
      if (trackingRequested.current && !handComplete) setRunning(true);
    } else nextHand = changeLocalStreet(handRef.current, cardContext.street);
    if (!cardContext.newHand && cardContext.street === "preflop" && visionStacks.length) {
      nextHand = applyLocalStackStates(nextHand, visionStacks, Number(cardContext.at || Date.now()));
    }
    updateHand(nextHand);
    clearDebug();
  }, [cardContext?.at]);
  useEffect(() => {
    if (!running || !stream || paused || handComplete) return;
    let cancelled = false;
    let worker = null;
    let timer;
    let previousAmounts = {};
    let previousActions = [];
    let previousStacks = [];
    let previousTotalPot = null;
    let latestActionDiagnostics = {};
    let latestStackDiagnostics = {};
    let latestStackTargetSeats = [];
    let previousEpoch = epoch.current;
    let batchNumber = 0;
    setReadings([]); setStats({ batches: 0, durationMs: 0 }); evidence.current = [];

    async function recognizeAmountCrop(crop) {
      let data;
      let splitRead = null;
      try {
        if (crop.amountImage && crop.suffixImage) {
          const amount = await worker.recognize(crop.amountImage, { tessedit_pageseg_mode: "7" });
          if (cancelled) return null;
          const suffix = await worker.recognize(crop.suffixImage, { tessedit_pageseg_mode: "13" });
          splitRead = { amountText: amount.data.text, suffixText: suffix.data.text, amountConfidence: amount.data.confidence, suffixConfidence: suffix.data.confidence };
          data = validateSplitBet(splitRead.amountText, splitRead.suffixText, splitRead.amountConfidence, splitRead.suffixConfidence);
        } else {
          ({ data } = crop.textBandFound ? await worker.recognize(crop.processedImage, { tessedit_pageseg_mode: "7" }) : { data: { text: "", confidence: 0 } });
        }
      } catch (cropError) {
        data = { text: "", confidence: 0, reason: `Seat read failed: ${cropError.message}` };
      }
      return { ...crop, splitRead, text: data.text || "", confidence: data.confidence, completedAt: Date.now() };
    }

    async function scan() {
      if (cancelled) return;
      try {
        const scanEpoch = epoch.current;
        if (previousEpoch !== scanEpoch) {
          previousAmounts = {};
          previousActions = [];
          previousStacks = [];
          previousTotalPot = null;
          latestActionDiagnostics = {};
          latestStackDiagnostics = {};
          latestStackTargetSeats = [];
          previousEpoch = scanEpoch;
        }
        const frame = captureTableFrame(videoRef.current);
        const absent = new Set(absentSeats.map(Number));
        const crops = captureBetCrops(videoRef.current, regions, frame)?.filter((crop) => !absent.has(crop.seat));
        if (!crops) { timer = setTimeout(scan, 500); return; }
        const totalPotCrop = handRef.current.street !== "preflop"
          ? captureTotalPotCrop(videoRef.current, regions, frame)
          : null;
        let cardStates = null;
        try { cardStates = captureCardStates(videoRef.current, regions, frame)?.filter((reading) => !absent.has(reading.seat)); } catch (cardError) { setStatus(`Tracking locally; card status unavailable: ${cardError.message}`); }
        const readActions = actionLabelReads && batchNumber % 4 === 0;
        const readStacks = stackReads && handRef.current.street !== "preflop" && batchNumber % 2 === 0;
        const actionCrops = readActions ? captureActionCrops(videoRef.current, regions, frame).filter((crop) => crop.seat !== 0 && !absent.has(crop.seat)) : [];
        const capturedStackCrops = readStacks ? captureStackCrops(videoRef.current, regions, frame).filter((crop) => crop.seat !== 0 && !absent.has(crop.seat)) : [];
        batchNumber += 1;
        const started = performance.now();
        let totalPotReading = null;
        if (totalPotCrop) {
          const reading = await recognizeAmountCrop(totalPotCrop);
          if (cancelled) return;
          if (reading) totalPotReading = settleLocalTotalPot(previousTotalPot, reading);
        }
        const next = [];
        for (const crop of crops) {
          if (cancelled) return;
          if (!crop || !Number.isInteger(crop.seat)) continue;
          const reading = await recognizeAmountCrop(crop);
          if (cancelled) return;
          if (reading) next.push(settleLocalBet(previousAmounts[crop.seat], reading));
        }
        const actionReadings = [];
        for (const crop of actionCrops) {
          if (cancelled) return;
          let data = { text: "", confidence: 0 };
          try {
            ({ data } = crop.textBandFound ? await worker.recognize(crop.processedImage, { tessedit_pageseg_mode: "7" }) : { data });
          } catch {}
          actionReadings.push(settleLocalActionLabel(previousActions[crop.seat], { ...crop, text: data.text || "", confidence: data.confidence }));
        }
        let nextHand = applyLocalAmounts(handRef.current, next, crops[0].capturedAt);
        nextHand = applyLocalTotalPot(
          nextHand,
          totalPotReading,
          crops[0].capturedAt,
          { anteTotalBB: Math.max(0, Number(anteBB) || 0) * Math.max(2, Number(seatCount || 0) - absentSeats.length) },
        );
        nextHand = applyLocalCardStates(nextHand, cardStates, crops[0].capturedAt);
        nextHand = applyLocalSeatEvidence(nextHand, actionReadings.filter((reading) => reading.actionLabel).map((reading) => ({ seat: reading.seat, actionLabel: reading.actionLabel, confidence: reading.confidence, validated: true })), crops[0].capturedAt);
        const stackTargets = new Set(readStacks ? localStackTargetSeats(nextHand) : []);
        const stackCrops = capturedStackCrops.filter((crop) => stackTargets.has(crop.seat));
        const stackReadings = [];
        for (const crop of stackCrops) {
          if (cancelled) return;
          const reading = await recognizeAmountCrop(crop);
          if (reading) stackReadings.push(settleLocalBet(previousStacks[crop.seat], reading));
        }
        if (scanEpoch !== epoch.current) {
          previousAmounts = {};
          previousActions = [];
          previousStacks = [];
          previousTotalPot = null;
          timer = setTimeout(scan, 500);
          return;
        }
        previousAmounts = Object.fromEntries(next.map((reading) => [
          reading.seat,
          { candidateBB: reading.candidateBB, repeats: reading.repeats },
        ]));
        previousTotalPot = totalPotReading
          ? { candidateBB: totalPotReading.candidateBB, repeats: totalPotReading.repeats }
          : null;
        if (readActions) {
          previousActions = Object.fromEntries(actionReadings.map((reading) => [reading.seat, { candidateLabel: reading.candidateLabel, repeats: reading.repeats }]));
          latestActionDiagnostics = {
            ...latestActionDiagnostics,
            ...Object.fromEntries(actionReadings.map((reading) => [reading.seat, reading])),
          };
        }
        if (readStacks) {
          previousStacks = Object.fromEntries(stackReadings.map((reading) => [reading.seat, { candidateBB: reading.candidateBB, repeats: reading.repeats }]));
          latestStackDiagnostics = {
            ...latestStackDiagnostics,
            ...Object.fromEntries(stackReadings.map((reading) => [reading.seat, reading])),
          };
          latestStackTargetSeats = [...stackTargets];
        }
        const cardBySeat = new Map((cardStates || []).map((item) => [item.seat, item]));
        const diagnosticRows = next.map((row) => ({
          ...row,
          cardState: cardBySeat.get(row.seat) || null,
          actionState: latestActionDiagnostics[row.seat] || null,
          stackState: latestStackDiagnostics[row.seat] || null,
          stackTargeted: latestStackTargetSeats.includes(row.seat),
        }));
        nextHand = applyLocalStackStates(nextHand, stackReadings.filter((reading) => reading.amountBB !== null).map((reading) => ({ seat: reading.seat, stackBehindBB: reading.amountBB, confidence: reading.confidence })), crops[0].capturedAt);
        updateHand(nextHand);
        if (debugRef.current) {
          setReadings(diagnosticRows);
          setTotalPotDiagnostic(totalPotReading);
        }
        const durationMs = Math.round(performance.now() - started);
        setStats(s => ({ batches: s.batches + 1, durationMs }));
        evidence.current = appendLocalDebug(evidence.current, { capturedAt: crops[0].capturedAt, durationMs, readings: diagnosticRows, totalPotReading }, debugRef.current);
        setStatus("Tracking locally");
        timer = setTimeout(scan, 500);
      } catch (error) {
        if (!cancelled) { setStatus(`Local reader stopped: ${error.message}`); setRunning(false); }
      }
    }
    async function start() {
      try {
        setStatus("Loading local text reader (first use downloads language files)...");
        const { createWorker, PSM } = await import("tesseract.js");
        if (cancelled) return;
        worker = await createWorker("eng", 1, { errorHandler: () => {} });
        if (cancelled) { await worker.terminate(); return; }
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, user_defined_dpi: "300" });
        // No character whitelist: stripping a dollar sign could disguise bounty text.
        await scan();
      } catch (error) {
        if (!cancelled) { setStatus(`Could not start local reader: ${error.message}`); setRunning(false); }
      }
    }
    start();
    return () => { cancelled = true; clearTimeout(timer); evidence.current = []; setReadings([]); if (worker) worker.terminate().catch(() => {}); };
  }, [running, stream, regions, videoRef, paused, handComplete, stackReads, actionLabelReads, seatCount, anteBB, absentSeats.join(",")]);

  function exportReads() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, source: "local-bet-ocr", regions, batches: evidence.current }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `local-bet-reads-${Date.now()}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const stackSnapshot = localStackSnapshot(hand);
  const trackerSummary = summarizeLocalHand(hand);
  return <section aria-label="Local tracker">
    <div className="local-tracking-controls">
      <span className={`local-tracking-state ${running && !paused ? "is-running" : ""}`} role="status">
        {paused && running ? "Tracking paused" : running ? (status === "Tracking locally" ? "Tracking on" : status) : "Tracking off"}
      </span>
      <button type="button" disabled={paused} onClick={() => {
        if (running) { trackingRequested.current = false; setRunning(false); setStatus("Stopped"); clearDebug(); }
        else {
          trackingRequested.current = true;
          epoch.current++;
          const nextHand = newLocalHand(handRef.current.id + 1, cardContext?.street || "preflop", seatCount);
          updateHand(seedNewLocalHand(nextHand, true));
          setRunning(true);
        }
      }}>{running ? "Stop tracking" : "Start tracking"}</button>
    </div>
    <details className="local-tracking-diagnostics">
    <summary>Diagnostics and advanced settings</summary>
    <div className="local-tracking-diagnostics-content">
    {diagnosticsLead}
    <p>Replay Vision supplies the preflop opening stacks. Current stacks are derived from those values and tracked contributions; local stack OCR is reserved for flop and later validation.</p>
    <p>{status} / {stats.batches} scans / last scan {stats.durationMs} ms</p>
    <p>Total pot: {trackerSummary.displayedTotalPotBB !== null ? `${trackerSummary.displayedTotalPotBB} BB table display` : Array.isArray(regions?.[0]?.totalPot) ? "waiting for a stable postflop read" : "region not calibrated"} · Ledger {Number((trackerSummary.calculatedPotBB + Math.max(0, Number(anteBB) || 0) * Math.max(2, Number(seatCount || 0) - absentSeats.length)).toFixed(2))} BB{trackerSummary.potReconciliation ? ` · ${trackerSummary.potReconciliation.status === "confirmed" ? "matched" : `display override (${trackerSummary.potReconciliation.deltaBB > 0 ? "+" : ""}${trackerSummary.potReconciliation.deltaBB} BB)`}` : ""}</p>
    <h4>Current hand {hand.id} / {hand.street}</h4>
    <button type="button" onClick={() => resetHand(false)}>New hand</button>
    <label>Street <select value={hand.street} onChange={e => { epoch.current++; updateHand(changeLocalStreet(handRef.current, e.target.value)); clearDebug(); }}>
      {["preflop","flop","turn","river"].map(street=><option key={street}>{street}</option>)}
    </select></label>
    <p>Use New hand or Street if automatic card context misses a transition. Blank reads retain the last commitment until a reset; they do not mean zero, fold or check.</p>
    {blindSeats ? <p>Blinds are mapped automatically from Hero's Coach seat: SB {blindSeats.sb === 0 ? "Hero" : `V${blindSeats.sb}`}, BB {blindSeats.bb === 0 ? "Hero" : `V${blindSeats.bb}`}. Manual confirmation remains available if the table layout is unusual.</p> : <p>Set Hero's Coach seat to map blinds automatically, or confirm them manually below.</p>}
    {hand.street === "preflop" && <details><summary>Confirm starting blinds (optional)</summary>
      <p>Only confirm before any voluntary action. This seeds 0.5/1 BB blinds and clears this hand's candidate timeline.</p>
      <label>SB <select value={sb} onChange={e=>setSb(Number(e.target.value))}>{Array.from({length:seatCount},(_,i)=><option key={i} value={i}>{i===0?"Hero":"V"+i}</option>)}</select></label>
      <label>BB <select value={bb} onChange={e=>setBb(Number(e.target.value))}>{Array.from({length:seatCount},(_,i)=><option key={i} value={i}>{i===0?"Hero":"V"+i}</option>)}</select></label>
      <button type="button" disabled={sb===bb || Object.values(hand.committed).some(v=>v>1)} onClick={()=>{epoch.current++;updateHand(seedLocalBlinds(handRef.current,sb,bb));}}>Confirm blinds only</button>
    </details>}
    <p>{Array.from({length:seatCount},(_,i)=>(i===0?"Hero":"V"+i)+": "+(hand.committed[i] ?? "unknown")+" BB").join(" / ")}</p>
    <p>Opponent status: {Array.from({length:seatCount-1},(_,i)=>{const seat=i+1;return `V${seat} ${hand.seatStatus?.[seat] || "unknown"};`}).join(" ")}</p>
    <p>Opening stack snapshot: {stackSnapshot.knownSeats.length}/{stackSnapshot.expectedSeats.length}{stackSnapshot.complete ? " complete" : ` · missing ${stackSnapshot.missingSeats.map((seat)=>`V${seat}`).join(", ")}`}. Accepted openings: {Object.values(hand.seats || {}).filter((record)=>record.seat !== 0 && Number.isFinite(record.startingStackBB)).map((record)=>`V${record.seat} ${record.startingStackBB} BB${record.openingStackSource === "replay_vision" ? " (vision)" : record.openingStackSource === "stack_ocr" ? " (postflop OCR fallback)" : ""}`).join(" / ") || "waiting for vision"}</p>
    <p>Derived current stacks: {Object.values(hand.seats || {}).filter((record)=>record.seat !== 0 && localSeatCurrentStackBB(hand, record.seat) !== null).map((record)=>`V${record.seat} ${localSeatCurrentStackBB(hand, record.seat)} BB${hand.street === "preflop" ? " (opening − bets)" : localSeatStackReconciled(hand, record.seat) ? "" : " (ledger-derived)"}`).join(" / ") || "unknown"}</p>
    <div className="local-status-confirmations">
      {Array.from({length:seatCount-1},(_,i)=>i+1).map((seat) => <span key={seat}>
        V{seat} <button type="button" disabled={hand.seatStatus?.[seat] === "folded"} onClick={()=>updateHand(confirmLocalSeatStatus(handRef.current,seat,"folded"))}>Confirm fold</button>{" "}
        <button type="button" disabled={hand.seatStatus?.[seat] === "all_in"} onClick={()=>updateHand(confirmLocalSeatStatus(handRef.current,seat,"all_in"))}>Confirm all-in</button>
      </span>)}
    </div>
    <p>Action candidates need review. Simultaneous changes cannot establish action order. {hand.pendingReset ? "Tracking actions paused until a street/hand reset." : ""}</p>
    <ol className="turbo-log">{hand.events.map((event,i)=><li key={event.at+"-"+i}>{new Date(event.at).toLocaleTimeString()} / {event.street}: {event.text}</li>)}</ol>
    <p>Only the current hand is retained (maximum 100 events). No OCR read history or crop images are stored during normal tracking.</p>
    <label><input type="checkbox" checked={debug} onChange={e=>{debugRef.current=e.target.checked;setDebug(e.target.checked);clearDebug();}} /> Capture debug crops (off by default)</label>
    <label><input type="checkbox" checked={stackReads} onChange={e=>setStackReads(e.target.checked)} /> Validate involved villain stacks with local OCR from the flop onward (enabled by default)</label>
    <label><input type="checkbox" checked={actionLabelReads} onChange={e=>setActionLabelReads(e.target.checked)} /> Read exact Fold/All-in/Check labels (optional and slower)</label>
    {debug && <>
      <p>Debug retains at most 8 batches from the last 10 seconds. Stop, reset, or turning debug off clears them. The first reader start downloads language files.</p>
      <button type="button" disabled={!readings.length} onClick={exportReads}>Export debug reads</button>
      <p>Accepted requires number + BB, at least 75% confidence and two matching reads. Inspect processed crops to verify segmentation.</p>
      <div><strong>Total Pot crop</strong>{totalPotDiagnostic ? <><br /><img src={totalPotDiagnostic.image} alt="Unannotated Total Pot region" style={{ width: 220, maxHeight: 100, objectFit: "contain" }} /><br /><img src={totalPotDiagnostic.processedImage} alt="Processed Total Pot text sent to OCR" style={{ width: 220, maxHeight: 80, objectFit: "contain" }} /><br /><code>{totalPotDiagnostic.text.trim() || "(no text)"}</code> · {Math.round(totalPotDiagnostic.confidence || 0)}% · repeat {totalPotDiagnostic.repeats || 0} · {totalPotDiagnostic.amountBB ?? "Unknown"} BB · {totalPotDiagnostic.reason}</> : " No postflop read yet"}</div>
    <div className="turbo-table-wrap"><table><thead><tr><th>Seat</th><th>Bet crop</th><th>Bet OCR</th><th>Accepted bet</th><th>Stack crop</th><th>Stack OCR</th><th>Accepted stack</th><th>Cards / action</th><th>Result</th></tr></thead>
      <tbody>{readings.map(row => <tr key={row.seat}>
        <td>{row.seat === 0 ? "Hero" : `V${row.seat}`}<br />{new Date(row.capturedAt).toLocaleTimeString()}</td>
        <td><img src={row.image} alt={`Unannotated bet region for seat ${row.seat}`} style={{ width: 160, maxHeight: 100, objectFit: "contain" }} /><br /><img src={row.processedImage} alt={`Processed text sent to OCR for seat ${row.seat}`} style={{ width: 160, maxHeight: 80, objectFit: "contain" }} /></td>
        <td><code>{row.text.trim() || "(no text)"}</code><br />{Math.round(row.confidence || 0)}% · repeat {row.repeats || 0}{row.splitRead && <details><summary>Separate amount / suffix reads</summary><img src={row.amountImage} alt="Amount input" style={{ maxWidth: 100 }} /> <img src={row.suffixImage} alt="Suffix input" style={{ maxWidth: 100 }} /><br />Amount: {row.splitRead.amountText.trim()} ({Math.round(row.splitRead.amountConfidence)}%)<br />Suffix: {row.splitRead.suffixText.trim()} ({Math.round(row.splitRead.suffixConfidence)}%)</details>}</td>
        <td>{row.amountBB ?? "Unknown"} BB</td>
        <td>{row.seat === 0 ? "Hero excluded" : row.stackState ? <><img src={row.stackState.image} alt={`Villain stack region for seat ${row.seat}`} style={{ width: 160, maxHeight: 100, objectFit: "contain" }} /><br /><img src={row.stackState.processedImage} alt={`Processed stack text for seat ${row.seat}`} style={{ width: 160, maxHeight: 80, objectFit: "contain" }} /></> : row.stackTargeted ? "Awaiting stack scan" : "Not currently targeted"}</td>
        <td>{row.stackState ? <><code>{row.stackState.text.trim() || "(no text)"}</code><br />{Math.round(row.stackState.confidence || 0)}% · repeat {row.stackState.repeats || 0}</> : "—"}</td>
        <td>{row.stackState?.amountBB != null ? `${row.stackState.amountBB} BB` : "Unknown"}</td>
        <td>{row.cardState ? `${row.cardState.cardsPresent ? "active" : "fold candidate"} (${Math.round((row.cardState.confidence || 0) * 100)}%)` : "not read"}{row.actionState?.actionLabel ? ` / ${row.actionState.actionLabel} confirmed` : ""}</td>
        <td>Bet: {row.reason}{row.stackState ? <><br />Stack: {row.stackState.reason}</> : null}</td>
      </tr>)}</tbody></table></div>
    </>}
    </div>
    </details>
  </section>;
}
