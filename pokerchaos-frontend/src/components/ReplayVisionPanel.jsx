import { useCallback, useEffect, useRef, useState } from "react";
import { requestReplayCardRecognition } from "../api/aiService.js";
import {
  replayDetectionCards,
  validateReplayDetectionContinuity,
} from "../vision/replayVisionLogic.js";

const REGION_STORAGE_KEY = "pcc_gg_replay_regions_v2";
const SAMPLE_INTERVAL_MS = 500;
const REQUIRED_STABLE_SAMPLES = 3;
const STABLE_FRAME_DIFFERENCE = 5;
const CHANGED_FRAME_DIFFERENCE = 7;
const HERO_CHANGED_FRAME_DIFFERENCE = 4.5;
const HERO_NEW_HAND_FRAME_DIFFERENCE = 12;
const HERO_SETTLE_DELAY_MS = 1000;
const RECOGNITION_RETRY_COOLDOWN_MS = 6000;
const BOARD_ANALYSIS_WIDTH = 600;
const HERO_ANALYSIS_WIDTH = 480;

const BOARD_CARD_RECTS = Array.from({ length: 5 }, (_, index) => ({
  x: index * 0.2,
  y: 0,
  width: 0.19,
  height: 1,
}));

const HERO_CARD_RECTS = [
  { x: 0, y: 0, width: 0.58, height: 1 },
  { x: 0.42, y: 0, width: 0.58, height: 1 },
];

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function validRegion(region) {
  return Boolean(
    region &&
      [region.x, region.y, region.width, region.height].every(Number.isFinite) &&
      region.x >= 0 &&
      region.y >= 0 &&
      region.width > 0.01 &&
      region.height > 0.01 &&
      region.x + region.width <= 1.001 &&
      region.y + region.height <= 1.001,
  );
}

function loadSavedRegions() {
  try {
    const parsed = JSON.parse(localStorage.getItem(REGION_STORAGE_KEY) || "null");
    if (validRegion(parsed?.hero) && validRegion(parsed?.board)) {
      return parsed;
    }
  } catch {}
  return null;
}

function storeRegions(regions) {
  try {
    if (regions) localStorage.setItem(REGION_STORAGE_KEY, JSON.stringify(regions));
    else localStorage.removeItem(REGION_STORAGE_KEY);
  } catch {}
}

function boundedRegion(start, end) {
  const region = {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
  return {
    x: clamp(region.x),
    y: clamp(region.y),
    width: clamp(region.width, 0, 1 - region.x),
    height: clamp(region.height, 0, 1 - region.y),
  };
}

function frameDifference(left, right) {
  if (!left || !right || left.length !== right.length) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (let index = 0; index < left.length; index += 1) {
    total += Math.abs(left[index] - right[index]);
  }
  return total / left.length;
}

function pixelOffset(x, y, width) {
  return (y * width + x) * 4;
}

function whiteRatio(imageData, rect) {
  const { data, width, height } = imageData;
  const startX = Math.max(0, Math.floor(rect.x * width));
  const endX = Math.min(width, Math.ceil((rect.x + rect.width) * width));
  const startY = Math.max(0, Math.floor(rect.y * height));
  const endY = Math.min(height, Math.ceil((rect.y + rect.height) * height));
  let whitePixels = 0;
  let totalPixels = 0;
  for (let y = startY; y < endY; y += 2) {
    for (let x = startX; x < endX; x += 2) {
      const offset = pixelOffset(x, y, width);
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
      if (red > 155 && green > 155 && blue > 155 && spread < 58) whitePixels += 1;
      totalPixels += 1;
    }
  }
  return totalPixels ? whitePixels / totalPixels : 0;
}

function heroCornerSharpness(imageData) {
  const { data, width, height } = imageData;
  let edgeTotal = 0;
  let comparisons = 0;
  const luminanceAt = (x, y) => {
    const offset = pixelOffset(x, y, width);
    return (
      data[offset] * 0.299 +
      data[offset + 1] * 0.587 +
      data[offset + 2] * 0.114
    );
  };
  for (const rect of HERO_CARD_RECTS) {
    const startX = Math.max(0, Math.floor((rect.x + rect.width * 0.02) * width));
    const endX = Math.min(
      width - 2,
      Math.ceil((rect.x + rect.width * 0.56) * width),
    );
    const startY = Math.max(0, Math.floor((rect.y + rect.height * 0.01) * height));
    const endY = Math.min(
      height - 2,
      Math.ceil((rect.y + rect.height * 0.68) * height),
    );
    for (let y = startY; y < endY; y += 2) {
      for (let x = startX; x < endX; x += 2) {
        const current = luminanceAt(x, y);
        edgeTotal += Math.abs(current - luminanceAt(x + 2, y));
        edgeTotal += Math.abs(current - luminanceAt(x, y + 2));
        comparisons += 2;
      }
    }
  }
  return comparisons ? edgeTotal / comparisons : 0;
}

function appendCornerFingerprint(target, imageData, rect) {
  const { data, width, height } = imageData;
  const glyphRect = {
    x: rect.x + rect.width * 0.03,
    y: rect.y + rect.height * 0.02,
    width: rect.width * 0.52,
    height: rect.height * 0.72,
  };
  const columns = 6;
  const rows = 10;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const normalizedX = glyphRect.x + glyphRect.width * ((column + 0.5) / columns);
      const normalizedY = glyphRect.y + glyphRect.height * ((row + 0.5) / rows);
      const x = Math.min(width - 1, Math.max(0, Math.floor(normalizedX * width)));
      const y = Math.min(height - 1, Math.max(0, Math.floor(normalizedY * height)));
      const offset = pixelOffset(x, y, width);
      target.push(data[offset], data[offset + 1], data[offset + 2]);
    }
  }
}

function captureRegion(video, region, canvas, outputWidth) {
  const sourceWidth = region.width * video.videoWidth;
  const sourceHeight = region.height * video.videoHeight;
  canvas.width = outputWidth;
  canvas.height = Math.max(48, Math.round(outputWidth * (sourceHeight / sourceWidth)));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    video,
    region.x * video.videoWidth,
    region.y * video.videoHeight,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function inspectReplayFrame(video, regions, heroCanvas, boardCanvas) {
  if (
    !video?.videoWidth ||
    !video?.videoHeight ||
    !validRegion(regions?.hero) ||
    !validRegion(regions?.board)
  ) {
    return null;
  }
  const heroImageData = captureRegion(
    video,
    regions.hero,
    heroCanvas,
    HERO_ANALYSIS_WIDTH,
  );
  const boardImageData = captureRegion(
    video,
    regions.board,
    boardCanvas,
    BOARD_ANALYSIS_WIDTH,
  );
  const heroPresence = HERO_CARD_RECTS.map(
    (rect) => whiteRatio(heroImageData, rect) > 0.16,
  );
  const boardPresence = BOARD_CARD_RECTS.map(
    (rect) => whiteRatio(boardImageData, rect) > 0.16,
  );
  const firstMissingBoardIndex = boardPresence.findIndex((present) => !present);
  const boardCount = firstMissingBoardIndex === -1 ? 5 : firstMissingBoardIndex;
  const boardIsContiguous = boardPresence
    .slice(boardCount)
    .every((present) => present === false);
  const expectedBoardCount = [0, 3, 4, 5].includes(boardCount) ? boardCount : null;
  const heroFingerprint = [];
  const boardFingerprint = [];
  HERO_CARD_RECTS.forEach((rect) =>
    appendCornerFingerprint(heroFingerprint, heroImageData, rect),
  );
  BOARD_CARD_RECTS.forEach((rect) =>
    appendCornerFingerprint(boardFingerprint, boardImageData, rect),
  );
  return {
    heroCanvas,
    boardCanvas,
    heroImageData,
    boardImageData,
    heroSharpness: heroCornerSharpness(heroImageData),
    heroFingerprint,
    boardFingerprint,
    heroVisibleCount: heroPresence.filter(Boolean).length,
    expectedBoardCount,
    eligible:
      heroPresence.every(Boolean) &&
      boardIsContiguous &&
      expectedBoardCount !== null,
  };
}

function sameVisualState(left, right, threshold = CHANGED_FRAME_DIFFERENCE) {
  if (!left || !right || left.expectedBoardCount !== right.expectedBoardCount) return false;
  return (
    frameDifference(left.heroFingerprint, right.heroFingerprint) <= threshold &&
    frameDifference(left.boardFingerprint, right.boardFingerprint) <= threshold
  );
}

function stableVisualState(left, right) {
  if (!left || !right || left.expectedBoardCount !== right.expectedBoardCount) return false;
  return (
    frameDifference(left.heroFingerprint, right.heroFingerprint) <=
      STABLE_FRAME_DIFFERENCE &&
    frameDifference(left.boardFingerprint, right.boardFingerprint) <=
      STABLE_FRAME_DIFFERENCE
  );
}

function changedFromCommitted(committed, sample, newHandArmed) {
  if (!committed) return true;
  if (newHandArmed && sample.expectedBoardCount === 0) return true;
  if (committed.expectedBoardCount !== sample.expectedBoardCount) return true;
  return (
    frameDifference(committed.heroFingerprint, sample.heroFingerprint) >
      HERO_CHANGED_FRAME_DIFFERENCE ||
    frameDifference(committed.boardFingerprint, sample.boardFingerprint) >
      CHANGED_FRAME_DIFFERENCE
  );
}

function visualSignature(sample) {
  return {
    heroFingerprint: [...sample.heroFingerprint],
    boardFingerprint: [...sample.boardFingerprint],
    expectedBoardCount: sample.expectedBoardCount,
  };
}

function drawContained(context, source, bounds) {
  const scale = Math.min(
    bounds.width / source.width,
    bounds.height / source.height,
  );
  const width = source.width * scale;
  const height = source.height * scale;
  const x = bounds.x + (bounds.width - width) / 2;
  const y = bounds.y + (bounds.height - height) / 2;
  context.drawImage(source, x, y, width, height);
}

function drawSourceRegionContained(context, source, sourceRect, bounds) {
  const sourceX = source.width * sourceRect.x;
  const sourceY = source.height * sourceRect.y;
  const sourceWidth = source.width * sourceRect.width;
  const sourceHeight = source.height * sourceRect.height;
  const scale = Math.min(
    bounds.width / sourceWidth,
    bounds.height / sourceHeight,
  );
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const x = bounds.x + (bounds.width - width) / 2;
  const y = bounds.y + (bounds.height - height) / 2;
  context.drawImage(
    source,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
}

function canvasFromImageData(imageData, fallbackCanvas) {
  if (!imageData?.width || !imageData?.height) return fallbackCanvas;
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext("2d").putImageData(imageData, 0, 0);
  return canvas;
}

function buildHeroRecognitionImage(sample) {
  const output = document.createElement("canvas");
  output.width = 800;
  output.height = 520;
  const context = output.getContext("2d");
  context.fillStyle = "#101215";
  context.fillRect(0, 0, output.width, output.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#ffffff";
  context.font = "700 24px Arial, sans-serif";
  context.fillText("HERO CARD 1 - LEFT", 48, 38);
  context.fillText("HERO CARD 2 - RIGHT", 430, 38);
  const heroSource = canvasFromImageData(sample.heroImageData, sample.heroCanvas);
  drawSourceRegionContained(
    context,
    heroSource,
    { x: 0, y: 0, width: 0.44, height: 0.68 },
    { x: 30, y: 52, width: 350, height: 440 },
  );
  drawSourceRegionContained(
    context,
    heroSource,
    { x: 0.42, y: 0, width: 0.46, height: 0.68 },
    { x: 412, y: 52, width: 358, height: 440 },
  );
  return output.toDataURL("image/png");
}

function buildBoardRecognitionImage(sample) {
  const output = document.createElement("canvas");
  output.width = 900;
  output.height = 350;
  const context = output.getContext("2d");
  context.fillStyle = "#101215";
  context.fillRect(0, 0, output.width, output.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#ffffff";
  context.font = "700 24px Arial, sans-serif";
  context.fillText("COMMUNITY BOARD - LEFT TO RIGHT", 30, 34);
  const boardSource = canvasFromImageData(sample.boardImageData, sample.boardCanvas);
  drawContained(context, boardSource, {
    x: 30,
    y: 48,
    width: 840,
    height: 280,
  });
  return output.toDataURL("image/png");
}

function buildRecognitionPayload(sample) {
  return {
    boardImageDataUrl: buildBoardRecognitionImage(sample),
    heroImageDataUrl: buildHeroRecognitionImage(sample),
  };
}

function drawRegionGuide(context, region, width, height, color, label, slots) {
  if (!validRegion(region)) return;
  const x = region.x * width;
  const y = region.y * height;
  const regionWidth = region.width * width;
  const regionHeight = region.height * height;
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 3;
  context.strokeRect(x, y, regionWidth, regionHeight);
  context.font = "700 14px Arial, sans-serif";
  context.fillText(label, x + 4, Math.max(14, y - 5));
  context.globalAlpha = 0.55;
  context.lineWidth = 1;
  for (let index = 1; index < slots; index += 1) {
    const slotX = x + (regionWidth * index) / slots;
    context.beginPath();
    context.moveTo(slotX, y);
    context.lineTo(slotX, y + regionHeight);
    context.stroke();
  }
  context.restore();
}

function drawRegionPreview(video, region, canvas, outputWidth) {
  if (!canvas) return;
  if (!video?.videoWidth || !video?.videoHeight || !validRegion(region)) {
    canvas.width = 1;
    canvas.height = 1;
    return;
  }
  const sourceWidth = region.width * video.videoWidth;
  const sourceHeight = region.height * video.videoHeight;
  const outputHeight = Math.max(
    32,
    Math.round(outputWidth * (sourceHeight / sourceWidth)),
  );
  if (canvas.width !== outputWidth || canvas.height !== outputHeight) {
    canvas.width = outputWidth;
    canvas.height = outputHeight;
  }
  canvas.getContext("2d").drawImage(
    video,
    region.x * video.videoWidth,
    region.y * video.videoHeight,
    sourceWidth,
    sourceHeight,
    0,
    0,
    outputWidth,
    outputHeight,
  );
}

function formatDetection(detection) {
  if (!detection?.recognized) return "No confirmed cards yet";
  const hero = [detection.heroCards?.card1, detection.heroCards?.card2]
    .filter(Boolean)
    .join(" ");
  const board = [
    ...(detection.board?.flop || []),
    detection.board?.turn,
    detection.board?.river,
  ]
    .filter(Boolean)
    .join(" ");
  return board ? `${hero} · ${board}` : hero;
}

export default function ReplayVisionPanel({
  open,
  onClose,
  onCardsDetected,
  onStatusChange,
  suppressCurrentHand = false,
}) {
  const videoRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const heroRegionPreviewRef = useRef(null);
  const boardRegionPreviewRef = useRef(null);
  const heroAnalysisCanvasRef = useRef(document.createElement("canvas"));
  const boardAnalysisCanvasRef = useRef(document.createElement("canvas"));
  const candidateRef = useRef(null);
  const committedSampleRef = useRef(null);
  const committedDetectionRef = useRef(null);
  const lastAttemptRef = useRef({ sample: null, at: 0 });
  const newHandArmedRef = useRef(false);
  const emptyTableSamplesRef = useRef(0);
  const heroVisibleSinceRef = useRef(0);
  const heroSettleBaselineRef = useRef(null);
  const recognitionInFlightRef = useRef(false);
  const statusRef = useRef("idle");
  const onCardsDetectedRef = useRef(onCardsDetected);
  const onStatusChangeRef = useRef(onStatusChange);
  const suppressCurrentHandRef = useRef(suppressCurrentHand);
  const [stream, setStream] = useState(null);
  const [status, setStatus] = useState("idle");
  const [regions, setRegions] = useState(loadSavedRegions);
  const [calibrationDraft, setCalibrationDraft] = useState(null);
  const [calibrationTarget, setCalibrationTarget] = useState(null);
  const [calibrationStart, setCalibrationStart] = useState(null);
  const [message, setMessage] = useState(
    "Share the PokerCraft tab, then mark Hero and board card regions once.",
  );
  const [lastDetection, setLastDetection] = useState(null);

  useEffect(() => {
    onCardsDetectedRef.current = onCardsDetected;
  }, [onCardsDetected]);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    suppressCurrentHandRef.current = suppressCurrentHand;
  }, [suppressCurrentHand]);

  const reportStatus = useCallback((nextStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
    onStatusChangeRef.current?.(nextStatus);
  }, []);

  const stopCapture = useCallback(() => {
    setStream((current) => {
      current?.getTracks().forEach((track) => track.stop());
      return null;
    });
    if (videoRef.current) videoRef.current.srcObject = null;
    candidateRef.current = null;
    committedSampleRef.current = null;
    committedDetectionRef.current = null;
    lastAttemptRef.current = { sample: null, at: 0 };
    newHandArmedRef.current = false;
    emptyTableSamplesRef.current = 0;
    heroVisibleSinceRef.current = 0;
    heroSettleBaselineRef.current = null;
    recognitionInFlightRef.current = false;
    setCalibrationStart(null);
    setCalibrationDraft(null);
    setCalibrationTarget(null);
    setMessage("Replay watching stopped.");
    reportStatus("idle");
  }, [reportStatus]);

  useEffect(() => stopCapture, [stopCapture]);

  const startCapture = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setMessage("This browser does not support tab capture. Use a current Chrome or Edge build.");
      reportStatus("error");
      return;
    }
    reportStatus("starting");
    setMessage("Choose the PokerCraft tab in Chrome's sharing dialog.");
    try {
      const nextStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 6, max: 10 },
        },
        audio: false,
        preferCurrentTab: false,
        selfBrowserSurface: "exclude",
        surfaceSwitching: "include",
      });
      const video = videoRef.current;
      video.srcObject = nextStream;
      await video.play();
      nextStream.getVideoTracks()[0]?.addEventListener("ended", stopCapture, {
        once: true,
      });
      candidateRef.current = null;
      committedSampleRef.current = null;
      committedDetectionRef.current = null;
      newHandArmedRef.current = false;
      emptyTableSamplesRef.current = 0;
      heroVisibleSinceRef.current = 0;
      heroSettleBaselineRef.current = null;
      setStream(nextStream);
      if (regions) {
        setMessage("Watching Hero and community-card regions.");
        reportStatus("watching");
      } else {
        setCalibrationDraft({ hero: null, board: null });
        setCalibrationTarget("hero");
        setMessage("Hero setup: mark both visible white card tops and their upper-left rank/suit corners; exclude the avatar and name plate when possible.");
        reportStatus("calibrating");
      }
    } catch (error) {
      if (error?.name === "NotAllowedError") {
        setMessage("Tab sharing was cancelled or denied.");
        reportStatus("idle");
      } else {
        setMessage("Unable to start replay capture.");
        reportStatus("error");
      }
    }
  }, [regions, reportStatus, stopCapture]);

  const beginCalibration = useCallback(() => {
    setCalibrationStart(null);
    setCalibrationDraft({ hero: null, board: null });
    setCalibrationTarget("hero");
    setMessage("Hero setup: mark both visible white card tops and their upper-left rank/suit corners; exclude the avatar and name plate when possible.");
    reportStatus("calibrating");
  }, [reportStatus]);

  const handlePreviewClick = useCallback(
    (event) => {
      if (statusRef.current !== "calibrating") return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const point = {
        x: clamp((event.clientX - bounds.left) / bounds.width),
        y: clamp((event.clientY - bounds.top) / bounds.height),
      };
      if (!calibrationTarget) return;
      if (!calibrationStart) {
        setCalibrationStart(point);
        setMessage(
          calibrationTarget === "hero"
            ? "Hero setup: now click the opposite corner around both visible white card tops."
            : "Board setup: now click the opposite corner of the full five-card lane.",
        );
        return;
      }
      const nextRegion = boundedRegion(calibrationStart, point);
      if (nextRegion.width < 0.015 || nextRegion.height < 0.015) {
        setCalibrationStart(null);
        setMessage("That card region is too small. Click its two opposite corners again.");
        return;
      }
      setCalibrationStart(null);
      if (calibrationTarget === "hero") {
        setCalibrationDraft({ hero: nextRegion, board: null });
        setCalibrationTarget("board");
        setMessage("Board setup: scrub to a board (five cards if possible), then mark the full five-card lane—not just the visible cards.");
        return;
      }
      const nextRegions = {
        hero: calibrationDraft?.hero,
        board: nextRegion,
      };
      if (!validRegion(nextRegions.hero)) {
        setCalibrationDraft({ hero: null, board: null });
        setCalibrationTarget("hero");
        setMessage("Hero region was lost. Mark both visible white card tops, including each upper-left rank and suit.");
        return;
      }
      storeRegions(nextRegions);
      setRegions(nextRegions);
      setCalibrationDraft(null);
      setCalibrationTarget(null);
      candidateRef.current = null;
      committedSampleRef.current = null;
      committedDetectionRef.current = null;
      newHandArmedRef.current = false;
      emptyTableSamplesRef.current = 0;
      heroVisibleSinceRef.current = 0;
      heroSettleBaselineRef.current = null;
      setMessage("Card regions saved. Watching Hero and community cards.");
      reportStatus("watching");
    },
    [calibrationDraft, calibrationStart, calibrationTarget, reportStatus],
  );

  useEffect(() => {
    if (!open || !stream) return undefined;
    let animationFrame = 0;
    const drawPreview = () => {
      const video = videoRef.current;
      const canvas = previewCanvasRef.current;
      if (video?.videoWidth && canvas) {
        const previewWidth = Math.min(960, video.videoWidth);
        const previewHeight = Math.round(previewWidth * (video.videoHeight / video.videoWidth));
        if (canvas.width !== previewWidth || canvas.height !== previewHeight) {
          canvas.width = previewWidth;
          canvas.height = previewHeight;
        }
        const context = canvas.getContext("2d");
        context.drawImage(video, 0, 0, previewWidth, previewHeight);
        const displayedRegions = calibrationDraft || regions;
        drawRegionGuide(
          context,
          displayedRegions?.board,
          previewWidth,
          previewHeight,
          "#38bdf8",
          "BOARD (5 slots)",
          5,
        );
        drawRegionGuide(
          context,
          displayedRegions?.hero,
          previewWidth,
          previewHeight,
          "#34d399",
          "HERO (2 cards)",
          2,
        );
        drawRegionPreview(
          video,
          displayedRegions?.hero,
          heroRegionPreviewRef.current,
          300,
        );
        drawRegionPreview(
          video,
          displayedRegions?.board,
          boardRegionPreviewRef.current,
          600,
        );
        if (calibrationStart) {
          context.fillStyle = "#fbbf24";
          context.beginPath();
          context.arc(
            calibrationStart.x * previewWidth,
            calibrationStart.y * previewHeight,
            6,
            0,
            Math.PI * 2,
          );
          context.fill();
        }
      }
      animationFrame = requestAnimationFrame(drawPreview);
    };
    drawPreview();
    return () => cancelAnimationFrame(animationFrame);
  }, [open, stream, regions, calibrationDraft, calibrationStart]);

  const recognizeStableFrame = useCallback(
    async (sample, { manualCorrection = false } = {}) => {
      if (recognitionInFlightRef.current) return;
      recognitionInFlightRef.current = true;
      reportStatus("reading");
      setMessage("Reading stable cards…");
      lastAttemptRef.current = {
        sample: visualSignature(sample),
        at: Date.now(),
      };
      try {
        const previousSample = committedSampleRef.current;
        const previousDetection = committedDetectionRef.current;
        const heroVisualDifference = previousSample
          ? frameDifference(previousSample.heroFingerprint, sample.heroFingerprint)
          : 0;
        const newHandDetected = manualCorrection
          ? false
          : sample.expectedBoardCount === 0 &&
            Boolean(previousSample) &&
            (newHandArmedRef.current ||
              previousSample.expectedBoardCount > 0 ||
              heroVisualDifference > HERO_NEW_HAND_FRAME_DIFFERENCE);
        const knownCards = manualCorrection || newHandDetected || !previousDetection
          ? { heroCards: [], boardCards: [] }
          : replayDetectionCards(previousDetection);
        const recognitionPayload = buildRecognitionPayload(sample);
        const result = await requestReplayCardRecognition({
          ...recognitionPayload,
          expectedBoardCount: sample.expectedBoardCount,
          knownHeroCards: knownCards.heroCards,
          knownBoardCards: knownCards.boardCards,
        });
        if (result?.recognized) {
          const continuity = validateReplayDetectionContinuity(
            previousDetection,
            result,
            { newHandDetected, allowCorrection: manualCorrection },
          );
          if (!continuity.valid) {
            setMessage(`Ignored inconsistent read: ${continuity.reason}`);
            return;
          }

          const previousCards = previousDetection
            ? JSON.stringify(replayDetectionCards(previousDetection))
            : null;
          const nextCards = JSON.stringify(replayDetectionCards(result));
          const correctionChangedCards =
            manualCorrection && previousCards !== null && previousCards !== nextCards;
          committedSampleRef.current = visualSignature(sample);
          committedDetectionRef.current = result;
          setLastDetection(result);
          if (sample.expectedBoardCount === 0) {
            newHandArmedRef.current = false;
            emptyTableSamplesRef.current = 0;
          }
          if (!manualCorrection || correctionChangedCards) {
            onCardsDetectedRef.current?.({
              ...result,
              newHandDetected,
              manualCorrection,
            });
          }
          const confidenceLabel = String(result.confidence || "unknown").toLowerCase();
          setMessage(
            manualCorrection
              ? correctionChangedCards
                ? `Rescan corrected Coach: ${formatDetection(result)} (${confidenceLabel} confidence).`
                : `Rescan confirmed: ${formatDetection(result)} (${confidenceLabel} confidence).`
              : `Updated Coach: ${formatDetection(result)} (${confidenceLabel} confidence). Use Rescan cards if anything looks wrong.`,
          );
        } else {
          setMessage(result?.reason || "Cards were not clear enough to update Coach.");
        }
      } catch (error) {
        setMessage(error?.message || "Card recognition failed.");
      } finally {
        recognitionInFlightRef.current = false;
        reportStatus("watching");
      }
    },
    [reportStatus],
  );

  const handleManualRescan = useCallback(() => {
    if (recognitionInFlightRef.current) return;
    const freshSample = inspectReplayFrame(
      videoRef.current,
      regions,
      heroAnalysisCanvasRef.current,
      boardAnalysisCanvasRef.current,
    );
    if (!freshSample?.eligible) {
      setMessage("Rescan needs both Hero cards and a complete visible street in the calibrated regions.");
      return;
    }
    const candidate = candidateRef.current;
    const candidateMatches = sameVisualState(
      candidate?.sample,
      freshSample,
      STABLE_FRAME_DIFFERENCE,
    );
    const rescanSample =
      candidateMatches &&
      Number(candidate?.bestSample?.heroSharpness || 0) >=
        Number(freshSample.heroSharpness || 0)
        ? candidate.bestSample
        : freshSample;
    lastAttemptRef.current = { sample: null, at: 0 };
    recognizeStableFrame(rescanSample, { manualCorrection: true });
  }, [recognizeStableFrame, regions]);

  useEffect(() => {
    if (!stream || !regions) return undefined;
    const interval = window.setInterval(() => {
      if (statusRef.current === "calibrating" || recognitionInFlightRef.current) return;
      const sample = inspectReplayFrame(
        videoRef.current,
        regions,
        heroAnalysisCanvasRef.current,
        boardAnalysisCanvasRef.current,
      );
      const now = Date.now();
      let heroCardsSettled = false;
      if (sample?.heroVisibleCount === 2) {
        if (!heroSettleBaselineRef.current) {
          heroSettleBaselineRef.current = [...sample.heroFingerprint];
          heroVisibleSinceRef.current = now;
        } else if (
          frameDifference(
            heroSettleBaselineRef.current,
            sample.heroFingerprint,
          ) > HERO_NEW_HAND_FRAME_DIFFERENCE
        ) {
          heroSettleBaselineRef.current = [...sample.heroFingerprint];
          heroVisibleSinceRef.current = now;
        }
        heroCardsSettled =
          now - heroVisibleSinceRef.current >= HERO_SETTLE_DELAY_MS;
      } else {
        heroVisibleSinceRef.current = 0;
        heroSettleBaselineRef.current = null;
      }
      if (
        sample &&
        sample.heroVisibleCount === 0 &&
        sample.expectedBoardCount === 0
      ) {
        emptyTableSamplesRef.current += 1;
        if (
          emptyTableSamplesRef.current >= 2 &&
          committedSampleRef.current &&
          !newHandArmedRef.current
        ) {
          newHandArmedRef.current = true;
          setMessage("Hand finished. Waiting for the next stable Hero cards…");
        }
      } else if (sample?.eligible) {
        emptyTableSamplesRef.current = 0;
      }
      if (
        suppressCurrentHandRef.current &&
        sample?.eligible &&
        sample.expectedBoardCount === 0 &&
        committedSampleRef.current &&
        frameDifference(
          committedSampleRef.current.heroFingerprint,
          sample.heroFingerprint,
        ) > HERO_CHANGED_FRAME_DIFFERENCE
      ) {
        newHandArmedRef.current = true;
      }
      if (suppressCurrentHandRef.current && !newHandArmedRef.current) {
        candidateRef.current = null;
        return;
      }
      if (!sample?.eligible) {
        candidateRef.current = null;
        return;
      }
      if (!heroCardsSettled) {
        candidateRef.current = null;
        setMessage("Hero cards detected. Waiting for the deal animation to settle…");
        return;
      }
      const candidate = candidateRef.current;
      const stable = stableVisualState(candidate?.sample, sample);
      candidateRef.current = stable
        ? {
            sample,
            count: candidate.count + 1,
            bestSample:
              Number(candidate.bestSample?.heroSharpness || 0) >=
              Number(sample.heroSharpness || 0)
                ? candidate.bestSample
                : sample,
          }
        : { sample, count: 1, bestSample: sample };
      if (candidateRef.current.count < REQUIRED_STABLE_SAMPLES) return;

      const differsFromCommitted = changedFromCommitted(
        committedSampleRef.current,
        sample,
        newHandArmedRef.current,
      );
      const repeatedRecentAttempt =
        Date.now() - lastAttemptRef.current.at <
          RECOGNITION_RETRY_COOLDOWN_MS &&
        sameVisualState(lastAttemptRef.current.sample, sample);
      if (differsFromCommitted && !repeatedRecentAttempt) {
        recognizeStableFrame(candidateRef.current.bestSample || sample);
      }
    }, SAMPLE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [stream, regions, recognizeStableFrame]);

  return (
    <>
      <video ref={videoRef} muted playsInline className="replay-vision-video" />
      {open ? (
        <div className="modal-backdrop replay-vision-backdrop" onClick={onClose}>
          <section
            className="modal replay-vision-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <h2 className="modal-title">PokerCraft Replay Vision</h2>
                <span className={`replay-vision-status is-${status}`}>{status}</span>
              </div>
              <button type="button" className="link-btn" onClick={onClose}>
                Hide
              </button>
            </header>
            <div className="modal-body replay-vision-body">
              {!stream ? (
                <div className="replay-vision-intro">
                  <p>
                    Coach watches a shared PokerCraft replay and updates Hero, flop,
                    turn, and river cards after they remain stable on screen.
                  </p>
                  <button type="button" onClick={startCapture} disabled={status === "starting"}>
                    {status === "starting" ? "Opening share picker…" : "Share PokerCraft tab"}
                  </button>
                </div>
              ) : (
                <>
                  <canvas
                    ref={previewCanvasRef}
                    className={`replay-vision-preview ${
                      status === "calibrating" ? "is-calibrating" : ""
                    }`}
                    onClick={handlePreviewClick}
                  />
                  <div className="replay-vision-region-previews">
                    <figure>
                      <figcaption>Exact Hero input</figcaption>
                      <canvas ref={heroRegionPreviewRef} />
                    </figure>
                    <figure>
                      <figcaption>Exact board input</figcaption>
                      <canvas ref={boardRegionPreviewRef} />
                    </figure>
                  </div>
                  <div className="replay-vision-actions">
                    <button
                      type="button"
                      className="pill-toggle"
                      onClick={handleManualRescan}
                      disabled={status === "reading" || status === "calibrating"}
                    >
                      {status === "reading" ? "Reading cards…" : "Rescan cards"}
                    </button>
                    <button type="button" className="pill-toggle" onClick={beginCalibration}>
                      Recalibrate card regions
                    </button>
                    <button type="button" className="pill-toggle" onClick={stopCapture}>
                      Stop watching
                    </button>
                  </div>
                </>
              )}
              <p className="replay-vision-message" role="status">
                {message}
              </p>
              {status === "calibrating" ? (
                <p className="replay-vision-privacy">
                  Green should contain both visible Hero card tops and rank/suit corners, with as little avatar or name plate as practical. Blue must
                  span all five possible board-card slots. Resize or zoom PokerCraft
                  however you like before marking them.
                </p>
              ) : null}
              {lastDetection?.recognized ? (
                <div className="replay-vision-result">
                  <strong>Last confirmed</strong>
                  <span>{formatDetection(lastDetection)}</span>
                  <span>{lastDetection.confidence} confidence</span>
                </div>
              ) : null}
              <p className="replay-vision-privacy">
                Only the marked Hero and board regions are sent when the local
                watcher detects a stable card change. Opponent cards are excluded.
              </p>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
