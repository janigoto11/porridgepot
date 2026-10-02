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
      ["PATH", "HOME", "TMPDIR", "CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"]
        .filter((k) => process.env[k])
        .map((k) => [k, process.env[k]]),
    );
    const raw = run(
      "claude",
      [
        "--bare",
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
    const result = JSON.parse(raw);
    if (result.is_error || result.subtype !== "success")
      throw new Error("Claude Code did not complete");
    const check = new Ajv({ strict: false }).compile(schema);
    if (!check(result.structured_output))
      throw new Error("Claude Code output failed schema validation");
    return result.structured_output;
  } catch {
    throw new Error(
      "Claude Code failed, timed out, or returned invalid output; no retry performed",
    );
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
