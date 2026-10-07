import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Ajv from "ajv";
export function ask(
  { prompt, data, schema, model = "sonnet", timeoutMs = 180000 },
  run = execFileSync,
) {
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN && !process.env.ANTHROPIC_API_KEY)
    throw new Error(
      "Set CLAUDE_CODE_OAUTH_TOKEN (or ANTHROPIC_API_KEY) before calling Claude Code",
    );
  const input = JSON.stringify(data);
  if (Buffer.byteLength(input) > 250000) throw new Error("Agent input exceeds 250 KB");
  const cwd = mkdtempSync(join(tmpdir(), "porridgepot-claude-"));
  try {
    // No repository discovery, shell/file tools, MCP, sessions, or inherited GitHub credentials.
    const env = Object.fromEntries(
      [
        "PATH",
        "TMPDIR",
        process.env.CLAUDE_CODE_OAUTH_TOKEN ? "CLAUDE_CODE_OAUTH_TOKEN" : "ANTHROPIC_API_KEY",
      ]
        .filter((k) => process.env[k])
        .map((k) => [k, process.env[k]]),
    );
    env.HOME = cwd;
    env.CLAUDE_CONFIG_DIR = join(cwd, ".claude");
    env.CLAUDE_CODE_DISABLE_CLAUDE_MDS = "1";
    env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = "1";
    env.ENABLE_CLAUDEAI_MCP_SERVERS = "false";
    let raw;
    try {
      raw = run(
        "claude",
        [
          "--setting-sources",
          "",
          "--settings",
          '{"disableAllHooks":true}',
          "-p",
          "--tools",
          "",
          "--strict-mcp-config",
          "--mcp-config",
          '{"mcpServers":{}}',
          "--no-session-persistence",
          "--model",
          model,
          "--max-turns",
          "3",
          "--output-format",
          "json",
          "--json-schema",
          JSON.stringify(schema),
          "--system-prompt",
          prompt,
        ],
        {
          cwd,
          env,
          input,
          encoding: "utf8",
          timeout: timeoutMs,
          maxBuffer: 2000000,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
    } catch (error) {
      throw new Error(describeFailure(error));
    }
    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      throw new Error("Claude Code returned invalid JSON; no retry performed");
    }
    if (result.is_error || result.subtype !== "success")
      throw new Error(describeFailure({ stdout: raw }));
    const check = new Ajv({ strict: false }).compile(schema);
    if (!check(result.structured_output))
      throw new Error("Claude Code output failed schema validation");
    return result.structured_output;
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}
export async function plan(request) {
  const task = { ...request.taskSchema };
  delete task.$schema;
  delete task.$id;
  return ask({
    prompt: request.prompt,
    data: { spec: request.spec, platform: request.platform, sourceContext: request.sourceContext },
    model: request.planner.model,
    timeoutMs: request.planner.timeoutMs,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["tasks"],
      properties: { tasks: { type: "array", minItems: 1, maxItems: 8, items: task } },
    },
  }).tasks;
}

// Only fixed categories and numeric statuses are logged, never raw provider output or credentials.
export function describeFailure(error) {
  if (error.code === "ETIMEDOUT") return "Claude Code timed out; no retry performed";
  if (error.code === "ENOENT") return "Claude Code executable not found";
  let result;
  try {
    result = JSON.parse(String(error.stdout));
  } catch {
    /* Not a JSON failure. */
  }
  if (
    /not logged in|invalid.*token|authentication|unauthorized/i.test(result?.result || "") ||
    result?.api_error_status === 401
  )
    return "Claude Code authentication failed; check CLAUDE_CODE_OAUTH_TOKEN (OAuth requires non-bare mode)";
  if (result?.subtype === "error_max_turns")
    return "Claude Code exceeded the configured turn limit";
  if (Number.isInteger(result?.api_error_status))
    return `Claude Code API failed (HTTP ${result.api_error_status}); no retry performed`;
  if (Number.isInteger(error.status))
    return `Claude Code exited with status ${error.status}; no retry performed`;
  return "Claude Code did not complete successfully; no retry performed";
}
