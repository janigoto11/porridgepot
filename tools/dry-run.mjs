import { readFile, mkdir, writeFile } from "node:fs/promises";
import { readRunPlan } from "../harness/lib/planning.mjs";
const tasks = readRunPlan().tasks;
const task = tasks.find((task) => task.id === process.env.TASK_ID);
if (!task) throw new Error("TASK_ID must match a task in .ai/tasks.json");
await readFile(`.ai/tasks/${task.id}.md`, "utf8");
await mkdir(".ai/results", { recursive: true });
await writeFile(
  `.ai/results/${task.id}.json`,
  JSON.stringify(
    { id: task.id, status: "assignment-verified", implementationPerformed: false },
    null,
    2,
  ),
);
console.log(`Assignment verified: ${task.id}. Implementation agent is not configured.`);
