const MIN_DEALER_CONFIDENCE = 0.62;
const MIN_WINNER_MARGIN = 0.08;

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function isDealerYellow(red, green, blue) {
  return red >= 170 && green >= 115 && blue <= 115 &&
    red >= green * 0.9 && red <= green * 1.75 && green >= blue * 1.35;
}

function isDarkGlyph(red, green, blue) {
  return red <= 105 && green <= 105 && blue <= 105;
}

export function scoreDealerPixels(imageData) {
  const width = Number(imageData?.width || 0);
  const height = Number(imageData?.height || 0);
  const data = imageData?.data;
  if (!width || !height || !data?.length) return { confidence: 0, component: null };
  const total = width * height;
  const yellow = new Uint8Array(total);
  const visited = new Uint8Array(total);
  for (let pixel = 0; pixel < total; pixel += 1) {
    const offset = pixel * 4;
    yellow[pixel] = isDealerYellow(data[offset], data[offset + 1], data[offset + 2]) ? 1 : 0;
  }

  let best = null;
  for (let start = 0; start < total; start += 1) {
    if (!yellow[start] || visited[start]) continue;
    const queue = [start];
    visited[start] = 1;
    let area = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const pixel = queue[cursor];
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      area += 1;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (const next of [pixel - 1, pixel + 1, pixel - width, pixel + width]) {
        if (next < 0 || next >= total || visited[next] || !yellow[next]) continue;
        const nextX = next % width;
        if (Math.abs(nextX - x) > 1) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }
    if (area < Math.max(6, total * 0.002)) continue;
    const componentWidth = maxX - minX + 1;
    const componentHeight = maxY - minY + 1;
    const aspect = componentWidth / Math.max(1, componentHeight);
    if (componentWidth < 3 || componentHeight < 3 || aspect < 0.5 || aspect > 1.8) continue;
    const boxArea = componentWidth * componentHeight;
    const fillRatio = area / Math.max(1, boxArea);
    let darkPixels = 0;
    for (let y = minY; y <= maxY; y += 1) {
      let firstYellow = null;
      let lastYellow = null;
      for (let x = minX; x <= maxX; x += 1) {
        if (!yellow[y * width + x]) continue;
        if (firstYellow === null) firstYellow = x;
        lastYellow = x;
      }
      if (firstYellow === null || lastYellow - firstYellow < 2) continue;
      for (let x = firstYellow + 1; x < lastYellow; x += 1) {
        const offset = (y * width + x) * 4;
        if (isDarkGlyph(data[offset], data[offset + 1], data[offset + 2])) darkPixels += 1;
      }
    }
    const areaRatio = area / total;
    const shapeScore = clamp01(1 - Math.abs(aspect - 1) / 0.7);
    const fillScore = clamp01((fillRatio - 0.3) / 0.38);
    const sizeScore = clamp01(areaRatio / 0.035);
    const darkRatio = darkPixels / Math.max(1, boxArea);
    const glyphScore = clamp01(darkRatio / 0.07) * clamp01((0.5 - darkRatio) / 0.2);
    const baseConfidence =
      shapeScore * 0.3 + fillScore * 0.25 + sizeScore * 0.3 + glyphScore * 0.15
    const confidence = Number((baseConfidence * (0.72 + glyphScore * 0.28)).toFixed(3));
    if (!best || confidence > best.confidence) {
      best = {
        confidence,
        areaRatio,
        fillRatio,
        darkRatio,
        bounds: { minX, minY, maxX, maxY },
      };
    }
  }
  return { confidence: best?.confidence || 0, component: best };
}

export function detectDealerButtonFromFrame(frame, regions) {
  if (!frame?.source || !Array.isArray(regions)) return null;
  const { source, capturedAt } = frame;
  const scores = regions.map((region, seat) => {
    const rect = region?.dealer;
    if (!Array.isArray(rect)) return { seat, confidence: 0 };
    const [x, y, width, height] = rect;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * source.width));
    canvas.height = Math.max(1, Math.round(height * source.height));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(source, x * source.width, y * source.height,
      width * source.width, height * source.height, 0, 0, canvas.width, canvas.height);
    const scored = scoreDealerPixels(context.getImageData(0, 0, canvas.width, canvas.height));
    return { seat, confidence: scored.confidence, component: scored.component };
  }).sort((left, right) => right.confidence - left.confidence);
  const best = scores[0] || { seat: null, confidence: 0 };
  const runnerUp = scores[1] || { confidence: 0 };
  const margin = Number((best.confidence - runnerUp.confidence).toFixed(3));
  const accepted = best.confidence >= MIN_DEALER_CONFIDENCE && margin >= MIN_WINNER_MARGIN;
  return {
    capturedAt,
    candidateSeat: accepted ? best.seat : null,
    bestSeat: best.seat,
    confidence: best.confidence,
    margin,
    scores,
    reason: accepted
      ? "Unique dealer-button candidate"
      : best.confidence < MIN_DEALER_CONFIDENCE
        ? "No dealer-button candidate met the confidence threshold"
        : "Dealer-button candidates were ambiguous",
  };
}

export function settleDealerObservation(previous, detection, requiredRepeats = 2) {
  if (!detection || !Number.isInteger(detection.candidateSeat)) {
    return {
      ...(detection || {}),
      candidateSeat: null,
      dealerScreenSeat: null,
      repeats: 0,
      confirmed: false,
    };
  }
  const repeats = previous?.candidateSeat === detection.candidateSeat
    ? Number(previous.repeats || 0) + 1
    : 1;
  const confirmed = repeats >= requiredRepeats;
  return {
    ...detection,
    repeats,
    confirmed,
    dealerScreenSeat: confirmed ? detection.candidateSeat : null,
  };
}
