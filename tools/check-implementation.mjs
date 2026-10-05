import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync } from "node:fs";
import { ask } from "../harness/adapters/claude-code.mjs";
import { loadConfig } from "../harness/lib/validate.mjs";
import { validateDocument } from "../harness/lib/planning.mjs";
import { readSourceContext } from "../harness/lib/context.mjs";
import { readSpec } from "../harness/lib/specs.mjs";
import { applyFiles, git } from "../harness/lib/delivery.mjs";
import { fileResponseSchema } from "../harness/lib/file-response.mjs";

const plan = validateDocument(JSON.parse(readFileSync(process.env.PLAN_PATH, "utf8")));
const { config } = loadConfig();
const maxRepairs = config.implementation.maxRepairAttempts ?? 2;
const allowedPaths = [...new Set(plan.tasks.flatMap((task) => task.allowedPaths))];
const events = [];
mkdirSync(".ai", { recursive: true });
const save = () =>
  writeFileSync(
    ".ai/repair-progress.json",
    JSON.stringify({ plan: process.env.PLAN_PATH, maxRepairs, events }, null, 2) + "\n",
  );
const checkEnv = { ...process.env, AWS_EC2_METADATA_DISABLED: "true" };
for (const key of ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY", "GH_TOKEN", "GITHUB_TOKEN"])
  delete checkEnv[key];

for (let attempt = 0; attempt <= maxRepairs; attempt++) {
  if (git("status", "--porcelain", "--untracked-files=no"))
    throw new Error("Uncommitted changes before checks");
  const headCommit = git("rev-parse", "HEAD");
  const logPath = `.ai/check-${attempt}.log`;
  writeFileSync(".ai/gates.json", JSON.stringify({ status: "failed", gates: [] }));
  console.log(
    `Checking implementation (repair attempts used: ${attempt}/${maxRepairs}); log: ${logPath}`,
  );
  const fd = openSync(logPath, "w");
  let checked;
  try {
    checked = spawnSync("npm", ["run", "check"], {
      env: checkEnv,
      stdio: ["ignore", fd, fd],
      timeout: 600000,
    });
  } finally {
    closeSync(fd);
  }
  const log = readFileSync(logPath, "utf8");
  const diagnostics = log.slice(-64000);
  console.log(diagnostics);
  const gates = JSON.parse(readFileSync(".ai/gates.json", "utf8"));
  writeFileSync(`.ai/gates-${attempt}.json`, JSON.stringify(gates, null, 2));
  const passed = !checked.error && checked.status === 0 && gates.status === "passed";
  events.push({ attempt, headCommit, status: passed ? "passed" : "failed", logPath });
  save();
  if (
    git("status", "--porcelain", "--untracked-files=no") ||
    git("rev-parse", "HEAD") !== headCommit
  )
    throw new Error("Checks modified tracked source or HEAD");
  if (passed) break;
  if (checked.error || checked.signal || checked.status === 0)
    throw new Error("Check execution failed or gate report missing; no model retry");
  if (attempt === maxRepairs)
    throw new Error(`Checks still failing after ${maxRepairs} repair attempts`);
  const event = { repair: attempt + 1, status: "started" };
  events.push(event);
  save();
  try {
    const spec = readSpec(plan.spec);
    const sourceContext = readSourceContext({
      root: process.cwd(),
      baseCommit: headCommit,
      spec,
      contextPaths: config.planner.contextPaths,
      maxContextBytes: config.planner.maxContextBytes,
    });
    const result = ask({
      model: config.planner.model,
      timeoutMs: config.implementation.timeoutMs,
      prompt: readFileSync("harness/prompts/repairer.md", "utf8"),
      data: { plan, spec, sourceContext, allowedPaths, diagnostics, gates, attempt: attempt + 1 },
      schema: fileResponseSchema,
    });
    applyFiles(result.files, allowedPaths);
    const written = result.files.filter((file) => file.content !== null).map((file) => file.path);
    if (written.length)
      execFileSync("npm", ["exec", "--", "oxfmt", ...written], { env: checkEnv, stdio: "inherit" });
    git("add", "--", ...result.files.map((file) => file.path));
    if (!git("diff", "--cached", "--name-only")) throw new Error("Repair made no changes");
    git("commit", "-m", `Repair ${plan.id}: attempt ${attempt + 1}`);
    event.status = "completed";
    event.headCommit = git("rev-parse", "HEAD");
  } catch (error) {
    event.status = "failed";
    throw error;
  } finally {
    save();
  }
}
