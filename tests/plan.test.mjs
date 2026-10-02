import test from "node:test";
import assert from "node:assert/strict";
import { validatePlan } from "../tools/plan.mjs";
import { readJSON, validate, loadConfig } from "../harness/lib/validate.mjs";
import { assertReview } from "../harness/lib/review.mjs";
const tasks = readJSON("specs/0001-plan.json");
test("accepts baseline plan and configuration", () => {
  assert.deepEqual(validatePlan(tasks), tasks);
  loadConfig();
});
test("rejects malformed, unsafe and ambiguous plans", () => {
  const t = tasks[0];
  for (const plan of [
    [],
    [t, t],
    [{ ...t, id: "../escape" }],
    [{ ...t, allowedPaths: ["../outside"] }],
    [{ ...t, spec: "missing.md" }],
    [{ ...t, acceptanceCriteria: [] }],
    [{ ...t, extra: true }],
    [{ ...t, dependsOn: ["missing"] }],
    [{ ...t, dependsOn: [t.id] }],
    [{ ...t, owner: "elsewhere" }],
    Array.from({ length: 9 }, (_, i) => ({ ...t, id: `task-${i}` })),
  ])
    assert.throws(() => validatePlan(plan));
  assert.throws(() =>
    validatePlan([
      { ...tasks[0], dependsOn: [tasks[1].id] },
      { ...tasks[1], dependsOn: [tasks[0].id] },
    ]),
  );
});
const expected = {
  scope: "production",
  sourceRevision: "abc",
  requestDigest: "a".repeat(64),
  provider: "test",
  model: "test-model",
};
const approved = {
  schemaVersion: 1,
  ...expected,
  status: "approved",
  summary: "Reviewed",
  findings: [],
};
test("review gate rejects malformed, stale, blocked and missing approvals", () => {
  validate("review", approved);
  assertReview(approved, expected);
  assert.throws(() => validate("review", { ...approved, status: "maybe" }));
  for (const patch of [
    { status: "not_configured" },
    { status: "changes_requested" },
    { sourceRevision: "old" },
    { requestDigest: "b".repeat(64) },
    { scope: "assignment" },
    { provider: "other" },
    { model: "other" },
    { findings: [{ severity: "error", path: "apps/api", message: "Bug" }] },
  ])
    assert.throws(() => assertReview({ ...approved, ...patch }, expected));
});
test("unconfigured review is explicit and only allowed for assignment", () => {
  const context = { ...expected, scope: "assignment", provider: "unconfigured", model: "none" };
  assertReview({ ...approved, ...context, status: "not_configured" }, context);
  assert.throws(() => assertReview({ ...approved, ...context, status: "approved" }, context));
  assert.throws(() => assertReview({ ...approved, status: "not_configured" }, expected));
});
