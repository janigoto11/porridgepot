import Ajv from "ajv";
import { readFileSync, existsSync, realpathSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
const ajv = new Ajv({ allErrors: true, strict: true });
for (const name of ["task", "plan", "review", "config", "platform", "plan-document"]) {
  ajv.addSchema(
    JSON.parse(readFileSync(new URL(`../schemas/${name}.schema.json`, import.meta.url))),
  );
}
export const readJSON = (path) => JSON.parse(readFileSync(path, "utf8"));
export function validate(name, value) {
  const check = ajv.getSchema(`${name}.schema.json`);
  if (!check || !check(value)) throw new Error(`${name}: ${ajv.errorsText(check?.errors)}`);
  return value;
}
export function repositoryPath(path, root = process.cwd()) {
  const base = realpathSync(root);
  const target = resolve(base, path);
  const rel = relative(base, existsSync(target) ? realpathSync(target) : target);
  if (isAbsolute(path) || rel === ".." || rel.startsWith("../") || isAbsolute(rel))
    throw new Error(`Path escapes repository: ${path}`);
  return target;
}
export function validatePlan(plan, root = process.cwd()) {
  validate("plan", plan);
  const ids = new Set(plan.map((t) => t.id));
  if (ids.size !== plan.length) throw new Error("Duplicate task ID");
  for (const task of plan) {
    const spec = repositoryPath(task.spec, root);
    if (!readFileSync(spec, "utf8").trim()) throw new Error("Empty specification");
    for (const path of [task.owner, ...task.allowedPaths]) repositoryPath(path, root);
    if (!task.allowedPaths.some((p) => task.owner === p || task.owner.startsWith(`${p}/`)))
      throw new Error(
        `Task ${task.id}: Owner outside allowedPaths: owner=${JSON.stringify(task.owner)}, allowedPaths=${JSON.stringify(task.allowedPaths)}. Owner must equal or be inside an allowed path; choose a narrower owner, do not broaden scope.`,
      );
    if (task.dependsOn.some((id) => !ids.has(id) || id === task.id))
      throw new Error("Unknown or self dependency");
  }
  const done = new Set(),
    visiting = new Set();
  function visit(task) {
    if (visiting.has(task.id)) throw new Error("Cyclic task dependencies");
    if (done.has(task.id)) return;
    visiting.add(task.id);
    task.dependsOn.forEach((id) => visit(plan.find((t) => t.id === id)));
    visiting.delete(task.id);
    done.add(task.id);
  }
  plan.forEach(visit);
  return plan;
}
export function loadConfig() {
  const config = validate("config", readJSON("harness/config.json"));
  const platform = validate("platform", readJSON("harness/platform.json"));
  const pkg = readJSON("package.json");
  for (const [name, check] of Object.entries(config.checks)) {
    if (check.script !== null && !pkg.scripts?.[check.script])
      throw new Error(`Missing ${name} script: ${check.script}`);
    if (["harness:check", "check"].includes(check.script))
      throw new Error("Recursive check configuration");
  }
  if (config.productionDeployScript && !pkg.scripts?.[config.productionDeployScript])
    throw new Error("Missing production deploy script");
  if (!config.planner.adapter || !config.planner.model)
    throw new Error("Planner provider requires adapter and model");
  if (config.planner.adapter) repositoryPath(config.planner.adapter);
  if (config.review.adapter) repositoryPath(config.review.adapter);
  return { config, platform, pkg };
}
