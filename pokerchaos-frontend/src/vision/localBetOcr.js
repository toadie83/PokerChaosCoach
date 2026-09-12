export function validateLocalBet(text, confidence) {
  const raw = typeof text === "string" ? text.trim() : "";
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*BB$/i);
  if (!match) return { amountBB: null, reason: "Needs exactly a number followed by BB" };
  if (!Number.isFinite(confidence) || confidence < 75) return { amountBB: null, reason: "Text confidence below 75%" };
  const amountBB = Number(match[1]);
  if (!Number.isFinite(amountBB) || amountBB > 1000000) return { amountBB: null, reason: "Amount out of range" };
  return { amountBB, reason: "Number + BB recognised; awaiting repeat" };
}

export function settleLocalBet(previous, reading) {
  const checked = validateLocalBet(reading.text, reading.confidence);
  const repeats = checked.amountBB !== null && previous?.candidateBB === checked.amountBB ? (previous.repeats || 0) + 1 : 1;
  return { ...reading, candidateBB: checked.amountBB, repeats,
    amountBB: checked.amountBB !== null && repeats >= 2 ? checked.amountBB : null,
    reason: checked.amountBB !== null && repeats >= 2 ? "Accepted after two matching reads" : checked.reason,
  };
}

export function validateLocalTotalPot(text, confidence) {
  const raw = typeof text === "string" ? text.trim().replace(/\s+/g, " ") : "";
  const match = raw.match(/^(?:TOTAL\s*POT\s*:?\s*)?(\d+(?:\.\d+)?)\s*BB$/i);
  if (!match) {
    return {
      amountBB: null,
      reason: "Needs the complete Total Pot label or a number followed by BB",
    };
  }
  if (!Number.isFinite(confidence) || confidence < 75) {
    return { amountBB: null, reason: "Total-pot confidence below 75%" };
  }
  const amountBB = Number(match[1]);
  if (!Number.isFinite(amountBB) || amountBB <= 0 || amountBB > 1000000) {
    return { amountBB: null, reason: "Total-pot amount out of range" };
  }
  return { amountBB, reason: "Total Pot recognised; awaiting repeat" };
}

export function settleLocalTotalPot(previous, reading) {
  const checked = validateLocalTotalPot(reading.text, reading.confidence);
  const repeats = checked.amountBB !== null && previous?.candidateBB === checked.amountBB
    ? (previous.repeats || 0) + 1
    : 1;
  return {
    ...reading,
    candidateBB: checked.amountBB,
    repeats,
    amountBB: checked.amountBB !== null && repeats >= 2
      ? checked.amountBB
      : null,
    reason: checked.amountBB !== null && repeats >= 2
      ? "Total Pot accepted after two matching reads"
      : checked.reason,
  };
}

export function validateLocalActionLabel(text, confidence) {
  const raw = typeof text === "string" ? text.trim().replace(/\s+/g, " ") : "";
  if (!Number.isFinite(confidence) || confidence < 75) {
    return { actionLabel: null, reason: "Action-label confidence below 75%" };
  }
  if (/^fold(?:ed)?$/i.test(raw)) {
    return { actionLabel: "fold", reason: "Fold label recognised; awaiting repeat" };
  }
  if (/^all[ -]?in$/i.test(raw)) {
    return { actionLabel: "all-in", reason: "All-in label recognised; awaiting repeat" };
  }
  if (/^check(?:ed)?$/i.test(raw)) {
    return { actionLabel: "check", reason: "Check label recognised; awaiting repeat" };
  }
  return { actionLabel: null, reason: "No exact Fold, All-in or Check label" };
}

export function settleLocalActionLabel(previous, reading) {
  const checked = validateLocalActionLabel(reading.text, reading.confidence);
  const repeats = checked.actionLabel && previous?.candidateLabel === checked.actionLabel
    ? (previous.repeats || 0) + 1
    : 1;
  return {
    ...reading,
    candidateLabel: checked.actionLabel,
    repeats,
    actionLabel: checked.actionLabel && repeats >= 2 ? checked.actionLabel : null,
    reason: checked.actionLabel && repeats >= 2
      ? "Action label accepted after two matching reads"
      : checked.reason,
  };
}

// Split at a real blank gap before the final two full-height glyphs. This is
// geometry only: it does not declare either glyph a B or replace any digits.
export function splitBetGlyphs({ data, width, height }) {
  const groups = [];
  let group = null;
  for (let x = 0; x <= width; x++) {
    const ys = [];
    if (x < width) for (let y = 0; y < height; y++) if (data[(y * width + x) * 4] < 128) ys.push(y);
    if (ys.length) {
      if (!group) group = { left: x, right: x, top: height, bottom: 0 };
      group.right = x; group.top = Math.min(group.top, ...ys); group.bottom = Math.max(group.bottom, ...ys);
    } else if (group) { groups.push(group); group = null; }
  }
  if (groups.length < 3) return null;
  const a = groups.at(-2), b = groups.at(-1), before = groups.at(-3);
  const tallest = Math.max(...groups.map(g => g.bottom - g.top + 1));
  const gap = a.left - before.right - 1;
  const suffixGap = b.left - a.right - 1;
  if (gap < Math.max(3, tallest * 0.2, suffixGap * 1.5)) return null;
  if ([a, b].some(g => g.bottom - g.top + 1 < tallest * 0.7 || g.right - g.left + 1 < tallest * 0.25)) return null;
  return { amount: { left: groups[0].left, right: before.right, top: Math.min(...groups.slice(0, -2).map(g => g.top)), bottom: Math.max(...groups.slice(0, -2).map(g => g.bottom)) },
    suffix: { left: a.left, right: b.right, top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom) } };
}

export function validateSplitBet(amountText, suffixText, amountConfidence, suffixConfidence) {
  const amount = String(amountText || "").trim();
  const suffix = String(suffixText || "").trim();
  const confidence = Math.min(amountConfidence || 0, suffixConfidence || 0);
  const text = `${amount} ${suffix}`.trim();
  // Keep exact OCR characters. In particular, 88 and B8 are not BB.
  return { text, confidence, ...validateLocalBet(text, confidence) };
}

function isolateTextBand({ data, width, height }, matchesPixel) {
  const mask = new Uint8Array(width * height);
  const rows = Array(height).fill(0);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (matchesPixel(data[i], data[i + 1], data[i + 2])) {
      mask[y * width + x] = 1;
      rows[y]++;
    }
  }
  const bands = [];
  let start = null; let last = 0;
  for (let y = 0; y <= height + 2; y++) {
    if (y < height && rows[y] >= 2) {
      if (start === null) start = y;
      last = y;
    } else if (start !== null && y - last > 2) {
      if (last - start >= 3) bands.push({ top: start, bottom: last });
      start = null;
    }
  }
  const band = bands.at(-1);
  if (!band) return null;
  let left = width; let right = -1;
  for (let y = band.top; y <= band.bottom; y++) for (let x = 0; x < width; x++) {
    if (mask[y * width + x]) { left = Math.min(left, x); right = Math.max(right, x); }
  }
  if (right - left < 5) return null;
  return { mask, left, right, ...band };
}

// White/grey lettering on coloured felt. Choose the lowest substantial text
// band so chip graphics above the amount are excluded. No glyph substitutions.
export function isolateBetText(pixels) {
  return isolateTextBand(pixels, (red, green, blue) => {
    const min = Math.min(red, green, blue);
    const max = Math.max(red, green, blue);
    return min >= 145 && max - min <= 65;
  });
}

// GG/PokerCraft stack labels are cyan-blue rather than the neutral white used
// for felt contributions. Preserve both cyan cores and their anti-aliased
// edges while excluding the dark panel and amber/brown trim.
export function isolateStackText(pixels) {
  return isolateTextBand(pixels, (red, green, blue) => {
    const min = Math.min(red, green, blue);
    const max = Math.max(red, green, blue);
    const neutral = min >= 145 && max - min <= 65;
    const cyan = blue >= 90 && green >= 70 && blue - red >= 25 && green - red >= 15 && blue >= green * 0.95;
    return neutral || cyan;
  });
}

// The Total Pot label is normally amber/yellow, with neutral anti-aliased
// edges. Its dedicated crop lets us retain that colour without admitting
// unrelated table graphics from the per-seat bet regions.
export function isolateTotalPotText(pixels) {
  return isolateTextBand(pixels, (red, green, blue) => {
    const min = Math.min(red, green, blue);
    const max = Math.max(red, green, blue);
    const neutral = min >= 145 && max - min <= 65;
    const amber = red >= 145 && green >= 95 && red >= green && green >= blue * 1.2;
    return neutral || amber;
  });
}

function prepareIsolatedText(canvas, isolateText, { splitSuffix = true } = {}) {
  const pixels = canvas.getContext("2d", { willReadFrequently: true })
    .getImageData(0, 0, canvas.width, canvas.height);
  const band = isolateText(pixels);
  const output = document.createElement("canvas");
  output.width = band ? band.right - band.left + 25 : 80;
  output.height = band ? band.bottom - band.top + 25 : 50;
  const ctx = output.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "white"; ctx.fillRect(0, 0, output.width, output.height);
  if (band) {
    const image = ctx.getImageData(0, 0, output.width, output.height);
    for (let y = band.top; y <= band.bottom; y++) for (let x = band.left; x <= band.right; x++) {
      if (!band.mask[y * canvas.width + x]) continue;
      const i = ((y - band.top + 12) * output.width + x - band.left + 12) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 0;
    }
    ctx.putImageData(image, 0, 0);
  }
  const split = band && splitSuffix
    ? splitBetGlyphs(ctx.getImageData(0, 0, output.width, output.height))
    : null;
  const cropPart = rect => {
    const crop = document.createElement("canvas");
    const w = rect.right - rect.left + 1, h = rect.bottom - rect.top + 1;
    crop.width = w + 24; crop.height = h + 24;
    const c = crop.getContext("2d"); c.fillStyle = "white"; c.fillRect(0, 0, crop.width, crop.height);
    c.drawImage(output, rect.left, rect.top, w, h, 12, 12, w, h);
    return crop.toDataURL("image/png");
  };
  return { processedImage: output.toDataURL("image/png"), textBandFound: Boolean(band),
    amountImage: split ? cropPart(split.amount) : null, suffixImage: split ? cropPart(split.suffix) : null };
}

export function prepareBetText(canvas) {
  return prepareIsolatedText(canvas, isolateBetText);
}

export function prepareStackText(canvas) {
  return prepareIsolatedText(canvas, isolateStackText);
}

export function prepareTotalPotText(canvas) {
  return prepareIsolatedText(canvas, isolateTotalPotText, { splitSuffix: false });
}

// Capture once so amount, status and optional stack/action evidence describe
// one table moment even though local OCR completes later.
export function captureTableFrame(video) {
  if (!video?.videoWidth || video.readyState < 2) return null;
  const source = document.createElement("canvas");
  source.width = video.videoWidth; source.height = video.videoHeight;
  source.getContext("2d").drawImage(video, 0, 0);
  return { source, capturedAt: Date.now() };
}

function captureTextCropsFromFrame(frame, regions, regionType, scale = 3, prepareCrop = prepareBetText) {
  if (!frame?.source) return null;
  const { source, capturedAt } = frame;
  return regions.map((region, seat) => {
    const rect = region?.[regionType];
    if (!Array.isArray(rect)) return null;
    const [x, y, width, height] = rect;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * source.width * scale));
    canvas.height = Math.max(1, Math.round(height * source.height * scale));
    canvas.getContext("2d", { willReadFrequently: true }).drawImage(source, x * source.width, y * source.height,
      width * source.width, height * source.height, 0, 0, canvas.width, canvas.height);
    return { seat, capturedAt, image: canvas.toDataURL("image/png"), ...prepareCrop(canvas) };
  }).filter(Boolean);
}

// Read from the original video, never the annotated calibration preview.
export function captureBetCrops(video, regions, frame = null) {
  const snapshot = frame || captureTableFrame(video);
  return snapshot ? captureTextCropsFromFrame(snapshot, regions, "bet", 3) : null;
}

export function captureStackCrops(video, regions, frame = null) {
  const snapshot = frame || captureTableFrame(video);
  return snapshot ? captureTextCropsFromFrame(snapshot, regions, "stack", 3, prepareStackText) : null;
}

export function captureActionCrops(video, regions, frame = null) {
  const snapshot = frame || captureTableFrame(video);
  return snapshot ? captureTextCropsFromFrame(snapshot, regions, "action", 3) : null;
}

export function captureTotalPotCrop(video, regions, frame = null) {
  const snapshot = frame || captureTableFrame(video);
  if (!snapshot || !Array.isArray(regions?.[0]?.totalPot)) return null;
  return captureTextCropsFromFrame(
    snapshot,
    [regions[0]],
    "totalPot",
    3,
    prepareTotalPotText,
  )?.[0] || null;
}

// Face-down cards are a visual state signal, not OCR. PokerCraft's card backs
// contain a stable red/white block while folded seats reveal the avatar/felt.
export function captureCardStates(video, regions, frame = null) {
  const snapshot = frame || captureTableFrame(video);
  if (!snapshot) return null;
  const { source, capturedAt } = snapshot;
  return regions.map((region, seat) => {
    if (seat === 0) return null;
    const [x, y, width, height] = region.cards;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * source.width));
    canvas.height = Math.max(1, Math.round(height * source.height));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(source, x * source.width, y * source.height,
      width * source.width, height * source.height, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let cardPixels = 0;
    let vividPixels = 0;
    let edgeLightPixels = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const red = pixels[i], green = pixels[i + 1], blue = pixels[i + 2];
      if (red > 95 && red > green * 1.18 && red > blue * 1.08) cardPixels++;
      if (Math.max(red, green, blue) - Math.min(red, green, blue) > 45) vividPixels++;
      const pixel = i / 4;
      const px = pixel % canvas.width, py = Math.floor(pixel / canvas.width);
      if ((px < canvas.width * 0.2 || px > canvas.width * 0.8 || py < canvas.height * 0.2 || py > canvas.height * 0.8) && red > 165 && green > 165 && blue > 165 && Math.max(red, green, blue) - Math.min(red, green, blue) < 45) edgeLightPixels++;
    }
    const total = Math.max(1, pixels.length / 4);
    const redRatio = cardPixels / total;
    const vividRatio = vividPixels / total;
    const edgeLightRatio = edgeLightPixels / total;
    return {
      seat,
      capturedAt,
      cardsPresent: redRatio >= 0.08 && vividRatio >= 0.18 && edgeLightRatio >= 0.025,
      confidence: Math.min(1, Math.max(redRatio / 0.16, vividRatio / 0.36, edgeLightRatio / 0.08)),
      redRatio,
      vividRatio,
      edgeLightRatio,
    };
  }).filter(Boolean);
}
