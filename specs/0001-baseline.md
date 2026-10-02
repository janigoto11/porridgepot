# Baseline: login and Hello World

Purpose: establish a small application for experimenting with AI-driven SDLC.

## Acceptance criteria

- A React page offers username and password fields with Finnish labels.
- Correct credentials show Hello World and the username.
- Incorrect credentials produce a generic error and no session.
- Reload preserves the session; logout invalidates it; sessions expire after one hour.
- AWS serves the frontend through private S3 and CloudFront.
- Same-origin /api/* requests reach HTTP API Gateway, Lambda and DynamoDB.
- No plaintext passwords, credentials in Git, or production users in this pilot.
- Local development works without AWS or paid model access.

## Boundaries

No signup, password recovery, MFA, user management or application features yet.
The next feature must be described in a new specification before implementation.
