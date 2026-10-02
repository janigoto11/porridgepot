# Architecture policy

The current baseline is JavaScript ESM, Node.js 22, React/Vite and AWS CDK, as required by AGENTS.md.
Frontend belongs in apps/web, backend in apps/api, infrastructure in infra; specs belong in specs.
platform.json records required directories and opt-in forbidden package/import lists. Empty lists impose no invented technology bans.
Dependency checks cover direct dependencies; import checks cover literal imports/requires in source roots (excluding harness policy data).
These are lightweight checks, not a full dependency graph, transitive vulnerability scan or dynamic-import sandbox.
Build and CDK synth validate the existing application. Synth does not deploy and is not a security audit.
Review architecture policy changes through a protected PR. Extend deterministic enforcement alongside each new rule.
