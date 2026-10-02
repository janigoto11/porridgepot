import test from "node:test";
import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { selectSpecs, readSpec, digest } from "../harness/lib/specs.mjs";
import { validateDocument, generatePlan } from "../harness/lib/planning.mjs";
import { readSourceContext } from "../harness/lib/context.mjs";
import { plan as claudePlan } from "../harness/adapters/anthropic.mjs";
import { readJSON } from "../harness/lib/validate.mjs";
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "spec-planning-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.invalid");
  const put = (path, content) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  const commit = () => {
    git("add", ".");
    git("commit", "-qm", "fixture");
    return git("rev-parse", "HEAD");
  };
  put("specs/0001-first.md", "# First\nBuild the first feature.\n");
  return { root, git, put, commit, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
test("push selection handles full range, multiple specs, deletion, rename and first push", () => {
  const f = fixture();
  try {
    const before = f.commit();
    f.put("specs/0002-second.md", "# Second\n");
    f.commit();
    f.put("specs/0001-first.md", "# Changed first\n");
    f.put("specs/0001-plan.json", "[]");
    const after = f.commit();
    const select = (a, b) =>
      selectSpecs({ eventName: "push", event: { before: a, after: b }, root: f.root });
    assert.deepEqual(
      select(before, after).map((s) => s.id),
      ["0001", "0002"],
    );
    assert.equal(select("0".repeat(40), after).length, 2);
    f.put("specs/0001-plan.json", "[{}]");
    const planOnly = f.commit();
    assert.deepEqual(select(after, planOnly), []);
    rmSync(join(f.root, "specs/0002-second.md"));
    const deleted = f.commit();
    assert.deepEqual(select(planOnly, deleted), []);
    renameSync(join(f.root, "specs/0001-first.md"), join(f.root, "specs/0001-renamed.md"));
    const renamed = f.commit();
    assert.deepEqual(
      select(deleted, renamed).map((s) => s.path),
      ["specs/0001-renamed.md"],
    );
    assert.throws(() => select("f".repeat(40), renamed), /Cannot compare/);
  } finally {
    f.cleanup();
  }
});
test("manual selection fails on absent, unsafe or duplicate specs", () => {
  const f = fixture();
  try {
    const select = (explicitSpec) =>
      selectSpecs({ eventName: "workflow_dispatch", event: {}, explicitSpec, root: f.root });
    assert.equal(select("specs/0001-first.md")[0].id, "0001");
    for (const path of [undefined, "../escape.md", "specs/9999-missing.md", "specs/0001-plan.json"])
      assert.throws(() => select(path));
    f.put("specs/0001-duplicate.md", "# Duplicate");
    assert.throws(() => select("specs/0001-first.md"), /Duplicate/);
  } finally {
    f.cleanup();
  }
});
const task = {
  id: "frontend",
  owner: "apps/web",
  description: "Build the feature",
  spec: "specs/0001-first.md",
  allowedPaths: ["apps/web"],
  acceptanceCriteria: ["Feature works"],
  dependsOn: [],
};
test("plan provenance rejects changed specs, other commits and task references", () => {
  const f = fixture();
  try {
    const sha = f.commit(),
      spec = readSpec(task.spec, f.root);
    const plan = {
      schemaVersion: 1,
      id: spec.id,
      spec: spec.path,
      specDigest: spec.specDigest,
      baseCommit: sha,
      planner: { provider: "anthropic", model: "test" },
      tasks: [task],
    };
    assert.equal(validateDocument(plan, { root: f.root, expectedCommit: sha }), plan);
    assert.throws(
      () => validateDocument(plan, { root: f.root, expectedCommit: "a".repeat(40) }),
      /another commit/,
    );
    f.put("specs/0002-second.md", "# Second");
    assert.throws(
      () =>
        validateDocument(
          { ...plan, tasks: [{ ...task, spec: "specs/0002-second.md" }] },
          { root: f.root },
        ),
      /selected spec/,
    );
    f.put(task.spec, "# Edited after planning");
    assert.throws(() => validateDocument(plan, { root: f.root }), /current spec/);
  } finally {
    f.cleanup();
  }
});
test("source context uses committed allowlisted files and rejects dirty specs or excess context", () => {
  const f = fixture();
  try {
    f.put("apps/web/main.js", "export const feature = true;\n");
    f.put(".env", "PRIVATE_VALUE=do-not-send");
    f.put("unrelated.json", '{"private":true}');
    const baseCommit = f.commit(),
      spec = readSpec(task.spec, f.root);
    f.put("apps/web/main.js", "uncommitted content");
    const args = {
      root: f.root,
      baseCommit,
      spec,
      contextPaths: ["apps", ".env"],
      maxContextBytes: 10000,
    };
    const context = readSourceContext(args);
    assert.deepEqual(context, [
      { path: "apps/web/main.js", content: "export const feature = true;\n" },
    ]);
    assert.throws(() => readSourceContext({ ...args, maxContextBytes: 1 }), /budget/);
    f.put(task.spec, "changed");
    assert.throws(
      () => readSourceContext({ ...args, spec: readSpec(task.spec, f.root) }),
      /Commit/,
    );
  } finally {
    f.cleanup();
  }
});
function request() {
  return {
    spec: {
      path: task.spec,
      content: "Build the feature",
      specDigest: digest("Build the feature"),
    },
    baseCommit: "a".repeat(40),
    platform: {},
    sourceContext: [],
    prompt: "Return a plan",
    taskSchema: readJSON("harness/schemas/task.schema.json"),
    planner: {
      model: "test-model",
      maxOutputTokens: 4096,
      maxContextBytes: 120000,
      timeoutMs: 1000,
    },
  };
}
const response = (patch = {}) => ({
  ok: true,
  json: async () => ({
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify({ tasks: [task] }) }],
    ...patch,
  }),
});
test("Claude adapter sends structured output request and never needs a real key in tests", async () => {
  let calls = 0;
  const tasks = await claudePlan(request(), {
    apiKey: "unit-test-only",
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, "https://api.anthropic.com/v1/messages");
      assert.equal(options.headers["x-api-key"], "unit-test-only");
      const body = JSON.parse(options.body);
      assert.equal(body.output_config.format.type, "json_schema");
      assert.equal(body.max_tokens, 4096);
      assert.equal(body.model, "test-model");
      assert.equal(
        body.output_config.format.schema.properties.tasks.items.properties.allowedPaths.items
          .pattern,
        undefined,
      );
      assert.ok(options.signal);
      return response();
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(tasks, [task]);
});
test("Claude adapter fails closed without a key, on refusal, truncation, bad JSON and network errors", async () => {
  await assert.rejects(
    claudePlan(request(), {
      apiKey: "",
      fetchImpl: () => {
        throw new Error("must not call");
      },
    }),
    /ANTHROPIC_API_KEY/,
  );
  for (const stop_reason of ["max_tokens", "refusal"])
    await assert.rejects(
      claudePlan(request(), { apiKey: "test", fetchImpl: async () => response({ stop_reason }) }),
      /did not finish/,
    );
  await assert.rejects(
    claudePlan(request(), {
      apiKey: "test",
      fetchImpl: async () => response({ content: [{ type: "text", text: "invalid" }] }),
    }),
    /valid JSON/,
  );
  await assert.rejects(
    claudePlan(request(), { apiKey: "test", fetchImpl: async () => ({ ok: false, status: 401 }) }),
    /HTTP 401/,
  );
  await assert.rejects(
    claudePlan(request(), {
      apiKey: "test",
      fetchImpl: async () => {
        throw new Error("do-not-log-provider-body");
      },
    }),
    /request failed/,
  );
  const oversized = request();
  oversized.planner.maxContextBytes = 1;
  await assert.rejects(claudePlan(oversized, { apiKey: "test" }), /byte budget/);
});
test("generatePlan passes the selected spec to its adapter and validates its output", async () => {
  const f = fixture();
  try {
    f.put("harness/prompts/planner.md", "Plan the selected spec");
    f.put(
      "harness/schemas/task.schema.json",
      readFileSync("harness/schemas/task.schema.json", "utf8"),
    );
    f.put(
      "adapter.mjs",
      `export async function plan(request) { return [${JSON.stringify(task)}]; }`,
    );
    const baseCommit = f.commit();
    const config = {
      planner: {
        provider: "test",
        model: "test",
        adapter: "adapter.mjs",
        contextPaths: ["apps"],
        maxContextBytes: 120000,
      },
    };
    const plan = await generatePlan({
      path: task.spec,
      config,
      platform: {},
      root: f.root,
      baseCommit,
    });
    assert.equal(plan.spec, task.spec);
    assert.equal(plan.baseCommit, baseCommit);
    assert.deepEqual(plan.tasks, [task]);
  } finally {
    f.cleanup();
  }
});

test("CLI carries a non-baseline spec through planning, receipts and review and rejects tampering", () => {
  const f = fixture();
  try {
    for (const dir of ["harness", "specs"]) cpSync(dir, join(f.root, dir), { recursive: true });
    // Remove the fixture's 0001 alias to preserve unique IDs.
    rmSync(join(f.root, "specs/0001-first.md"));
    f.put(
      "specs/9999-feature.md",
      "# Plain-language feature\nShow a profile to the signed-in user.\n",
    );
    f.put(
      "mock-planner.mjs",
      `export async function plan(request) { return [{...${JSON.stringify(task)}, spec: request.spec.path}]; }`,
    );
    const config = readJSON("harness/config.json");
    config.planner.adapter = "mock-planner.mjs";
    config.planner.provider = "test";
    config.planner.contextPaths = ["AGENTS.md"];
    f.put("harness/config.json", JSON.stringify(config));
    f.put("package.json", JSON.stringify(readJSON("package.json")));
    f.put(".gitignore", ".ai/\n");
    const sha = f.commit();
    const call = (script, ...args) =>
      spawnSync(process.execPath, [resolve(script), ...args], {
        cwd: f.root,
        encoding: "utf8",
        env: { ...process.env, GITHUB_SHA: sha, TASK_ID: "frontend", ANTHROPIC_API_KEY: "" },
      });
    let result = call("tools/plan.mjs", "specs/9999-feature.md");
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(readFileSync(join(f.root, ".ai/plan.json")));
    assert.equal(plan.id, "9999");
    result = call("tools/dry-run.mjs");
    assert.equal(result.status, 0, result.stderr);
    result = call("tools/verify-results.mjs");
    assert.equal(result.status, 0, result.stderr);
    f.put(".ai/gates.json", JSON.stringify({ status: "passed", gates: [] }));
    result = call("harness/cli.mjs", "review", "assignment");
    assert.equal(result.status, 0, result.stderr);
    f.put(".ai/tasks.json", JSON.stringify([{ ...plan.tasks[0], description: "tampered" }]));
    assert.notEqual(call("tools/dry-run.mjs").status, 0);
    assert.notEqual(call("harness/cli.mjs", "review", "assignment").status, 0);
    result = call("tools/plan.mjs");
    assert.notEqual(result.status, 0);
    assert.throws(() => readFileSync(join(f.root, ".ai/plan.json")));
  } finally {
    f.cleanup();
  }
});
