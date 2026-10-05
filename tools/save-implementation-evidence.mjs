import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, lstatSync } from "node:fs";
import { dirname } from "node:path";
import { allowedFile, git } from "../harness/lib/delivery.mjs";
const base = process.env.BASE_SHA;
if (!/^[a-f0-9]{40}$/.test(base || "")) throw new Error("Missing evidence base commit");
mkdirSync(".ai", { recursive: true });
const roots = ["apps", "infra", "tests", "docs"];
// Includes committed, staged and unstaged tracked changes, with exact patch bytes.
writeFileSync(
  ".ai/implementation.patch",
  execFileSync("git", ["diff", "--binary", "--no-ext-diff", base, "--", ...roots], {
    maxBuffer: 20000000,
  }),
);
const untracked = git("ls-files", "--others", "--exclude-standard", "-z", "--", ...roots)
  .split("\0")
  .filter(Boolean);
const saved = [];
for (const path of untracked) {
  if (!allowedFile(path, roots) || !lstatSync(path).isFile()) continue;
  const destination = `.ai/untracked/${path}`;
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, readFileSync(path));
  saved.push(path);
}
writeFileSync(
  ".ai/source-state.json",
  JSON.stringify(
    { baseCommit: base, headCommit: git("rev-parse", "HEAD"), untrackedFiles: saved },
    null,
    2,
  ) + "\n",
);
