import { readFileSync, appendFileSync } from "node:fs";
import { selectSpecs } from "../harness/lib/specs.mjs";
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const rewritten = process.env.GITHUB_EVENT_NAME === "push" && event.forced === true;
const specs = selectSpecs({
  eventName: process.env.GITHUB_EVENT_NAME,
  event,
  explicitSpec: process.env.SPEC_PATH,
});
if (process.env.GITHUB_OUTPUT)
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `specs=${JSON.stringify(specs)}\nhas-specs=${specs.length > 0}\n`,
  );
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `## Spec selection\n${specs.length ? specs.map((s) => `- ${s.path}`).join("\n") : rewritten ? "History was rewritten (force-push). Automatic planning skipped. Use Run workflow with an explicit spec path if planning is intended." : "No added or modified numbered Markdown specs. Planning skipped."}\n`,
  );
console.log(JSON.stringify(specs));
