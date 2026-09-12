# AI handoff: local table tracker and Coach integration

## Project objective

The original product idea is a Coach that understands a live PokerCraft/GG Poker table from Replay Vision and reduces manual decision-state entry.

The intended flow is:

1. Replay Vision shares the table; a local dealer watcher anchors Hero's seat before one stable-frame request commits Hero cards, board, street, Hero stack, and labelled opening opponent-stack observations.
2. Local table tracking reads opponent/Hero felt contributions in BB and opponent card presence.
3. Hero's known seat anchors the clockwise V-seat map: Hero is screen seat 0, V1 is the next seat clockwise, and so on.
4. The tracker builds a current-hand ledger and action timeline.
5. When action has returned to Hero, Coach offers a staged Use live reads action in the decision row.
6. Coach does not request a decision merely because an opponent raises. Existing manual action pills remain overrides.
7. When the hand is complete, local tracking pauses until Replay Vision detects a new hand.

At a hand boundary, local OCR is explicitly gated. Empty-table/new-deal evidence closes the gate and clears staged live reads before card recognition starts. Replay Vision then sends the card, Hero-stack, and seven individually labelled opponent-stack crops from the same three-frame-stable sample. It commits the new Hero cards, final Hero seat (including automatic seat rotation), and accepted opening stack observations together. Only after that commit may the local reader resume, applying preflop evidence from each shared frame in this order: bets, opponent card/fold state, then exact action labels when enabled. Opponent-stack OCR remains disabled until the flop. Late OCR results from the prior gate epoch are discarded.

The dealer watcher runs locally while that OCR gate is closed. It searches eight small calibrated regions for a yellow circular puck with a dark glyph, requires one unambiguous winning region on two consecutive 300 ms samples, and converts the confirmed screen seat into Hero's full-ring position. The dealer-derived position overrides expected seat rotation in the same state update that commits Hero's cards. If the button is not reliable, the user can explicitly use the expected seat for that hand; there is no silent fallback.

This is a private technology trial on a separate branch. Do not broaden the scope into a public product or change the existing card-recognition flow without evidence.

## Current implementation status

The local-reader, current-hand ledger, conservative action-order model, and typed Coach handoff are implemented as a private 8-max trial. Live reads are always staged for explicit user application; they never submit a Coach action automatically.

### Milestone 1: hardened local reader

- Tesseract.js runs locally in a browser worker.
- Bet OCR accepts only an exact number followed by BB.
- Confidence must be at least 75%.
- Two matching reads are required before an amount is accepted.
- Each seat is scanned, including Hero.
- A malformed seat crop or failed individual OCR read no longer stops the whole reader.
- Card-status capture failure degrades to unavailable status instead of stopping amount OCR.
- Debug crops are off by default and bounded to eight batches/ten seconds.
- No paid Turbo table-observer endpoint remains.

### Milestone 2: authoritative current-hand ledger

localHandTracker.js keeps:

- committed: per-screen-seat cumulative contribution in BB;
- seats: per-seat occupied, status, cardsPresent, committedBB, stackBehindBB, reconstructed startingStackBB, stack confidence, rejection diagnostics, and observation timestamps;
- seatStatus: compatibility map;
- cardEvidence: repeat-validation state;
- events: bounded current-hand event list;
- highest, raises, baseline, uncertain, pendingReset, and lastAt.

Current status values include active, folded_candidate, folded, all_in, and unknown. A missing card-back signal only creates a candidate; confirmed fold/all-in requires two matching exact action-label reads, zero-stack evidence for all-in, or a manual confirmation. Two matching card-absence samples may satisfy turn-order only for a visibly provisional, manually applied CTA; they do not upgrade the seat to a confirmed fold. Hero's card state is not read by the opponent card reader; Replay Vision remains the source of Hero cards. The unified player tiles provide a direct ledger correction for active/folded opponents: clicking an active or provisional-fold tile confirms a fold, while clicking a folded tile restores it to active. The correction clears stale card/status evidence, is recorded in the action timeline, and immediately participates in Hero-turn evaluation.

### Milestone 3: action order and Hero-to-act

summaryLocalHand derives highest contribution, Hero contribution, amount to call, contributors, latest aggressor, active seats, folded candidates, heroToAct, and seats still waiting.

After the latest villain aggression, every seat between that aggressor and Hero must have matched, checked where appropriate, gone all-in, or left repeated card-absence evidence. Repeated card absence permits a provisional Hero-to-act CTA labelled `review fold?`; exact/manual confirmation removes that warning. A genuinely unknown seat, contribution reset, or unresolved simultaneous change still prevents heroToAct.

Clear unopened, limp, open, open-plus-call, 3-bet/4-bet, postflop bet/raise, first-to-act, and checked-to-Hero states are staged for Coach. They are not applied automatically. The Use live reads pill is only enabled once Hero is considered to be acting. Hero aggression is also staged so it can be recorded explicitly.

### Typed Coach handoff

localCoachHandoff.js binds every staged observation to tracker hand ID, street, Hero seat, and table size. The payload includes the observed pot ledger, amount to call, aggressor, callers, known player count, and available effective-stack values. The Coach machine records this as a live tracker receipt and reconciles the observed pot after applying its normal action transition. A changed hand/street/seat/table identity invalidates the staged action, and an applied tracker event is not staged a second time.

Bet, card-status, action-label, and any postflop stack crops are derived synchronously from one captured video frame before OCR begins. This prevents delayed OCR jobs from mixing evidence from different moments. Stack OCR has its own cyan/blue text isolator rather than using the neutral-white bet isolator. It is independently enabled by default but is never scheduled preflop; from the flop onward it runs every other scan and prioritises non-folded villains who contributed chips, while also filling any stack missed by Vision. Reads that increase implausibly or do not reconcile with the opening stack and recorded bets are rejected and logged rather than replacing trusted state. The cumulative participation ledger survives street changes, so blinds, limpers, callers, and aggressors remain eligible postflop even when the current-street boxes are empty. Dedicated debug columns expose the crop, processed input, OCR text, confidence, repeats, acceptance, and failure reason. Exact action-label OCR is a separate optional control.

Replay Vision owns the opening snapshot in its existing start-of-hand request. A third composite contains seven enlarged crops labelled by screen seat V1-V7; the strict response returns one nullable value and independent confidence per seat. Medium/high values seed the local ledger after blinds are established. Low, missing, duplicate, or malformed seat results remain explicitly unknown. During preflop, current stack behind is calculated deterministically as the Vision opening stack minus cumulative committed chips; no opponent-stack OCR is requested and no stack refresh can delay a decision. From the flop onward, repeat-validated local OCR may confirm the ledger or fill a missing opening value, but a conflicting read cannot silently rewrite a Vision opening stack.

The deterministic strategic-table layer now derives per-opponent effective stack, Hero coverage margin and ratio, stack band, validated preflop and postflop players still to act, the wider set of players who can respond to Hero aggression, reshove-capable stacks, retaliating stacks, starting table-stack rank, pot odds, current stack-to-pot ratio, post-call SPR, evidence confidence, and explicit limitations. `Use live reads` is gated by confirmed Hero turn order, not by stack OCR. Known opening stacks are immediately reduced by the contribution ledger; missing values remain unknown and lower strategic confidence without freezing the CTA. Postflop OCR reconciliation is diagnostic and corrective only for stacks Vision did not establish. This object is captured in the manually applied live-read receipt and passed to Range Professor. Range Professor is instructed to preserve the baseline range first, apply stack/position adjustments second, and make opponent-specific exploit adjustments only from supplied evidence. A selected bubble/endgame stage is marked `stage_only_unquantified`; it is never represented as calculated ICM without payouts and field state.

The Coach presents this ledger through one unified table-state surface rather than separate Seat, Opponent, Stack, Players, Postflop, live-stack, and status rows. Each tile maps the logical poker position to its screen seat, current derived stack, contribution, active/fold/all-in state, aggressor role, and response eligibility. Clicking a known active/folded villain toggles that status to correct a missed read; primary-opponent selection and less common overrides remain in the compact Manual overrides disclosure. Completing or folding a hand clears actionable live-read staging but retains the last player snapshot until Replay Vision commits the next hand.

The former Coach HUD header trigger is now a `Rescan cards` recovery control. It operates while Replay Vision is watching without reopening the modal. On a complete preflop frame it deliberately starts a fresh Coach hand even when the recognized cards and available stacks happen to match the previous result, rereads Hero and opening stacks, resets the local action ledger, and attaches the latest confirmed dealer-button observation when available. On a postflop frame it behaves as a card correction and does not create a new hand. The original modal rescan remains a same-hand correction unless the automatic watcher has independently confirmed a hand boundary.

The Local table tracking panel exposes only its operational state, Start/Stop tracking, and Adjust regions during normal use. Raw per-seat reads, current-hand recovery controls, OCR timings, reader switches, dealer diagnostics, manual terminal-state tools, event logs, and debug crops are retained under one collapsed `Diagnostics and advanced settings` disclosure. Tracking pauses and resumes across calibration or the Replay Vision hand-boundary gate without losing the user's requested running state.

## Important files

Frontend:

- pokerchaos-frontend/src/App.jsx: owns Coach state, receives tracker updates, derives live summary, reconciles staged actions and live opponent seat, and renders the live state.
- pokerchaos-frontend/src/components/ReplayVisionPanel.jsx: card/board/table-stack watcher; builds the labelled seven-seat opening-stack composite, remains mounted while the modal is hidden, and owns the shared video stream.
- pokerchaos-frontend/src/components/UnifiedTableState.jsx: unified Coach table-state roster, live action summary, opponent selection, and manual override surface.
- pokerchaos-frontend/src/components/LocalTableTrackingPanel.jsx: collapsed local tracking section inside Replay Vision; calibrates bet, cards/status, exact action-label, opponent-stack, and dealer-button regions; persists regions in localStorage key pcc_turbo_regions_v4 and migrates v2/v3 layouts.
- pokerchaos-frontend/src/components/LocalDealerWatcher.jsx: continuously samples the eight dealer regions without OCR and publishes repeat-validated dealer-seat observations even while action OCR is gated.
- pokerchaos-frontend/src/components/LocalBetOcrPanel.jsx: starts/stops the local OCR worker, takes one shared-frame snapshot per scan, handles hand/street changes, exposes manual terminal-status confirmations, and displays diagnostics.
- pokerchaos-frontend/src/vision/localBetOcr.js: amount/action-label validation, crop preparation, shared-frame capture, and bet/card/action/stack crop capture.
- pokerchaos-frontend/src/vision/localDealerWatcher.js: yellow-puck component scoring, unique-winner validation, and consecutive-read settlement.
- pokerchaos-frontend/src/vision/localHandTracker.js: hand state transitions, newLocalHand, seedLocalBlinds, applyLocalAmounts, applyLocalCardStates, and summarizeLocalHand.
- pokerchaos-frontend/src/vision/localCoachHandoff.js: maps structured tracker events into identity-bound typed Coach actions and live state.
- pokerchaos-frontend/src/vision/strategicTableState.js: builds deterministic stack coverage, players-behind, reshove/retaliation, confidence, and ICM-limitation features for Coach.
- pokerchaos-frontend/src/vision/turboVisionLogic.js: default eight-seat regions and region validation.
- pokerchaos-frontend/src/state/seatUtils.js: position order, seatsForTableSize, and localBlindSeats.
- pokerchaos-frontend/src/state/machine.js: existing Coach state machine and action codes.
- pokerchaos-frontend/src/styles.css and src/components/turbo-vision.css: UI styling.

Tests and docs:

- pokerchaos-frontend/test/local-bet-ocr.test.js
- pokerchaos-frontend/test/local-dealer-watcher.test.js
- pokerchaos-frontend/test/local-hand-tracker.test.js
- pokerchaos-frontend/test/strategic-table-state.test.js
- pokerchaos-frontend/test/local-coach-handoff.test.js
- pokerchaos-frontend/test/turbo-vision-logic.test.js
- pokerchaos-frontend/test/replay-vision-logic.test.js
- pokerchaos-frontend/test/fixtures/local-bet-ocr/
- pokerchaos-frontend/test/fixtures/local-hand-tracker/action-scenarios.json
- pokerchaos-frontend/test/fixtures/gg-replay/local-tracker-observations.json
- pokerchaos-frontend/scripts/check-local-ocr-crops.mjs
- docs/turbo-observer-trial.md

## Data and lifecycle invariants

Do not violate these without adding tests and explaining why:

1. Blank or uncertain OCR does not mean zero, fold, or check.
2. A contribution decrease pauses interpretation and requires street or hand reset.
3. Simultaneous changes do not establish action order.
4. Amount acceptance requires number plus BB, confidence threshold, and two matching reads.
5. Only the current hand is retained during normal tracking.
6. Replay Vision card recognition remains separate from local opponent card-status detection.
7. Hero's known seat is the anchor for V-seat mapping.
8. A live observation must not automatically request a Coach recommendation.
9. Manual action pills remain available.
10. Unknown active-seat status must block Hero-to-act. A repeat-validated folded_candidate may unlock only a visibly provisional, explicitly applied CTA; it is not stored as a confirmed fold.
11. Local OCR must remain closed across a hand transition until valid Hero cards, a Hero seat, and a successful Replay Vision commit identify the new hand mapping.
12. Dealer evidence must be unique and repeat-validated. A missing or ambiguous dealer cannot silently change Hero's seat.

## Current known limitations

- folded_candidate is deliberately not a confirmed fold. It can unlock a provisional manual CTA after two matching samples, but the UI retains `fold?` and asks for review. The card detector is a heuristic based on red/vivid card-back pixels and light border geometry, so cards/status regions must be tight.
- Exact Fold/All-in/Check label OCR is optional. Opponent-stack OCR is also optional and runs only from the flop onward; both depend on tight per-seat calibration and two matching reads.
- The pot is ledger-derived from visible contributions plus the carried prior-street pot and configured antes; there is no central-pot OCR or rake reconciliation.
- Opening opponent-stack coverage comes from the labelled Replay Vision crops. Unknown stacks remain null and do not become zero or block a live-read decision.
- Dealer anchoring currently assumes the validated full-ring 8-max screen-seat order. Short-handed tables with empty seats need separately validated occupancy evidence before dealer mapping can replace the explicit expected-seat fallback.
- Postflop first-to-act and checked-to-Hero are supported when exact checks/statuses establish the complete path. More complex multiway postflop ordering remains fail-closed.
- If tracking starts after multiple actions, final contributions may not reveal their exact order. Preserve uncertainty rather than inventing order.
- The trial is deliberately restricted to 8-max. Other table sizes pause local tracking until their screen-seat layouts and action-order rules have replay evidence.
- Refresh the dev server after significant App changes; screenshots can reflect an older bundle.

## Local tracking workflow

1. Open Replay Vision.
2. Share the PokerCraft tab/window.
3. Set Hero seat in Coach. Auto seat rotation can advance it between hands.
4. Use Adjust regions in Local table tracking when calibration is needed.
5. Calibrate each Bet amount region around only the numeric BB text.
6. Calibrate opponent Cards/status regions around both face-down cards and exclude avatar/name plates. Calibrate optional Fold/All-in/Check and opponent-stack regions tightly around their text. Calibrate each Dealer button region around the possible yellow D location for that screen seat. Hero is disabled only for the opponent-only regions.
7. Start tracking. Postflop stack validation is enabled by default but remains idle preflop; optional reader switches and raw evidence are under Diagnostics and advanced settings.
8. For preflop, SB/BB are mapped automatically from Hero position. Manual blind confirmation remains an advanced fallback.
9. Close or hide Replay Vision if desired; the stream and tracker remain mounted.
10. Watch Live bets, To call, High, Aggressor, seat-status chips, Action timeline, and the stale-state indicator.
11. When Hero-to-act is confidently established, Use live reads appears in the decision action row.
12. Apply it manually. Legacy action pills remain available.

## Validation commands

From pokerchaos-frontend:

~~~powershell
node --test test/local-bet-ocr.test.js test/local-hand-tracker.test.js test/local-coach-handoff.test.js test/turbo-vision-logic.test.js test/replay-vision-logic.test.js
npm.cmd test
npm.cmd run build
~~~

Optional actual-engine crop check:

~~~powershell
node scripts/check-local-ocr-crops.mjs
~~~

The production build emits a non-blocking large-chunk warning from Vite. Treat a nonzero exit code as failure.

## Next recommended work

The original implementation sequence above is complete. The next phase should focus on evidence and operational quality:

1. Collect anonymised replay annotations across more 8-max themes, resolutions, seat states, short all-ins, and multiway postflop sequences.
2. Tune the v3 default action/stack regions from those replays; keep per-user calibration as the fallback.
3. Add a central-pot reader only if replay evidence shows ledger reconciliation is insufficient, and keep any mismatch fail-closed.
4. Validate postflop `playersYetToAct`, `playersWhoCanRespond`, pot odds, and per-opponent post-call SPR against replay fixtures before broadening beyond 8-max.
5. Add explicit UI/component tests for the stage/apply/stale interaction in addition to the pure handoff and machine tests.
6. Validate a separate screen-seat layout and ordering fixture set before enabling 6-max or other table sizes.

Do not make the live reader auto-submit Coach decisions. The desired interaction is: detect and stage state, wait for Hero-to-act, then let the user explicitly apply the staged live read.
