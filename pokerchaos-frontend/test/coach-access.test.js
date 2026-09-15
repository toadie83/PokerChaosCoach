import assert from "node:assert/strict";
import test from "node:test";
import { COACH_EARLY_ACCESS_URL } from "../src/lib/coachAccess.js";

test("Coach request opens an addressed draft with pricing and usage context", () => {
  const url = new URL(COACH_EARLY_ACCESS_URL);
  assert.equal(url.protocol, "mailto:");
  assert.equal(url.pathname, "qacopilotdev@gmail.com");
  assert.match(url.searchParams.get("subject"), /Coach.*early access request/);
  const body = url.searchParams.get("body");
  assert.match(body, /account email:/);
  assert.match(body, /Expected sessions per week:/);
  assert.match(body, /priced separately according to usage/);
  assert.match(body, /pricing and included usage allowance/);
});
