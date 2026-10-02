import { validateStoredPlans, readRunPlan } from "./lib/planning.mjs";
import { listSpecs, readSpec } from "./lib/specs.mjs";
import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { loadConfig, readJSON, validate, repositoryPath } from "./lib/validate.mjs";
import { assertReview } from "./lib/review.mjs";
const command = process.argv[2];
if (command === "check") save("gates", { status: "failed", gates: [] });
const { config, platform, pkg } = loadConfig();
function save(name, value) {
  mkdirSync(".ai", { recursive: true });
  writeFileSync(`.ai/${name}.json`, JSON.stringify(value, null, 2) + "\n");
}
function run(script) {
  const result = spawnSync("npm", ["run", script], {
    stdio: "inherit",
    env: { ...process.env, AWS_EC2_METADATA_DISABLED: "true" },
  });
  if (result.error || result.status !== 0) throw new Error(`Failed script: ${script}`);
}
function architecture() {
  for (const path of platform.requiredPaths)
    if (!existsSync(repositoryPath(path))) throw new Error(`Missing required path: ${path}`);
  const dependencies = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.optionalDependencies,
    ...pkg.peerDependencies,
  };
  for (const dep of platform.forbiddenDependencies)
    if (dep in dependencies) throw new Error(`Forbidden dependency: ${dep}`);
  // Literal import/require rules are a lightweight policy check, not a JS sandbox.
  function walk(dir) {
    for (const item of readdirSync(repositoryPath(dir), { withFileTypes: true })) {
      const path = join(dir, item.name);
      if (item.isSymbolicLink()) throw new Error(`Symlink in source roots: ${path}`);
      if (item.isDirectory()) walk(path);
      else if (/\.(?:m?js|cjs|jsx|tsx?|json)$/.test(path) && !path.startsWith("harness/")) {
        const source = readFileSync(path, "utf8");
        for (const match of source.matchAll(
          /(?:from\s*|import\s*\(?\s*|require\s*\(\s*)['"]([^'"]+)['"]/g,
        )) {
          if (platform.forbiddenImports.some((p) => match[1] === p || match[1].startsWith(`${p}/`)))
            throw new Error(`Forbidden import ${match[1]} in ${path}`);
        }
      }
    }
  }
  platform.sourceRoots.forEach(walk);
}
if (command === "validate" || command === "check") {
  listSpecs().forEach((path) => readSpec(path));
  validateStoredPlans();
  architecture();
  const report = {
    status: "passed",
    gates: [
      { name: "schema/config", status: "passed" },
      { name: "architecture/dependency", status: "passed" },
    ],
  };
  if (command === "check") {
    for (const [name, check] of Object.entries(config.checks)) {
      if (check.script === null) {
        console.log(`SKIP ${name}: ${check.reason}`);
        report.gates.push({ name, status: "skipped", reason: check.reason });
      } else {
        try {
          run(check.script);
          report.gates.push({ name, status: "passed" });
        } catch (error) {
          report.status = "failed";
          report.gates.push({ name, status: "failed" });
          save("gates", report);
          throw error;
        }
      }
    }
    save("gates", report);
  }
  console.log("Harness deterministic validation passed.");
} else if (command === "review") {
  const scope = process.argv[3] || "assignment";
  if (!["assignment", "production"].includes(scope)) throw new Error("Invalid review scope");
  const plan = readRunPlan();
  const tasks = plan.tasks;
  const gates = readJSON(".ai/gates.json");
  if (gates.status !== "passed") throw new Error("Deterministic gates must pass first");
  const sourceRevision =
    process.env.GITHUB_SHA ||
    spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout?.trim() ||
    "local-unversioned";
  if (
    scope === "production" &&
    (!/^[a-f0-9]{40,64}$/.test(sourceRevision) || process.env.GITHUB_ACTIONS !== "true")
  )
    throw new Error("Production review requires a GitHub commit context");
  const request = {
    schemaVersion: 1,
    scope,
    sourceRevision,
    tasks,
    plan,
    gates,
    config,
    platform,
    instruction: readFileSync("harness/prompts/reviewer.md", "utf8"),
  };
  const requestDigest = createHash("sha256").update(JSON.stringify(request)).digest("hex");
  save("review-request", { ...request, requestDigest });
  let review;
  if (!config.review.adapter) {
    review = {
      schemaVersion: 1,
      sourceRevision,
      requestDigest,
      scope,
      provider: "unconfigured",
      model: "none",
      status: "not_configured",
      summary: "No AI review performed. Assignment dry run only; production is blocked.",
      findings: [],
    };
  } else {
    if (config.review.provider === "unconfigured" || !config.review.model)
      throw new Error("Configure provider and model");
    const adapter = await import(pathToFileURL(repositoryPath(config.review.adapter)));
    review = await adapter.review({ ...request, requestDigest });
  }
  validate("review", review);
  save("review", review);
  assertReview(review, {
    scope,
    sourceRevision,
    requestDigest,
    provider: config.review.provider,
    model: config.review.model || "none",
  });
  console.log(`AI review: ${review.status}`);
} else if (command === "production-ready") {
  if (!config.productionDeployScript)
    throw new Error(
      "Production deployment is not configured. Add an isolated production stack and npm script first.",
    );
  if (!config.review.adapter) throw new Error("Production requires a configured review adapter");
} else if (command === "deploy-production") {
  if (!config.productionDeployScript) throw new Error("Production deployment not configured");
  if (process.env.GITHUB_ACTIONS !== "true")
    throw new Error("Use the protected deployment workflow");
  run(config.productionDeployScript);
} else
  throw new Error(
    "Usage: node harness/cli.mjs validate|check|review [assignment|production]|production-ready|deploy-production",
  );
