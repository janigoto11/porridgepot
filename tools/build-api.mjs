import { build } from "esbuild";
await build({
  entryPoints: ["apps/api/index.mjs"],
  outdir: "dist/api",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outExtension: { ".js": ".js" },
  sourcemap: true,
});
