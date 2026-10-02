import { readFile, readdir } from "node:fs/promises";
import { readRunPlan } from "../harness/lib/planning.mjs";
const tasks = readRunPlan().tasks;
const files = await readdir(".ai/results");
if (files.length !== tasks.length) throw new Error("Unexpected result count");
for (const task of tasks) {
  const result = JSON.parse(await readFile(`.ai/results/${task.id}.json`, "utf8"));
  if (
    result.id !== task.id ||
    result.status !== "assignment-verified" ||
    result.implementationPerformed !== false
  )
    throw new Error(`Invalid result for ${task.id}`);
}
console.log(
  "Every task received exactly one result. Dry run only; no code was generated or merged.",
);
