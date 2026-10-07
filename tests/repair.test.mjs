import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { digest } from "../harness/lib/specs.mjs";
import { validate } from "../harness/lib/validate.mjs";

for (const mode of [
  "pass",
  "repair",
  "second-repair",
  "exhausted",
  "disabled",
  "forbidden",
  "model-error",
])
  test(`implementation repair and evidence: ${mode}`, () => {
    const root = mkdtempSync(join(tmpdir(), "repair-test-"));
    const put = (path, content) => {
      mkdirSync(resolve(root, path, ".."), { recursive: true });
      writeFileSync(
        join(root, path),
        typeof content === "string" ? content : JSON.stringify(content),
      );
    };
    const git = (...args) =>
      execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
    try {
      git("init", "-b", "main");
      git("config", "user.name", "Test");
      git("config", "user.email", "test@example.invalid");
      put(".gitignore", ".ai/\nbin/\n");
      put("bin/package.json", { type: "commonjs" });
      put("apps/web/message.js", 'export const message = "Before";\n');
      put("specs/0009-demo.md", "# Change the message\n");
      for (const path of [
        "package.json",
        "harness/config.json",
        "harness/platform.json",
        "harness/prompts/repairer.md",
      ]) {
        put(path, "");
        copyFileSync(path, join(root, path));
      }
      const config = JSON.parse(readFileSync(join(root, "harness/config.json")));
      config.planner.contextPaths = ["apps"];
      config.implementation.maxRepairAttempts = mode === "disabled" ? 0 : 2;
      put("harness/config.json", config);
      git("add", ".");
      git("commit", "-m", "base");
      const base = git("rev-parse", "HEAD");
      put(".ai/plan.json", {
        schemaVersion: 1,
        id: "0009",
        spec: "specs/0009-demo.md",
        specDigest: digest(readFileSync(join(root, "specs/0009-demo.md"), "utf8")),
        baseCommit: base,
        planner: { provider: "mock", model: "mock" },
        tasks: [
          {
            id: "message",
            owner: "apps/web",
            description: "Change message",
            spec: "specs/0009-demo.md",
            allowedPaths: ["apps/web"],
            dependsOn: [],
            acceptanceCriteria: ["Message changed"],
          },
        ],
      });
      put("apps/web/message.js", 'export const message = "Broken";\n');
      git("add", ".");
      git("commit", "-m", "implementation");
      put(
        "bin/npm",
        `#!/usr/bin/env node
const fs = require('node:fs');
if (process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.GH_TOKEN) throw new Error('Secret passed to checks');
if (process.argv[2] === 'exec') process.exit(0);
const path = '.ai/check-count';
const count = fs.existsSync(path) ? Number(fs.readFileSync(path)) + 1 : 1;
fs.writeFileSync(path, String(count));
const pass = ${JSON.stringify(mode)} === 'pass' || (${JSON.stringify(mode)} === 'repair' && count === 2) || (${JSON.stringify(mode)} === 'second-repair' && count === 3);
fs.writeFileSync('.ai/gates.json', JSON.stringify({status:pass?'passed':'failed',gates:[]}));
console.error('React lint diagnostic ' + count);
process.exit(pass ? 0 : 1);
`,
      );
      const countPath = join(root, ".ai/model-count");
      put(
        "bin/claude",
        `#!/usr/bin/env node
const fs = require('node:fs'), assert = require('node:assert/strict');
const data = JSON.parse(fs.readFileSync(0,'utf8'));
const path = ${JSON.stringify(countPath)};
const count = fs.existsSync(path) ? Number(fs.readFileSync(path)) + 1 : 1;
fs.writeFileSync(path,String(count));
assert.match(data.diagnostics, /React lint diagnostic/);
assert.match(data.sourceContext[0].content, count === 1 ? /Broken/ : /Repair1/);
const result = {summary:'Repair',files:[{path:${JSON.stringify(mode === "forbidden" ? "harness/config.json" : "apps/web/message.js")},content:'export const message = "Repair' + count + '";\\n'}]};
console.log(JSON.stringify(${JSON.stringify(mode)} === 'model-error' ? {is_error:true,subtype:'error'} : {subtype:'success',structured_output:result}));
`,
      );
      execFileSync("chmod", ["+x", join(root, "bin/npm"), join(root, "bin/claude")]);
      const env = {
        ...process.env,
        PATH: join(root, "bin") + ":" + process.env.PATH,
        PLAN_PATH: ".ai/plan.json",
        BASE_SHA: base,
        CLAUDE_CODE_OAUTH_TOKEN: "mock",
        GH_TOKEN: "mock",
      };
      const result = spawnSync(process.execPath, [resolve("tools/check-implementation.mjs")], {
        cwd: root,
        env,
        encoding: "utf8",
      });
      const successful = ["pass", "repair", "second-repair"].includes(mode);
      assert.equal(result.status === 0, successful, result.stderr + result.stdout);
      const calls = existsSync(countPath) ? Number(readFileSync(countPath)) : 0;
      assert.equal(
        calls,
        {
          pass: 0,
          repair: 1,
          "second-repair": 2,
          exhausted: 2,
          disabled: 0,
          forbidden: 1,
          "model-error": 1,
        }[mode],
      );
      assert.equal(
        Number(readFileSync(join(root, ".ai/check-count"))),
        {
          pass: 1,
          repair: 2,
          "second-repair": 3,
          exhausted: 3,
          disabled: 1,
          forbidden: 1,
          "model-error": 1,
        }[mode],
      );
      assert.deepEqual(JSON.parse(readFileSync(join(root, "harness/config.json"))), config);
      assert.ok(existsSync(join(root, ".ai/check-0.log")));
      const state = JSON.parse(readFileSync(join(root, ".ai/repair-progress.json")));
      if (successful) assert.equal(state.events.at(-1).status, "passed");
      const expected = readFileSync(join(root, "apps/web/message.js"), "utf8");
      put("apps/web/new.js", "untracked recovery content");
      const evidence = spawnSync(
        process.execPath,
        [resolve("tools/save-implementation-evidence.mjs")],
        { cwd: root, env, encoding: "utf8" },
      );
      assert.equal(evidence.status, 0, evidence.stderr);
      assert.equal(
        readFileSync(join(root, ".ai/untracked/apps/web/new.js"), "utf8"),
        "untracked recovery content",
      );
      assert.equal(JSON.parse(readFileSync(join(root, ".ai/source-state.json"))).baseCommit, base);
      git("reset", "--hard", base);
      git("apply", ".ai/implementation.patch");
      assert.equal(readFileSync(join(root, "apps/web/message.js"), "utf8"), expected);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

test("repair limit accepts only zero to two attempts", () => {
  const config = JSON.parse(readFileSync("harness/config.json"));
  for (const maxRepairAttempts of [-1, 3, 1.5, "2"])
    assert.throws(() =>
      validate("config", {
        ...config,
        implementation: { ...config.implementation, maxRepairAttempts },
      }),
    );
  for (const maxRepairAttempts of [0, 1, 2])
    validate("config", {
      ...config,
      implementation: { ...config.implementation, maxRepairAttempts },
    });
});
