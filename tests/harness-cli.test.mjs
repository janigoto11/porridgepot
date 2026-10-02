import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { digest } from "../harness/lib/specs.mjs";
const cli = resolve("harness/cli.mjs");
test("CLI reports skipped gates and blocks failed checks and unavailable production review", () => {
  const root = mkdtempSync(join(tmpdir(), "harness-test-"));
  const json = (path, value) => writeFileSync(join(root, path), JSON.stringify(value));
  const call = (...args) =>
    spawnSync(process.execPath, [cli, ...args], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GITHUB_SHA: "a".repeat(40), GITHUB_ACTIONS: "true" },
    });
  try {
    for (const path of ["harness", "specs"]) cpSync(path, join(root, path), { recursive: true });
    for (const path of ["apps/web", "apps/api", "infra", "tools", ".ai"])
      mkdirSync(join(root, path), { recursive: true });
    const config = JSON.parse(readFileSync(join(root, "harness/config.json")));
    for (const check of Object.values(config.checks)) check.script = null;
    json("harness/config.json", config);
    json("package.json", { scripts: { fail: 'node -e "process.exit(7)"' } });
    json(".ai/tasks.json", JSON.parse(readFileSync("specs/0001-plan.json")));
    json(".ai/plan.json", {
      schemaVersion: 1,
      id: "0001",
      spec: "specs/0001-baseline.md",
      specDigest: digest(readFileSync(join(root, "specs/0001-baseline.md"), "utf8")),
      baseCommit: "a".repeat(40),
      planner: { provider: "structured", model: "none" },
      tasks: JSON.parse(readFileSync("specs/0001-plan.json")),
    });
    assert.equal(call("check").status, 0);
    const gates = JSON.parse(readFileSync(join(root, ".ai/gates.json")));
    assert.equal(gates.gates.filter((g) => g.status === "skipped").length, 4);
    assert.equal(call("review", "assignment").status, 0);
    assert.equal(JSON.parse(readFileSync(join(root, ".ai/review.json"))).status, "not_configured");
    assert.notEqual(call("review", "production").status, 0);
    assert.notEqual(call("production-ready").status, 0);
    config.checks.test.script = "fail";
    json("harness/config.json", config);
    assert.notEqual(call("check").status, 0);
    assert.equal(JSON.parse(readFileSync(join(root, ".ai/gates.json"))).status, "failed");
    assert.notEqual(call("review", "assignment").status, 0);
    config.checks.test.script = "absent";
    json("harness/config.json", config);
    assert.notEqual(call("validate").status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
