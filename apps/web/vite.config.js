import { defineConfig } from "vite";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL(".", import.meta.url));
// Shown in the footer when the commit cannot be resolved; the build must not fail.
const UNKNOWN_COMMIT = "tuntematon";
const pad = (value) => String(value).padStart(2, "0");
function formatBuildTime(date) {
  const day = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${day} ${time}`;
}
// Reads the short hash of the commit being built from the local repository.
// Any failure (no Git, no repository, unexpected output) falls back silently.
function readCommit() {
  try {
    const output = execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    });
    const commit = String(output).trim().slice(0, 7);
    return /^[0-9a-f]{7}$/.test(commit) ? commit : UNKNOWN_COMMIT;
  } catch {
    return UNKNOWN_COMMIT;
  }
}
// Computed once when this configuration loads, so every chunk reports the same build.
const buildInfo = { buildTime: formatBuildTime(new Date()), commit: readCommit() };
export default defineConfig({
  root,
  build: { outDir: "../../dist/web", emptyOutDir: true },
  server: { host: "127.0.0.1", proxy: { "/api": "http://127.0.0.1:3001" } },
  define: { __BUILD_INFO__: JSON.stringify(JSON.stringify(buildInfo)) },
});
