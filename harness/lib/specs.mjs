import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
export const specPattern = /^specs\/(\d{4})-[a-z][a-z0-9-]*\.md$/;
export const digest = (value) => createHash("sha256").update(value).digest("hex");
export function listSpecs(root = process.cwd()) {
  const paths = readdirSync(join(root, "specs"))
    .map((name) => `specs/${name}`)
    .filter((path) => specPattern.test(path))
    .sort();
  const ids = new Set();
  for (const path of paths) {
    const id = path.match(specPattern)[1];
    if (ids.has(id)) throw new Error(`Duplicate spec ID: ${id}`);
    ids.add(id);
  }
  return paths;
}
export function readSpec(path, root = process.cwd()) {
  if (!specPattern.test(path) || !listSpecs(root).includes(path))
    throw new Error(`Unknown or unsafe spec: ${path}`);
  if (lstatSync(join(root, "specs")).isSymbolicLink() || !lstatSync(join(root, path)).isFile())
    throw new Error("Specs must be regular repository files");
  const content = readFileSync(join(root, path), "utf8");
  if (!content.trim() || Buffer.byteLength(content) > 100_000)
    throw new Error("Spec must contain 1-100000 bytes");
  return { id: path.match(specPattern)[1], path, content, specDigest: digest(content) };
}
export function selectSpecs({ eventName, event, explicitSpec, root = process.cwd() }) {
  let paths;
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (eventName === "workflow_dispatch") {
    if (!explicitSpec) throw new Error("Select a spec path for a manual run");
    paths = [explicitSpec];
  } else if (eventName === "push") {
    if (event.deleted) return [];
    if (![event.before, event.after].every((sha) => /^[a-f0-9]{40}$/.test(sha || "")))
      throw new Error("Invalid push commit range");
    if (git("rev-parse", "HEAD").trim() !== event.after)
      throw new Error("Checkout must match push.after");
    try {
      paths = (
        event.before === "0".repeat(40)
          ? git("ls-tree", "-r", "--name-only", "-z", event.after, "--", "specs/")
          : git(
              "diff",
              "--no-renames",
              "--diff-filter=AM",
              "--name-only",
              "-z",
              event.before,
              event.after,
              "--",
              "specs/",
            )
      )
        .split("\0")
        .filter((path) => specPattern.test(path));
    } catch (error) {
      throw new Error(
        "Cannot compare push commits; fetch full history or run manually with a spec path",
        { cause: error },
      );
    }
  } else throw new Error("Only push and workflow_dispatch are supported");
  paths = [...new Set(paths)].sort();
  if (paths.length > 16)
    throw new Error("At most 16 specs per run; split the push or select one manually");
  return paths.map((path) => {
    const { id } = readSpec(path, root);
    return { id, path };
  });
}
