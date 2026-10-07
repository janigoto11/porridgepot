import { renderPlan } from "./delivery.mjs";
import { readSourceContext } from "./context.mjs";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { readSpec } from "./specs.mjs";
import { validate, validatePlan, repositoryPath, readJSON } from "./validate.mjs";
export function currentCommit(root = process.cwd()) {
  const sha =
    process.env.GITHUB_SHA ||
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Planning requires a Git commit");
  return sha;
}
export function validateDocument(
  plan,
  { root = process.cwd(), expectedCommit, expectedSpec } = {},
) {
  validate("plan-document", plan);
  const spec = readSpec(plan.spec, root);
  if (plan.id !== spec.id || plan.specDigest !== spec.specDigest)
    throw new Error("Plan does not match current spec content");
  if (expectedSpec && plan.spec !== expectedSpec) throw new Error("Plan belongs to another spec");
  if (expectedCommit && plan.baseCommit !== expectedCommit)
    throw new Error("Plan belongs to another commit");
  validatePlan(plan.tasks, root);
  if (plan.tasks.some((task) => task.spec !== plan.spec))
    throw new Error("Every task must reference the selected spec");
  return plan;
}
export function readRunPlan(root = process.cwd()) {
  const plan = validateDocument(readJSON(repositoryPath(".ai/plan.json", root)), {
    root,
    expectedCommit: currentCommit(root),
  });
  const tasks = readJSON(repositoryPath(".ai/tasks.json", root));
  if (JSON.stringify(tasks) !== JSON.stringify(plan.tasks))
    throw new Error("Task artifact does not match selected plan");
  return plan;
}
export async function generatePlan({
  path,
  config,
  platform,
  root = process.cwd(),
  baseCommit = currentCommit(root),
}) {
  const spec = readSpec(path, root);
  const planner = config.planner;
  const request = {
    schemaVersion: 1,
    spec,
    baseCommit,
    platform,
    prompt: readFileSync(repositoryPath("harness/prompts/planner.md", root), "utf8"),
    planner,
    sourceContext: readSourceContext({
      root,
      baseCommit,
      spec,
      contextPaths: planner.contextPaths,
      maxContextBytes: planner.maxContextBytes,
    }),
    taskSchema: readJSON(repositoryPath("harness/schemas/task.schema.json", root)),
  };
  if (!planner.adapter || !planner.model) throw new Error("Configure planner adapter and model");
  const module = await import(pathToFileURL(repositoryPath(planner.adapter, root)));
  if (typeof module.plan !== "function")
    throw new Error("Planner adapter must export async plan(request)");
  const tasks = await module.plan(request);
  const plan = {
    schemaVersion: 1,
    id: spec.id,
    spec: spec.path,
    specDigest: spec.specDigest,
    baseCommit,
    planner: { provider: planner.provider, model: planner.model || "none" },
    tasks,
  };
  return validateDocument(plan, { root, expectedCommit: baseCommit, expectedSpec: path });
}
export function validateStoredPlans(root = process.cwd()) {
  const directory = repositoryPath("plans", root);
  if (existsSync(directory))
    for (const name of readdirSync(directory).filter((n) => n.endsWith(".json"))) {
      const plan = validate("plan-document", readJSON(repositoryPath(`plans/${name}`, root)));
      if (name !== `${plan.id}-${plan.baseCommit}.json`) throw new Error("Plan filename mismatch");
      if (
        readFileSync(repositoryPath(`plans/${name.replace(/\.json$/, ".md")}`, root), "utf8") !==
        renderPlan(plan)
      )
        throw new Error("Plan rendering mismatch");
    }
  for (const name of readdirSync(repositoryPath("specs", root))) {
    if (!/^\d{4}-plan\.json$/.test(name)) continue;
    const value = readJSON(repositoryPath(`specs/${name}`, root));
    if (Array.isArray(value)) validatePlan(value, root);
    else validateDocument(value, { root });
  }
}
