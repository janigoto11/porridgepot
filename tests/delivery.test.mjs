import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  allowedFile,
  applyFiles,
  frontendOnly,
  taskOrder,
  renderPlan,
} from "../harness/lib/delivery.mjs";
import { validate } from "../harness/lib/validate.mjs";
import { ask, describeFailure } from "../harness/adapters/claude-code.mjs";
test("frontend gate requires a nonempty exact directory boundary, including deleted/renamed paths", () => {
  assert.equal(frontendOnly(["apps/web/src/main.jsx"]), true);
  for (const paths of [
    [],
    ["apps/web2/a.js"],
    ["apps/web/a.js", "infra/app.mjs"],
    ["apps/web/../api/a.js"],
    ["apps/web/.env"],
    ["apps/api/old.js", "apps/web/new.js"],
  ])
    assert.equal(frontendOnly(paths), false);
  assert.equal(allowedFile("harness/config.json", ["harness"]), false);
  assert.equal(allowedFile("apps/api/index.mjs", ["apps/web"]), false);
});
test("dependency ordering is deterministic and rejects cycles", () => {
  assert.deepEqual(
    taskOrder([
      { id: "b", dependsOn: ["a"] },
      { id: "a", dependsOn: [] },
    ]).map((t) => t.id),
    ["a", "b"],
  );
  assert.throws(() =>
    taskOrder([
      { id: "a", dependsOn: ["b"] },
      { id: "b", dependsOn: ["a"] },
    ]),
  );
});
test("file writer validates the whole response before writes and rejects dangling symlinks", () => {
  const cwd = process.cwd(),
    root = mkdtempSync(join(tmpdir(), "delivery-test-"));
  try {
    process.chdir(root);
    mkdirSync("apps/web", { recursive: true });
    assert.throws(() =>
      applyFiles(
        [
          { path: "apps/web/a.js", content: "ok" },
          { path: "infra/x.js", content: "bad" },
        ],
        ["apps/web"],
      ),
    );
    assert.throws(() => readFileSync("apps/web/a.js"));
    symlinkSync("/nonexistent-target", "apps/web/link");
    assert.throws(
      () => applyFiles([{ path: "apps/web/link/x.js", content: "bad" }], ["apps/web"]),
      /Symlink/,
    );
    applyFiles([{ path: "apps/web/a.js", content: "ok" }], ["apps/web"]);
    assert.equal(readFileSync("apps/web/a.js", "utf8"), "ok");
  } finally {
    process.chdir(cwd);
    rmSync(root, { recursive: true, force: true });
  }
});
test("Claude Code adapter is bounded, disables tools and never forwards GitHub tokens", () => {
  const old = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  process.env.CLAUDE_CODE_OAUTH_TOKEN = "mock-token";
  const request = {
    prompt: "contract",
    data: { spec: "test" },
    schema: {
      type: "object",
      required: ["ok"],
      properties: { ok: { type: "boolean" } },
      additionalProperties: false,
    },
  };
  try {
    assert.deepEqual(
      ask(request, (cmd, args, opts) => {
        assert.equal(cmd, "claude");
        assert.equal(args[args.indexOf("--tools") + 1], "");
        assert.equal(args.includes("--bare"), false);
        assert.equal(args[args.indexOf("--setting-sources") + 1], "");
        assert.equal(opts.env.HOME, opts.cwd);
        assert.equal(opts.env.ENABLE_CLAUDEAI_MCP_SERVERS, "false");
        assert.equal(opts.env.ANTHROPIC_API_KEY, undefined);
        assert.equal(opts.env.GH_TOKEN, undefined);
        assert.equal(opts.env.GITHUB_TOKEN, undefined);
        assert.equal(opts.timeout, 180000);
        return JSON.stringify({ subtype: "success", structured_output: { ok: true } });
      }),
      { ok: true },
    );
    for (const value of [
      { subtype: "error_max_turns" },
      { subtype: "success", structured_output: { ok: "wrong" } },
    ])
      assert.throws(() => ask(request, () => JSON.stringify(value)));
  } finally {
    if (old === undefined) delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    else process.env.CLAUDE_CODE_OAUTH_TOKEN = old;
  }
});
test("readable plan includes scope, dependencies and acceptance criteria from the JSON", () => {
  const text = renderPlan({
    id: "0003",
    spec: "specs/0003-demo.md",
    baseCommit: "abc",
    tasks: [
      {
        id: "text",
        description: "Vaihda otsikko",
        owner: "apps/web",
        allowedPaths: ["apps/web"],
        dependsOn: [],
        acceptanceCriteria: ["Uusi otsikko näkyy"],
      },
    ],
  });
  assert.match(text, /Vaihda otsikko/);
  assert.match(text, /Uusi otsikko näkyy/);
  assert.match(text, /apps\/web/);
});

test("Claude failures provide safe diagnostics without leaking provider output", () => {
  const secret = "secret-do-not-log";
  const message = describeFailure({
    status: 1,
    stdout: JSON.stringify({ is_error: true, result: `Not logged in ${secret}` }),
  });
  assert.match(message, /authentication failed/);
  assert.equal(message.includes(secret), false);
  assert.match(describeFailure({ code: "ETIMEDOUT" }), /timed out/);
  assert.match(describeFailure({ stdout: JSON.stringify({ api_error_status: 429 }) }), /429/);
  assert.match(describeFailure({ status: 2, stderr: secret }), /status 2/);
});

test("implementation timeout is configurable and bounded independently of planning", () => {
  const config = JSON.parse(readFileSync("harness/config.json", "utf8"));
  validate("config", config);
  for (const timeoutMs of [0, -1, 900001, "600000"]) {
    assert.throws(() => validate("config", { ...config, implementation: { timeoutMs } }));
  }
  validate("config", { ...config, implementation: { timeoutMs: 12000 } });
});
