# Architecture and next steps

Browser → CloudFront → private S3 (React)

Browser /api/* → CloudFront (no cache) → HTTP API Gateway → Lambda → DynamoDB

The API owns /api/health, /api/login, /api/me and /api/logout. Passwords use scrypt
with random salts. A one-hour opaque session is sent in an HttpOnly, Secure,
SameSite=Strict cookie. Only the SHA-256 hash of the token is stored in DynamoDB.
The API checks expiry itself; DynamoDB TTL later removes expired rows.
Local development uses the same handler with an in-memory store and an HTTP cookie.

The pilot intentionally has no registration, recovery or MFA. The API stage has a
small global throttle; it does not provide per-user brute-force protection. Before
real-user use, replace the demo identity system with managed authentication and
add abuse controls, monitoring and a recovery process. Rotating a user's password
does not currently invalidate that user's existing sessions.

## AI SDLC boundary

See [PR delivery](pr-delivery.md) for the current Plan → Implement → CI → synth chain.
Plans are reviewed as PRs; their merge authorizes bounded implementation tasks.
Deterministic checks and Claude diff review precede implementation PR publication.
Frontend-only changes can merge automatically; other changes require a human merge.
The deployment workflow generates CloudFormation only, with no AWS credentials.
Legacy assignment dry-run commands remain for tests and are not the active delivery chain.
