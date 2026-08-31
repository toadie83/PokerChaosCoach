import assert from "node:assert/strict";
import test from "node:test";

import { requestDeleteStudyReport } from "../src/api/aiService.js";

test("Study Report removal uses the report-scoped DELETE endpoint", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  let request = null;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({
      ok: true,
      deletedReportId: "report/008",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await requestDeleteStudyReport("report/008");

  assert.equal(request.url, "http://localhost:4011/study-spots/reports/report%2F008");
  assert.equal(request.options.method, "DELETE");
  assert.equal(result.deletedReportId, "report/008");
});
