import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
  rmSync,
  copyFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { digest } from "../harness/lib/specs.mjs";

for (const mode of ["frontend", "docs", "web-docs", "backend", "stale-main", "timeout"])
  test(`mocked Git delivery: ${mode}`, () => {
    const area = mode === "backend" ? "apps/api" : mode === "docs" ? "docs" : "apps/web";
    const changedPath = `${area}/message.js`;
    const sandbox = mkdtempSync(join(tmpdir(), "delivery-flow-"));
    const root = join(sandbox, "repo"),
      remote = join(sandbox, "remote.git"),
      bin = join(sandbox, "bin");
    mkdirSync(root);
    mkdirSync(bin);
    const put = (path, value) => {
      const file = join(root, path);
      mkdirSync(resolve(file, ".."), { recursive: true });
      writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
    };
    const git = (...args) =>
      execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
    const output = join(sandbox, "output"),
      summary = join(sandbox, "summary"),
      eventPath = join(sandbox, "event.json");
    const env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      GITHUB_REPOSITORY: "test/repo",
      GH_TOKEN: "mock",
      CLAUDE_CODE_OAUTH_TOKEN: "mock",
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
      GITHUB_EVENT_PATH: eventPath,
    };
    const run = (script, command, extra = {}) => {
      const result = spawnSync(process.execPath, [resolve(script), ...(command ? [command] : [])], {
        cwd: root,
        encoding: "utf8",
        env: { ...env, ...extra },
      });
      assert.equal(result.status, 0, result.stderr + result.stdout);
    };
    try {
      git("init", "-b", "main");
      git("config", "user.name", "Test");
      git("config", "user.email", "test@example.invalid");
      execFileSync("git", ["init", "--bare", remote], { stdio: "pipe" });
      git("remote", "add", "origin", remote);
      symlinkSync(resolve("node_modules"), join(root, "node_modules"));
      put(".gitignore", "node_modules/\n.ai/\n");
      put(changedPath, 'export const message = "Before";\n');
      put("specs/0009-demo.md", "# Demo\nChange the message to After.\n");
      const config = JSON.parse(readFileSync("harness/config.json"));
      config.planner.contextPaths = ["apps", "docs"];
      config.implementation.timeoutMs = mode === "timeout" ? 1000 : 12000;
      put("harness/config.json", config);
      for (const path of [
        "package.json",
        "harness/platform.json",
        "harness/prompts/implementer.md",
        "harness/prompts/delivery-reviewer.md",
      ]) {
        put(path, "");
        copyFileSync(path, join(root, path));
      }
      git("add", ".");
      git("commit", "-m", "base");
      git("push", "origin", "main");
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
            id: "text",
            owner: area,
            description: "Change message",
            spec: "specs/0009-demo.md",
            allowedPaths: mode === "web-docs" ? [area, "docs"] : [area],
            dependsOn: [],
            acceptanceCriteria: ["Message is After"],
          },
        ],
      });
      writeFileSync(
        join(bin, "gh"),
        `#!/usr/bin/env node
const fs = require('node:fs'), cp = require('node:child_process');
const args = process.argv.slice(2), path = args[1].replace('repos/test/repo/', '');
const statePath = ${JSON.stringify(join(sandbox, "state.json"))};
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath)) : {prs: []};
const git = (...a) => cp.execFileSync('git', a, {encoding:'utf8'}).trim();
let result;
if (path.startsWith('pulls?')) result = [];
else if (path === 'pulls') {
 const body = JSON.parse(fs.readFileSync(0, 'utf8'));
 const number = state.prs.length + 1;
 result = {number, html_url: 'https://github.com/test/repo/pull/' + number, head:{ref:body.head, sha:git('rev-parse','HEAD'),repo:{full_name:'test/repo'}},base:{ref:'main'}};
 state.prs.push(result);
} else if (path.includes('/files?')) result = [{filename:'plans/0009-${base}.json',status:'added'}, {filename:'plans/0009-${base}.md',status:'added'}];
else if (path === 'git/ref/heads/main') result = {object:{sha:git('ls-remote','origin','refs/heads/main').split(/\\s/)[0]}};
else if (path === 'actions/workflows/ci.yml/dispatches') { (state.ciDispatches ??= []).push(JSON.parse(fs.readFileSync(0,'utf8'))); result = null; }
else if (path.endsWith('/dispatches')) { state.dispatch = JSON.parse(fs.readFileSync(0,'utf8')); result = null; }
else if (path === 'pulls/2') result = {...state.prs[1], merged:true,merge_commit_sha:state.prs[1].head.sha};
else throw new Error('Unexpected API ' + path);
fs.writeFileSync(statePath,JSON.stringify(state));
if(result !== null) console.log(JSON.stringify(result));
`,
        { mode: 0o755 },
      );
      writeFileSync(
        join(bin, "claude"),
        `#!/usr/bin/env node
const fs = require('node:fs');
const data = JSON.parse(fs.readFileSync(0,'utf8'));
const structured_output = data.task ? {summary:'Changed message',files:[{path:${JSON.stringify(changedPath)},content:'export const message = "After";\\n'}]} : {verdict:'pass',summary:'Matches plan',blockingFindings:[],observations:['Optional improvement']};
if (${JSON.stringify(mode)} === 'timeout') setTimeout(() => {}, 5000);
else console.log(JSON.stringify({subtype:'success',structured_output}));
`,
        { mode: 0o755 },
      );
      run("tools/github-delivery.mjs", "publish-plan");
      const branch = git("branch", "--show-current");
      git("switch", "main");
      git("merge", "--ff-only", branch);
      git("push", "origin", "main");
      const merge = git("rev-parse", "HEAD");
      writeFileSync(
        eventPath,
        JSON.stringify({
          pull_request: {
            number: 1,
            merged: true,
            merge_commit_sha: merge,
            base: { ref: "main" },
            head: { ref: branch, repo: { full_name: "test/repo" } },
          },
        }),
      );
      run("tools/github-delivery.mjs", "prepare");
      const extra = { PLAN_PATH: `plans/0009-${base}.json`, BASE_SHA: merge };
      if (mode === "timeout") {
        const result = spawnSync(process.execPath, [resolve("tools/implement.mjs")], {
          cwd: root,
          encoding: "utf8",
          env: { ...env, ...extra },
        });
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /Claude Code timed out/);
        const progress = JSON.parse(readFileSync(join(root, ".ai/implementation-progress.json")));
        assert.deepEqual(
          progress.events.map((e) => [e.task, e.status, e.timeoutMs]),
          [
            ["text", "started", 1000],
            ["text", "failed", 1000],
          ],
        );
        assert.equal(git("rev-parse", "HEAD"), merge);
        assert.equal(git("status", "--porcelain"), "");
        return;
      }
      run("tools/implement.mjs", null, extra);
      const progress = JSON.parse(readFileSync(join(root, ".ai/implementation-progress.json")));
      assert.deepEqual(
        progress.events.map((e) => [e.status, e.timeoutMs]),
        [
          ["started", 12000],
          ["completed", 12000],
        ],
      );
      assert.match(readFileSync(join(root, changedPath), "utf8"), /After/);
      if (mode === "web-docs") {
        put("docs/demo.md", "Updated frontend documentation\n");
        git("add", "docs/demo.md");
        git("commit", "-m", "Document frontend change");
      }
      put(".ai/gates.json", { status: "passed", gates: [] });
      run("tools/review-implementation.mjs", null, extra);
      const reportPath = join(root, ".ai/implementation-review.json");
      const report = JSON.parse(readFileSync(reportPath));
      for (const patch of [
        { blockingFindings: ["Must fix defect"] },
        { verdict: "fail" },
        { headCommit: "0".repeat(40) },
        { baseCommit: "0".repeat(40) },
        { observations: null },
      ]) {
        put(".ai/implementation-review.json", { ...report, ...patch });
        const blocked = spawnSync(
          process.execPath,
          [resolve("tools/github-delivery.mjs"), "publish-implementation"],
          { cwd: root, encoding: "utf8", env: { ...env, ...extra } },
        );
        assert.notEqual(blocked.status, 0);
        assert.equal(JSON.parse(readFileSync(join(sandbox, "state.json"))).prs.length, 1);
      }
      put(".ai/implementation-review.json", report);

      if (mode === "stale-main") {
        const concurrent = join(sandbox, "concurrent");
        execFileSync("git", ["clone", "--branch", "main", remote, concurrent], { stdio: "pipe" });
        const otherGit = (...args) => execFileSync("git", args, { cwd: concurrent, stdio: "pipe" });
        otherGit("config", "user.name", "Other");
        otherGit("config", "user.email", "other@example.invalid");
        writeFileSync(join(concurrent, "README.md"), "Concurrent update");
        otherGit("add", ".");
        otherGit("commit", "-m", "Concurrent update");
        otherGit("push", "origin", "main");
      }
      run("tools/github-delivery.mjs", "publish-implementation", extra);
      const state = JSON.parse(readFileSync(join(sandbox, "state.json")));
      assert.equal(state.prs.length, 2);
      assert.equal(state.ciDispatches, undefined, "Plan and Implement must not dispatch CI");
      if (!["frontend", "docs", "web-docs"].includes(mode)) {
        assert.equal(state.dispatch, undefined);
        assert.notEqual(
          git("ls-remote", "origin", "refs/heads/main").split(/\s/)[0],
          git("rev-parse", "HEAD"),
        );
        return;
      }
      assert.equal(state.dispatch.inputs.commit, git("rev-parse", "HEAD"));
      assert.equal(
        git("ls-remote", "origin", "refs/heads/main").split(/\s/)[0],
        state.dispatch.inputs.commit,
      );
      git("fetch", "origin");
      writeFileSync(eventPath, "{}");
      run("tools/github-delivery.mjs", "deploy-target", {
        TARGET_COMMIT: state.dispatch.inputs.commit,
        IMPLEMENTATION_PR: "2",
      });
      assert.match(
        readFileSync(output, "utf8"),
        new RegExp(`commit=${state.dispatch.inputs.commit}`),
      );
      run("tools/github-delivery.mjs", "deploy-target"); // manual redeploy of current main
      const rejectedTarget = (extra) => {
        const result = spawnSync(
          process.execPath,
          [resolve("tools/github-delivery.mjs"), "deploy-target"],
          {
            cwd: root,
            encoding: "utf8",
            env: { ...env, ...extra },
          },
        );
        assert.notEqual(result.status, 0);
        return result.stderr;
      };
      assert.match(rejectedTarget({ TARGET_COMMIT: state.dispatch.inputs.commit }), /Provide both/);
      git("update-ref", "refs/remotes/origin/main", base);
      assert.match(
        rejectedTarget({ TARGET_COMMIT: state.dispatch.inputs.commit, IMPLEMENTATION_PR: "2" }),
        /Main advanced/,
      );
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
