# Stage and gate rules

1. Select a numbered spec from the main push range; non-spec pushes do not plan.
2. Generate a schema-valid plan tied to the spec digest and base commit. Publish JSON and a deterministic Markdown rendering in a plan PR.
3. Human merge authorizes implementation. Reject changed specs, mismatched Markdown and stale source snapshots.
4. Implement tasks in dependency order. Enforce task allowedPaths and global delivery write boundaries; format and commit each task.
5. Run config/schema, architecture/dependency, build, lint/style, tests and CDK synth.
6. Review the actual implementation diff using Claude Code. Require pass and zero findings, with commit provenance.
7. Open implementation PR. Auto-merge only nonempty apps/web/-only changes when main still equals the checked base. Use fast-forward only; never overwrite concurrent commits.
8. Human merge or explicit post-auto-merge dispatch starts AWS demo deployment from main after deterministic validation. An automatic target must be the current main commit and match the merged implementation PR. OIDC is restricted to main; no environment approval in this disposable demo. Manual dispatch with empty inputs deploys current main. See docs/aws-demo.md.

Free/private does not enforce branch protection: repository writers can bypass this workflow manually. A workflow error blocks its next stage. Legacy assignment-review commands remain test fixtures, not current gates. See docs/pr-delivery.md for operational details.
