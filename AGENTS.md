# Porridge Pot

This is a small AWS application used to explore AI-driven SDLC.
Read README.md, docs/architecture.md and the relevant spec before editing.

- Preserve ATTIC as historical reference material.
- Use React, JavaScript ESM, Node.js 22 and AWS CDK for this baseline.
- Keep frontend in apps/web, backend in apps/api and infrastructure in infra.
- Keep credentials and generated artifacts out of Git.
- Every implementation task must identify its spec, file ownership and acceptance criteria.
- Run npm run check before delivering a code change.
- Do not call paid models, push branches or deploy unless the current task authorizes it.
- The PR delivery chain uses Claude Code for planning, bounded file implementation and diff review. Tests must mock all model calls. Deployment uses GitHub OIDC for the isolated AWS demo account; Destroy demo deletes application data. See docs/aws-demo.md. See docs/pr-delivery.md.
