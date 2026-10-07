import test from "node:test";
import assert from "node:assert/strict";
import { assertDeliveryReview } from "../harness/lib/delivery-review.mjs";
const expected = { baseCommit: "a".repeat(40), headCommit: "b".repeat(40) };
const passing = {
  ...expected,
  verdict: "pass",
  summary: "Approved",
  blockingFindings: [],
  observations: ["Optional improvement"],
};
test("delivery review permits non-blocking observations but fails closed", () => {
  assertDeliveryReview(passing, expected);
  assertDeliveryReview({ ...passing, observations: [] }, expected);
  for (const patch of [
    { verdict: "fail" },
    { blockingFindings: ["Defect"] },
    { blockingFindings: undefined },
    { observations: undefined },
    { blockingFindings: "" },
    { observations: [null] },
    { baseCommit: "c".repeat(40) },
    { headCommit: "c".repeat(40) },
    { findings: [] },
  ])
    assert.throws(() => assertDeliveryReview({ ...passing, ...patch }, expected));
  assert.throws(() =>
    assertDeliveryReview(
      { ...expected, verdict: "pass", summary: "Legacy", findings: [] },
      expected,
    ),
  );
});
