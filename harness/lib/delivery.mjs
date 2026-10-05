import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
export const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 4000000 }).trim();
export function taskOrder(tasks) {
  const ordered = [],
    done = new Set();
  while (ordered.length < tasks.length) {
    const next = tasks.find((t) => !done.has(t.id) && t.dependsOn.every((id) => done.has(id)));
    if (!next) throw new Error("Invalid task dependency graph");
    ordered.push(next);
    done.add(next.id);
  }
  return ordered;
}
export function allowedFile(path, allowedPaths) {
  return (
    /^(apps|infra|tests|docs)\/[A-Za-z0-9_./-]+$/.test(path) &&
    !path.split("/").some((p) => !p || p === "." || p === ".." || p.startsWith(".")) &&
    allowedPaths.some((p) => path === p || path.startsWith(p + "/"))
  );
}
export function applyFiles(files, allowedPaths) {
  if (!files.length || new Set(files.map((f) => f.path)).size !== files.length)
    throw new Error("Empty or duplicate change set");
  for (const f of files) {
    if (!allowedFile(f.path, allowedPaths)) throw new Error(`Forbidden change: ${f.path}`);
    let cursor = "";
    for (const part of f.path.split("/")) {
      cursor = cursor ? cursor + "/" + part : part;
      if (lstatSync(cursor, { throwIfNoEntry: false })?.isSymbolicLink())
        throw new Error("Symlink writes forbidden");
    }
    if (f.content !== null && Buffer.byteLength(f.content) > 100000)
      throw new Error("File too large");
  }
  for (const f of files) {
    if (f.content === null) unlinkSync(f.path);
    else {
      mkdirSync(dirname(f.path), { recursive: true });
      writeFileSync(f.path, f.content);
    }
  }
}
export function autoMergeEligible(paths) {
  return (
    paths.length > 0 &&
    paths.every(
      (p) =>
        (p.startsWith("apps/web/") || p.startsWith("docs/")) &&
        allowedFile(p, ["apps/web", "docs"]),
    )
  );
}
export function changedFiles(base, head = "HEAD") {
  return git("diff", "--no-renames", "--name-only", "-z", base, head).split("\0").filter(Boolean);
}
export function renderPlan(plan) {
  return (
    `# Toteutussuunnitelma ${plan.id}\n\nSpeksi: ${plan.spec}\n\nLähtöcommit: ${plan.baseCommit}\n\n` +
    plan.tasks
      .map(
        (t) =>
          `## ${t.id}\n\n${t.description}\n\nVastuualue: ${t.owner}\n\nSallitut polut: ${t.allowedPaths.join(", ")}\n\nRiippuvuudet: ${t.dependsOn.join(", ") || "Ei riippuvuuksia"}\n\nHyväksymiskriteerit:\n${t.acceptanceCriteria.map((a) => "- " + a).join("\n")}\n`,
      )
      .join("\n")
  );
}
