import assert from "node:assert/strict";
import test from "node:test";

import {
  getLearningResourceHref,
  getResourceState,
  getStudyPriorities,
} from "../src/lib/studySpotPresentation.js";

test("Study Spot lesson links prefer the public canonical lesson path", () => {
  assert.equal(
    getLearningResourceHref({
      canonicalPath: "/learn/big-blind-defence",
      url: "/tier-1/legacy-lesson",
    }),
    "/learn/big-blind-defence",
  );
});

test("priority list deduplicates recurring topics in report order", () => {
  assert.deepEqual(
    getStudyPriorities([
      { title: "Big Blind Defence", tags: ["bb-defence"] },
      { title: "Another blind hand", tags: ["bb-defence"] },
      { title: "Continuation betting", tags: ["cbet"] },
      { title: "River decision", tags: ["river"] },
      { title: "Fourth", tags: ["opening"] },
    ]),
    ["Big Blind Defence", "Continuation betting", "River decision"],
  );
});

test("resource presentation supports recommended, related, and topic states", () => {
  assert.equal(
    getResourceState({
      resourceMatches: [
        { quality: "recommended", resource: { title: "Exact lesson" } },
      ],
    }).kind,
    "recommended",
  );
  assert.equal(
    getResourceState({
      resourceMatches: [
        { quality: "related", resource: { title: "Related lesson" } },
      ],
    }).kind,
    "related",
  );
  assert.equal(getResourceState({ resourceMatches: [] }).kind, "topic");
});
