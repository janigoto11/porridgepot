import { execFileSync } from "node:child_process";
import { digest } from "./specs.mjs";
export function readSourceContext({ root, baseCommit, spec, contextPaths, maxContextBytes }) {
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 2_000_000 });
  if (digest(git("show", `${baseCommit}:${spec.path}`)) !== spec.specDigest)
    throw new Error(
      "Commit the selected spec before planning; working spec differs from baseCommit",
    );
  const files = git("ls-tree", "-r", "-z", baseCommit)
    .split("\0")
    .filter(Boolean)
    .map((record) => {
      const [metadata, path] = record.split("\t");
      return { mode: metadata.split(" ")[0], path };
    })
    .filter(
      ({ mode, path }) =>
        ["100644", "100755"].includes(mode) &&
        contextPaths.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)) &&
        /\.(?:mjs|js|jsx|json|md|css|html)$/.test(path) &&
        !/(^|\/)(?:\.env[^/]*|package-lock\.json)$/.test(path),
    );
  const sourceContext = [];
  let bytes = Buffer.byteLength(spec.content);
  for (const { path } of files) {
    const content = git("show", `${baseCommit}:${path}`);
    bytes += Buffer.byteLength(content);
    if (bytes > maxContextBytes)
      throw new Error("Source context exceeds byte budget; narrow planner contextPaths");
    sourceContext.push({ path, content });
  }
  return sourceContext;
}
