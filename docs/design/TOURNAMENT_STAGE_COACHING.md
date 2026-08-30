# Tournament-stage coaching contract

Tournament stage is an optional qualitative modifier for standard MTT coaching. It must never replace the known decision state or be presented as an exact ICM calculation.

## Stage codes

- `auto`: current stack- and action-aware baseline; no manual stage assumption
- `early_reentry`: low approximate risk premium, high-SPR discipline, value-led accumulation
- `middle_accumulation`: antes, selective steals and reshoves, reduced speculative flatting
- `bubble_pressure`: coverage-dependent pressure and tighter stack-threatening continues
- `post_bubble`: return toward chip accumulation while anticipating released short stacks
- `late_endgame`: qualitative payout pressure and stack-role-aware endgame decisions

## Precedence

1. Legal actions, cards, board, positions and action history
2. Pot, facing amount, current stacks and SPR
3. Hero/Villain stack coverage
4. Explicit payouts, paid places, players remaining and full stack distribution when available
5. User-selected approximate tournament stage
6. Population exploits and persona presentation

Stack depth and tournament stage are independent. A deep stack does not prove an early stage, and a short stack does not prove a late stage.

## Product behaviour

- First-time and invalid selections resolve to `auto`.
- Selecting a stage does not trigger coaching or record a poker action.
- The selection is retained between hands and browser refreshes, and reset to `auto` by an explicit session reset.
- Cash requests omit tournament-stage guidance even if a stale tournament selection remains in local state.
- Bubble and endgame quick-range snapshots remain labelled as approximate and ICM-sensitive unless exact field and payout inputs are supplied.
- Satellites and PKOs require future format-specific overrides and must not reuse this standard-MTT lens as exact advice.
