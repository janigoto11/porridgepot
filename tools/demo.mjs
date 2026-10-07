import { spawnSync } from "node:child_process";
import { readFileSync, mkdirSync, appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { isIP } from "node:net";
import { hashPassword } from "../apps/api/auth.mjs";
export const account = "818028063586";
export async function deployParameters(env) {
  const networks = (env.ALLOWED_IPV4_CIDRS || "").split(",").map((s) => s.trim());
  if (
    !networks.length ||
    networks.some((s) => {
      const [ip, prefix, extra] = s.split("/");
      return (
        extra !== undefined || isIP(ip) !== 4 || !/^(?:[1-9]|[12][0-9]|3[0-2])$/.test(prefix || "")
      );
    })
  )
    throw new Error("ALLOWED_IPV4_CIDRS must contain IPv4 CIDRs with prefixes 1–32 (no public /0)");
  const username = env.DEMO_USERNAME || "demo";
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(username)) throw new Error("Invalid DEMO_USERNAME");
  if (!env.DEMO_PASSWORD || env.DEMO_PASSWORD.length < 12 || env.DEMO_PASSWORD.length > 256)
    throw new Error("DEMO_PASSWORD must have 12–256 characters");
  return {
    networks: networks.join(","),
    username,
    passwordHash: await hashPassword(env.DEMO_PASSWORD),
  };
}
function execute(command, args, capture = false) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
  // Never include argv or captured errors: parameters can contain secret values.
  if (result.error || result.status !== 0)
    throw new Error(`${command} failed; inspect the preceding service output`);
  return result.stdout;
}
export async function runDemo(
  command,
  env = process.env,
  run = execute,
  readJson = (path) => JSON.parse(readFileSync(path, "utf8")),
) {
  if (!["deploy", "destroy"].includes(command)) throw new Error("Use deploy or destroy");
  const params = command === "deploy" ? await deployParameters(env) : undefined;
  if (command === "destroy" && env.DESTROY_CONFIRM !== "DELETE porridgepot-demo")
    throw new Error(
      "Set DESTROY_CONFIRM to DELETE porridgepot-demo; this permanently deletes all demo data",
    );
  const identity = JSON.parse(run("aws", ["sts", "get-caller-identity", "--output", "json"], true));
  if (identity.Account !== account)
    throw new Error("Wrong AWS account: demo actions are restricted to the member account");
  const cdk = (action, stack, args = []) =>
    run("node_modules/.bin/cdk", [action, stack, "--app", "cdk.out", "--exclusively", ...args]);
  if (command === "destroy") {
    cdk("destroy", "PorridgePot", ["--force"]);
    cdk("destroy", "PorridgePotEdge", ["--force"]);
    return;
  }
  if (env.GITHUB_ACTIONS === "true") {
    // GitHub masks each CIDR separately too, including service errors for a single entry.
    for (const value of [...params.networks.split(","), params.passwordHash])
      console.log(`::add-mask::${value}`);
  }
  mkdirSync(".ai", { recursive: true });
  cdk("deploy", "PorridgePotEdge", [
    "--require-approval",
    "never",
    "--parameters",
    `AllowedIpv4Cidrs=${params.networks}`,
    "--outputs-file",
    ".ai/edge-outputs.json",
  ]);
  const arn = readJson(".ai/edge-outputs.json").PorridgePotEdge?.WebAclArn;
  if (
    !new RegExp(
      `^arn:aws:wafv2:us-east-1:${account}:global/webacl/[A-Za-z0-9_-]+/[a-f0-9-]+$`,
    ).test(arn || "")
  )
    throw new Error("Invalid deployed WAF ARN");
  cdk("deploy", "PorridgePot", [
    "--require-approval",
    "never",
    "--parameters",
    `WebAclArn=${arn}`,
    "--parameters",
    `DemoUsername=${params.username}`,
    "--parameters",
    `DemoPasswordHash=${params.passwordHash}`,
    "--outputs-file",
    ".ai/demo-outputs.json",
  ]);
  const url = readJson(".ai/demo-outputs.json").PorridgePot?.WebsiteUrl;
  if (!/^https:\/\/[a-z0-9]+\.cloudfront\.net$/.test(url || ""))
    throw new Error("Invalid website output");
  if (env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      `## AWS demo deployed\nWebsite: ${url}\nOnly allowed IPv4 networks can access it.\n`,
    );
  console.log(`Demo: ${url}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runDemo(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
