import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { git, changedFiles, frontendOnly, renderPlan } from "../harness/lib/delivery.mjs";
import { validateDocument } from "../harness/lib/planning.mjs";
const repo = process.env.GITHUB_REPOSITORY;
if (!/^[\w.-]+\/[\w.-]+$/.test(repo || "")) throw new Error("Invalid repository");
const api = (path, method = "GET", data) =>
  JSON.parse(
    execFileSync(
      "gh",
      ["api", `repos/${repo}/${path}`, "--method", method, ...(data ? ["--input", "-"] : [])],
      { input: data ? JSON.stringify(data) : undefined, encoding: "utf8" },
    ) || "null",
  );
function dispatchCI(branch, commit) {
  api("actions/workflows/ci.yml/dispatches", "POST", { ref: branch, inputs: { commit } });
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `CI dispatched for ${commit} on ${branch}.\n`);
}
const output = (key, value) => appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
const push = (ref) => {
  // Credential exists only for this process, never in .git/config or model environment.
  const auth = Buffer.from(`x-access-token:${process.env.GH_TOKEN}`).toString("base64");
  execFileSync("git", ["push", "origin", ref], {
    stdio: "pipe",
    env: {
      ...process.env,
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
      GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${auth}`,
    },
  });
};
function mergedPR(event, prefix) {
  const pr = event.pull_request;
  if (
    !pr?.merged ||
    pr.base.ref !== "main" ||
    pr.head.repo.full_name !== repo ||
    !pr.head.ref.startsWith(prefix)
  )
    throw new Error("Not an eligible merged PR");
  return pr;
}
function planFiles(pr) {
  const files = api(`pulls/${pr.number}/files?per_page=100`);
  if (files.length !== 2 || files.some((f) => f.status !== "added"))
    throw new Error("Plan PR must only add a JSON plan and its Markdown rendering");
  const path = files.find((f) => /^plans\/\d{4}-[a-f0-9]{40}\.json$/.test(f.filename))?.filename;
  if (!path || !files.some((f) => f.filename === path.replace(/\.json$/, ".md")))
    throw new Error("Invalid plan files");
  const plan = validateDocument(JSON.parse(readFileSync(path, "utf8")));
  if (
    path !== `plans/${plan.id}-${plan.baseCommit}.json` ||
    pr.head.ref !== `plan/${plan.id}-${plan.baseCommit}`
  )
    throw new Error("Plan identity mismatch");
  if (readFileSync(path.replace(/\.json$/, ".md"), "utf8") !== renderPlan(plan))
    throw new Error("Plan Markdown must match JSON");
  git("merge-base", "--is-ancestor", plan.baseCommit, "HEAD");
  const unrelated = changedFiles(plan.baseCommit).filter((p) => !p.startsWith("plans/"));
  if (unrelated.length)
    throw new Error("Source changed since planning; regenerate the plan against current main");
  return path;
}
const command = process.argv[2];
if (command === "publish-plan") {
  const plan = validateDocument(JSON.parse(readFileSync(".ai/plan.json", "utf8")), {
    expectedCommit: git("rev-parse", "HEAD"),
  });
  const branch = `plan/${plan.id}-${plan.baseCommit}`;
  const existing = api(
    `pulls?state=all&head=${encodeURIComponent(repo.split("/")[0] + ":" + branch)}`,
  );
  if (existing.length)
    throw new Error("Plan PR already exists; inspect it instead of replacing reviewed content");
  const path = `plans/${plan.id}-${plan.baseCommit}.json`;
  mkdirSync("plans", { recursive: true });
  writeFileSync(path, JSON.stringify(plan, null, 2) + "\n");
  writeFileSync(path.replace(/\.json$/, ".md"), renderPlan(plan));
  git("switch", "-c", branch);
  git("add", "--", path, path.replace(/\.json$/, ".md"));
  git("commit", "-m", `Plan ${plan.id}`);
  push(`HEAD:refs/heads/${branch}`);
  const pr = api("pulls", "POST", {
    head: branch,
    base: "main",
    title: `Plan ${plan.id}`,
    body: `Review the Markdown plan and JSON contract. Merge starts implementation.\n\nSpec: ${plan.spec}\nBase: ${plan.baseCommit}`,
  });
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Plan PR: ${pr.html_url}\n`);
  dispatchCI(branch, git("rev-parse", "HEAD"));
} else if (command === "prepare") {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const pr = mergedPR(event, "plan/");
  if (git("rev-parse", "HEAD") !== pr.merge_commit_sha)
    throw new Error("Checkout does not match plan merge");
  const path = planFiles(pr);
  const branch = `implement/${pr.number}`;
  const existing = api(
    `pulls?state=all&head=${encodeURIComponent(repo.split("/")[0] + ":" + branch)}`,
  );
  if (existing.length) throw new Error("Implementation PR already exists; no duplicate run");
  git("switch", "-c", branch);
  output("plan", path);
  output("branch", branch);
  output("base", git("rev-parse", "HEAD"));
} else if (command === "publish-implementation") {
  const base = process.env.BASE_SHA;
  if (!/^[a-f0-9]{40}$/.test(base || "")) throw new Error("Invalid base commit");
  if (git("status", "--porcelain", "--untracked-files=no")) throw new Error("Uncommitted changes");
  const gates = JSON.parse(readFileSync(".ai/gates.json", "utf8"));
  if (gates.status !== "passed") throw new Error("Deterministic gates did not pass");
  const paths = changedFiles(base);
  if (!paths.length) throw new Error("No implementation changes");
  const review = JSON.parse(readFileSync(".ai/implementation-review.json", "utf8"));
  const head = git("rev-parse", "HEAD");
  if (
    review.verdict !== "pass" ||
    review.findings.length ||
    review.baseCommit !== base ||
    review.headCommit !== head
  )
    throw new Error("Review provenance mismatch");
  const branch = git("branch", "--show-current");
  if (!/^implement\/\d+$/.test(branch)) throw new Error("Invalid implementation branch");
  push(`HEAD:refs/heads/${branch}`);
  const eligible = frontendOnly(paths);
  const pr = api("pulls", "POST", {
    head: branch,
    base: "main",
    title: `Implement plan PR #${branch.split("/")[1]}`,
    body: `Plan: ${process.env.PLAN_PATH}\n\nDeterministic checks and AI review passed for ${head}.\n\n${review.summary}\n\nAutomatic frontend rule: ${eligible ? "eligible" : "human merge required"}.\n\nEvidence: https://github.com/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`,
  });
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Implementation PR: ${pr.html_url}\n`);
  dispatchCI(branch, head);
  if (eligible && api("git/ref/heads/main").object.sha === base) {
    // Fast-forward only: a concurrent main change makes the push fail, never overwrites it.
    git("merge-base", "--is-ancestor", base, head);
    push("HEAD:refs/heads/main");
    api("actions/workflows/deploy.yml/dispatches", "POST", {
      ref: "main",
      inputs: { commit: head, implementation_pr: String(pr.number) },
    });
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      "Frontend change merged automatically; synth workflow dispatched.\n",
    );
  } else
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      "PR awaits human merge (non-frontend change or main advanced).\n",
    );
} else if (command === "deploy-target") {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const pr = event.pull_request
    ? mergedPR(event, "implement/")
    : api(`pulls/${Number(process.env.IMPLEMENTATION_PR)}`);
  if (
    !pr.merged ||
    pr.base.ref !== "main" ||
    pr.head.repo.full_name !== repo ||
    !/^implement\/\d+$/.test(pr.head.ref)
  )
    throw new Error("Deploy requires a merged implementation PR");
  const sha = pr.merge_commit_sha;
  if (
    !/^[a-f0-9]{40}$/.test(sha) ||
    (process.env.TARGET_COMMIT && process.env.TARGET_COMMIT !== sha)
  )
    throw new Error("Deploy commit mismatch");
  git("merge-base", "--is-ancestor", sha, "origin/main");
  output("commit", sha);
} else throw new Error("Unknown delivery command");
