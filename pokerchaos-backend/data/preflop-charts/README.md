# Preflop chart data

This directory is the optional source of deterministic preflop frequencies for
the live Replay Analyst. The MVP does not require chart files: when no matching
chart is installed, the backend continues with state-first, GTO-informed model
guidance and reports the limitation through confidence/assumptions.

## Required file type

- UTF-8 JSON (`.json`)
- One versioned chart file per format, table size, ante structure and effective
  stack bucket
- Every file must validate against [`chart.schema.json`](./chart.schema.json)
- Do not use shorthand such as `22+`, `A2s+` or `KTo-KQo`. Expand every holding
  to a canonical 169-grid code: `AA`, `AKs`, `AKo`, `A5s`, and so on.
- Frequencies are decimals from `0` to `1` and should total `1` for each hand.
- The supported action keys are `fold`, `check`, `call`, `open`, `raise`,
  `3-bet`, `4-bet`, and `jam`.

## Naming convention

Use:

```text
<format>-<table_size>max-<stack_min>to<stack_max>bb-<version>.json
```

Example:

```text
tournament-8max-20to30bb-v1.json
```

## Spot identifiers

Each spot needs a stable `id` and these fields:

- `situation`: `unopened`, `limped`, `facing_open`, `facing_open_callers`,
  `facing_3bet`, or `facing_4bet`
- `heroPosition`: exact seat code
- `villainPosition`: exact seat code or `null` when not applicable
- `playersInHand`: expected number of players at the decision
- `hands`: mapping of every supported hand code to action frequencies

`example.chart.json` demonstrates structure only. Its sample frequencies are
illustrative placeholders and must not be treated as poker strategy.

## Import contract

When chart loading is implemented, the loader should:

1. Validate the JSON schema and reject unknown versions.
2. Select by format, table size, ante, effective stack and exact positions.
3. Return no chart result rather than guessing when no exact spot matches.
4. Attach chart filename/version to the recommendation for auditability.
5. Keep model recommendations inside the chart's non-zero action set unless an
   explicitly labelled exploit override is requested.

