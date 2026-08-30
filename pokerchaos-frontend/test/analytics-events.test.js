import assert from "node:assert/strict";
import test from "node:test";

import { buildProductEventParams } from "../src/lib/analytics.js";

test("product analytics keeps only bounded privacy-safe event fields", () => {
  const params = buildProductEventParams("study_resource_opened", {
    spot_category: "preflop",
    resource_id: "article-1",
    match_quality: "recommended",
    history_text: "private hand history",
    hero_cards: ["As", "Kd"],
  });

  assert.deepEqual(params, {
    spot_category: "preflop",
    resource_id: "article-1",
    match_quality: "recommended",
  });
});

test("unknown product analytics events fail closed", () => {
  assert.equal(
    buildProductEventParams("raw_hand_history_uploaded", {
      history_text: "private",
    }),
    null,
  );
});
