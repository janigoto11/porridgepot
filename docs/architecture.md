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

## Shopping lists

The same Lambda also owns the shopping list endpoints:

- GET /api/lists returns the caller's own lists as { lists: [...] }.
- POST /api/lists creates an empty list with a default name and returns the created list.
- PUT /api/lists/{id} replaces the name and the items of one list in a single request.
- DELETE /api/lists/{id} removes one of the caller's lists.

Every shopping list endpoint requires a valid session cookie and uses the same
session check as /api/me: a missing, unknown or expired cookie returns 401, and the
session's username scopes every read and write. Unknown list identifiers return 404,
so one user can neither read nor modify another user's lists. Request bodies are
validated like the login endpoint, with Finnish messages: a non-JSON content type
returns 415, invalid JSON or an over-long name or item count returns 400, and an
oversized body returns 413.

All lists of one user live in a single DynamoDB item keyed pk = LISTS#&lt;username&gt;.
Its lists attribute is an array of { id, name, items: [{ id, text }], updatedAt }.
The existing table has one string partition key (pk) and already stores USER# and
SESSION# items, so this user-scoped key fits the current single-table design: every
read and write is one GetItem or PutItem on a key derived from the session username,
which needs no secondary index, no sort key and no new table. Bounded limits on the
number of lists, items and text lengths keep the item comfortably below the DynamoDB
item size limit. Infrastructure code is therefore unchanged. The lists item has no
expiresAt attribute, so the session TTL does not remove it.

The frontend shows two tabs to a signed-in user, Koti (Home) and Ostoslistat
(Shopping lists); Koti is active after sign-in and on page load. The shopping list
view has a listing mode (create, open and delete lists) and an editing mode (edit the
name, add rows, remove a row with the X button next to it, and return to the listing).
There is no save button: edits are stored automatically with PUT /api/lists/{id}, and
consecutive keystrokes are debounced into a single request.

## AI SDLC boundary

See [PR delivery](pr-delivery.md) for the current Plan → Implement → CI → synth chain.
Plans are reviewed as PRs; their merge authorizes bounded implementation tasks.
Deterministic checks and Claude diff review precede implementation PR publication.
Changes confined to apps/web/ and/or docs/ can merge automatically, including docs-only changes,
when checks and review pass and main has not advanced. Other changes require a human merge.
The deployment workflow generates CloudFormation only, with no AWS credentials.
Legacy assignment dry-run commands remain for tests and are not the active delivery chain.
