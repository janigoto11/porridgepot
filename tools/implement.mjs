import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { ask } from "../harness/adapters/claude-code.mjs";
import { validateDocument } from "../harness/lib/planning.mjs";
import { loadConfig } from "../harness/lib/validate.mjs";
import { readSourceContext } from "../harness/lib/context.mjs";
import { readSpec } from "../harness/lib/specs.mjs";
import { git, taskOrder, applyFiles } from "../harness/lib/delivery.mjs";
const plan = validateDocument(JSON.parse(readFileSync(process.env.PLAN_PATH, "utf8")));
const { config } = loadConfig();
const done = [];
const progress = [];
mkdirSync(".ai", { recursive: true });
function record(task, status, extra = {}) {
  progress.push({
    task: task.id,
    status,
    timeoutMs: config.implementation.timeoutMs,
    at: new Date().toISOString(),
    ...extra,
  });
  writeFileSync(
    ".ai/implementation-progress.json",
    JSON.stringify({ plan: process.env.PLAN_PATH, events: progress }, null, 2) + "\n",
  );
}

for (const task of taskOrder(plan.tasks)) {
  const baseCommit = git("rev-parse", "HEAD");
  const sourceContext = readSourceContext({
    root: process.cwd(),
    baseCommit,
    spec: readSpec(plan.spec),
    contextPaths: config.planner.contextPaths,
    maxContextBytes: config.planner.maxContextBytes,
  });
  console.log(`Implementing ${task.id}; Claude timeout ${config.implementation.timeoutMs / 1000}s`);
  record(task, "started");
  const started = Date.now();
  try {
    const result = ask({
      timeoutMs: config.implementation.timeoutMs,
      model: config.planner.model,
      prompt: readFileSync("harness/prompts/implementer.md", "utf8"),
      data: { plan, task, sourceContext, spec: readSpec(plan.spec) },
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["summary", "files"],
        properties: {
          summary: { type: "string" },
          files: {
            type: "array",
            minItems: 1,
            maxItems: 20,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["path", "content"],
              properties: { path: { type: "string" }, content: { type: ["string", "null"] } },
            },
          },
        },
      },
    });
    applyFiles(result.files, task.allowedPaths);
    const written = result.files.filter((f) => f.content !== null).map((f) => f.path);
    if (written.length)
      execFileSync("npm", ["exec", "--", "oxfmt", ...written], { stdio: "inherit" });
    git("add", "--", ...result.files.map((f) => f.path));
    if (git("diff", "--cached", "--name-only"))
      git("commit", "-m", `Implement ${plan.id}: ${task.id}`);
    done.push({ task: task.id, summary: result.summary });
    record(task, "completed", {
      elapsedMs: Date.now() - started,
      commit: git("rev-parse", "HEAD"),
    });
    console.log(`Completed ${task.id}`);
  } catch (error) {
    record(task, "failed", { elapsedMs: Date.now() - started });
    throw new Error(
      `Implementation task ${task.id} failed (timeout limit ${config.implementation.timeoutMs / 1000}s)`,
      { cause: error },
    );
  }
}
mkdirSync(".ai", { recursive: true });
writeFileSync(
  ".ai/implementation.json",
  JSON.stringify({ plan: process.env.PLAN_PATH, tasks: done }, null, 2),
);
