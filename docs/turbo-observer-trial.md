# Local table tracking

The paid Turbo table observer, its endpoint, usage meter, duplicate timeline and observation log have been removed. Local table tracking is now the sole opponent contribution reader. Existing card/stack recognition is separate and may still incur API usage.

## Controls

Open the vision dialog and share the table. Existing gold bet calibration is preserved. Adjust regions pauses tracking; draw tight rectangles around each number and its BB suffix, cards, exact Fold/All-in/Check label, or opponent stack text. Screen seats run clockwise from Hero at the bottom, with V1 lower left. Version 2 saved layouts are migrated with derived action/stack regions and saved under `pcc_turbo_regions_v3`.

Start tracking starts one local OCR worker. Stop tracking terminates it and clears temporary diagnostic images. Closing the dialog hides the setup panel while the reader continues in the background. The current hand summary is shown in the Coach page, and tracking pauses when Coach marks the hand complete. The next detected new hand resets the ledger and resumes if tracking was left enabled.

Accepted OCR amounts feed one current-hand ledger. Each seat has a contribution, occupancy, card presence, status, optional stack, and last-observed timestamp. Unknown readings never erase commitments or imply folds/checks. Repeated values do not create duplicate events. Increases produce structured action candidates. Simultaneous changes do not establish action order. Decreases pause action interpretation until a street/hand reset. Exact labels and stack zeroes need two matching reads; card disappearance remains only a folded candidate unless separately confirmed. Manual Confirm fold and Confirm all-in controls are available as explicit evidence overrides.

When a villain aggression candidate is followed by known active seats matching and folded/all-in seats being skipped, the ledger marks Hero to act and exposes the staged action in the Coach decision row. Two matching card-absence samples may stand in for an exact fold only for this staging decision; the CTA is labelled `review fold?`, and the seat remains `fold?`. A genuinely unknown seat still blocks it. A staged payload is bound to hand, street, Hero seat, and table size, becomes visibly stale when context changes, and is never auto-applied. Applying it records pot, call amount, aggressor, callers, and available stack context in the Coach machine.

Before any voluntary preflop action, optionally confirm starting blinds and select the actual SB/BB screen seats. This seeds standard 0.5/1 BB blinds for candidate limp/open/3-bet numbering and clears existing candidates. Do not confirm after action has begun. Without an opening baseline, raise numbering remains unknown.

Successful existing card reads supply street and new-hand context without an extra API request. Use New hand or the Street selector if this misses a transition or card recognition is disabled. Street changes carry the prior visible pot while resetting street commitments; new hands replace all previous-hand state and events. At most 100 current-hand events are retained. The local trial currently pauses outside 8-max.

## Diagnostics and retention

Debug crop capture is off by default. Normal tracking retains only current-hand state and numeric repeat-validation state; raw crops are transient processing inputs, not a read history.

Enable Capture debug crops only when troubleshooting. It shows dedicated bet and stack crop columns with original/processed images, OCR text, confidence, repeat count, acceptance, and rejection reason. The latest stack diagnostic remains visible between the every-other-batch stack scans. Retention is at most eight batches, with batches older than ten seconds pruned every second. Stop, reset, context transitions, and disabling debug clear this buffer. Export debug reads downloads the buffer explicitly; nothing is uploaded. There is no automatic paid fallback or indefinite log.

## Local OCR

OCR means optical character recognition. Tesseract.js reads the gold crops in a browser worker, with a first-use download of engine/language assets. Images stay in the browser. White lettering is isolated, and a geometric gap separates the amount from the suffix when possible. The amount uses single-line recognition; the suffix uses raw-line recognition. No digit-to-letter substitutions or character whitelist are used.

Acceptance requires number + BB, confidence at least 75%, and two consecutive matching reads. Stack reads use a dedicated cyan/blue text isolator for PokerCraft stack labels, are enabled independently by default, and run every other scan. They target only non-folded opponents with a positive cumulative contribution in the current hand—blinds, limpers, callers, bettors, or raisers—and that participation survives street changes. Accepted participating values appear beside the seat, and the current aggressor's value feeds the Coach handoff. Exact action-label reads remain a separate opt-in and use the same confidence/repeat gate. A zero stack plus a positive commitment can confirm all-in. Confidence and repeats are filters, not proof of correctness. Bet, card, label, and stack crops are created from one captured frame before OCR so asynchronous recognition cannot mix moments. The retained fixtures reproduce actual failures without table/player identity.

Run `npm.cmd test` from the frontend directory. Optional actual-engine regression: `node scripts/check-local-ocr-crops.mjs` (may download language data on first use).
