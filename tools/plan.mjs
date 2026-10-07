import { mkdir, writeFile, rm, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../harness/lib/validate.mjs";
import { generatePlan } from "../harness/lib/planning.mjs";
import { readSpec } from "../harness/lib/specs.mjs";
export { validatePlan } from "../harness/lib/validate.mjs";
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = await lstat(".ai").catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
  if (output && !output.isDirectory()) throw new Error(".ai must be a regular directory");
  // These are generated run artifacts only. Remove stale success evidence before planning.
  for (const path of [
    ".ai/plan.json",
    ".ai/tasks.json",
    ".ai/tasks",
    ".ai/results",
    ".ai/review.json",
    ".ai/review-request.json",
  ])
    await rm(path, { recursive: true, force: true });
  const path = process.argv[2] || process.env.SPEC_PATH;
  if (!path) throw new Error("Usage: npm run ai:plan -- specs/0002-feature.md (or set SPEC_PATH)");
  const { config, platform } = loadConfig();
  const plan = await generatePlan({ path, config, platform });
  const spec = readSpec(path);
  await mkdir(".ai/tasks", { recursive: true });
  for (const task of plan.tasks)
    await writeFile(
      `.ai/tasks/${task.id}.md`,
      `# ${task.id}\n\n${JSON.stringify(task, null, 2)}\n\n## Specification\n\n${spec.content}`,
    );
  await writeFile(".ai/tasks.json", JSON.stringify(plan.tasks, null, 2) + "\n");
  await writeFile(".ai/plan.json", JSON.stringify(plan, null, 2) + "\n");
  console.log(
    `Plan ${plan.id}: ${plan.tasks.length} tasks from ${path}; provider=${plan.planner.provider}. No implementation performed.`,
  );
}
