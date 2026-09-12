import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { validateLocalBet, settleLocalBet, validateLocalActionLabel, settleLocalActionLabel, isolateBetText, isolateStackText, isolateTotalPotText, splitBetGlyphs, validateSplitBet, validateLocalTotalPot, settleLocalTotalPot } from "../src/vision/localBetOcr.js";
test("local amounts reject bounty text, bare digits, ambiguity and low confidence", () => {
  for (const text of ["", "$2.06", "$2.06 BB", "2.06", "2 B", "2 BB 3 BB", "2,5 BB", "2.5 B8", "-2 BB"])
    assert.equal(validateLocalBet(text, 95).amountBB, null, text);
  assert.equal(validateLocalBet("2.5 BB", 74).amountBB, null);
  assert.equal(validateLocalBet("2.5 BB", 90).amountBB, 2.5);
});
test("two matching reads required and an unknown read invalidates acceptance", () => {
  const reading = { text: "2.5 BB", confidence: 90 };
  const first = settleLocalBet(null, reading);
  assert.equal(first.amountBB, null);
  const second = settleLocalBet(first, reading);
  assert.equal(second.amountBB, 2.5);
  const unknown = settleLocalBet(second, { text: "", confidence: 0 });
  assert.equal(unknown.amountBB, null);
  assert.equal(settleLocalBet(unknown, reading).amountBB, null);
  assert.equal(settleLocalBet(second, { text: "9 BB", confidence: 95 }).amountBB, null);
});

test("Total Pot accepts the complete table label after two matching reads", () => {
  assert.equal(validateLocalTotalPot("Total Pot : 14.1 BB", 92).amountBB, 14.1);
  assert.equal(validateLocalTotalPot("14.1 BB", 92).amountBB, 14.1);
  for (const text of ["Total Pot", "$14.1", "Pot 14.1 BB", "14.1 B8"])
    assert.equal(validateLocalTotalPot(text, 95).amountBB, null, text);
  const first = settleLocalTotalPot(null, { text: "Total Pot: 14.1 BB", confidence: 92 });
  assert.equal(first.amountBB, null);
  assert.equal(
    settleLocalTotalPot(first, { text: "Total Pot: 14.1 BB", confidence: 92 }).amountBB,
    14.1,
  );
});

test("only exact high-confidence Fold and All-in labels become repeat-validated evidence", () => {
  for (const text of ["", "Call", "Fold 2 BB", "All"])
    assert.equal(validateLocalActionLabel(text, 95).actionLabel, null);
  assert.equal(validateLocalActionLabel("Fold", 74).actionLabel, null);
  const first = settleLocalActionLabel(null, { text: "Fold", confidence: 95 });
  assert.equal(first.actionLabel, null);
  assert.equal(settleLocalActionLabel(first, { text: "Fold", confidence: 95 }).actionLabel, "fold");
  const allIn = settleLocalActionLabel(null, { text: "All-In", confidence: 95 });
  assert.equal(settleLocalActionLabel(allIn, { text: "All-In", confidence: 95 }).actionLabel, "all-in");
  const check = settleLocalActionLabel(null, { text: "Check", confidence: 95 });
  assert.equal(settleLocalActionLabel(check, { text: "Check", confidence: 95 }).actionLabel, "check");
});

test("text isolation removes green felt and selects lettering below chips", () => {
  const width = 80, height = 60;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i=0;i<data.length;i+=4) { data[i]=30; data[i+1]=100; data[i+2]=30; data[i+3]=255; }
  assert.equal(isolateBetText({data,width,height}), null);
  const paint = (left, top, w, h) => { for(let y=top;y<top+h;y++) for(let x=left;x<left+w;x++) {
    const i=(y*width+x)*4; data[i]=data[i+1]=data[i+2]=220;
  }};
  paint(30, 5, 15, 12); // chip reflections
  paint(10, 35, 55, 10); // text below chips
  const band = isolateBetText({data,width,height});
  assert.equal(band.top,35); assert.equal(band.bottom,44);
  assert.equal(band.left,10); assert.equal(band.right,64);
});

test("stack isolation preserves cyan PokerCraft stack lettering", () => {
  const width = 80, height = 30;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 18; data[i + 1] = 22; data[i + 2] = 24; data[i + 3] = 255;
  }
  for (let y = 8; y < 20; y++) for (let x = 12; x < 68; x++) {
    const i = (y * width + x) * 4;
    data[i] = 66; data[i + 1] = 151; data[i + 2] = 192;
  }
  assert.equal(isolateBetText({ data, width, height }), null);
  const band = isolateStackText({ data, width, height });
  assert.deepEqual(
    { left: band.left, right: band.right, top: band.top, bottom: band.bottom },
    { left: 12, right: 67, top: 8, bottom: 19 },
  );
});

test("Total Pot isolation preserves amber table lettering", () => {
  const width = 90, height = 30;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 35; data[i + 1] = 75; data[i + 2] = 35; data[i + 3] = 255;
  }
  for (let y = 8; y < 21; y++) for (let x = 10; x < 80; x++) {
    const i = (y * width + x) * 4;
    data[i] = 240; data[i + 1] = 185; data[i + 2] = 35;
  }
  assert.equal(isolateBetText({ data, width, height }), null);
  const band = isolateTotalPotText({ data, width, height });
  assert.deepEqual(
    { left: band.left, right: band.right, top: band.top, bottom: band.bottom },
    { left: 10, right: 79, top: 8, bottom: 20 },
  );
});

test("real exported 1.8 BB crop separates the decimal amount from suffix", () => {
  const rows = JSON.parse(fs.readFileSync(new URL("./fixtures/local-bet-ocr/1-8-bb.mask.json", import.meta.url)));
  const data = new Uint8ClampedArray(rows.length * rows[0].length * 4).fill(255);
  rows.forEach((row,y) => [...row].forEach((pixel,x) => { if(pixel === "1") { const i=(y*row.length+x)*4; data[i]=data[i+1]=data[i+2]=0; } }));
  const split = splitBetGlyphs({ data, width: rows[0].length, height: rows.length });
  assert.deepEqual(split.amount, {left:12,right:73,top:12,bottom:53});
  assert.deepEqual(split.suffix, {left:92,right:144,top:12,bottom:53});
  assert.equal(validateSplitBet("1.8", "BB", 93, 95).amountBB, 1.8);
  assert.equal(validateSplitBet("1.8", "88", 99, 99).amountBB, null);
  assert.equal(validateSplitBet("1.8", "B8", 99, 99).amountBB, null);
  assert.equal(validateSplitBet("1.8", "BB", 93, 50).amountBB, null);
});
