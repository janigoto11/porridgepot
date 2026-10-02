import { readFileSync, writeFileSync } from "node:fs";
import { ask } from "../harness/adapters/claude-code.mjs";
import { git } from "../harness/lib/delivery.mjs";
import { loadConfig } from "../harness/lib/validate.mjs";
const base = process.env.BASE_SHA;
if (!/^[a-f0-9]{40}$/.test(base || "")) throw new Error("Missing base commit");
const plan = JSON.parse(readFileSync(process.env.PLAN_PATH, "utf8"));
const gates = JSON.parse(readFileSync(".ai/gates.json", "utf8"));
if (gates.status !== "passed") throw new Error("Deterministic gates must pass before review");
if (git("status", "--porcelain", "--untracked-files=no"))
  throw new Error("Uncommitted implementation changes");
const review = ask({
  model: loadConfig().config.planner.model,
  prompt: readFileSync("harness/prompts/delivery-reviewer.md", "utf8"),
  data: {
    plan,
    spec: readFileSync(plan.spec, "utf8"),
    diff: git("diff", "--no-ext-diff", base, "HEAD"),
    gates,
  },
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["verdict", "summary", "findings"],
    properties: {
      verdict: { enum: ["pass", "fail"] },
      summary: { type: "string" },
      findings: { type: "array", items: { type: "string" } },
    },
  },
});
writeFileSync(
  ".ai/implementation-review.json",
  JSON.stringify({ ...review, baseCommit: base, headCommit: git("rev-parse", "HEAD") }, null, 2),
);
if (review.verdict !== "pass" || review.findings.length)
  throw new Error("AI review blocked implementation");
