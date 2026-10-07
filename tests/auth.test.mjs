import test from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../apps/api/handler.mjs";
import { memoryStore } from "../apps/api/store.mjs";
import { hashPassword } from "../apps/api/auth.mjs";
const event = (path, method = "GET", body, cookies = []) => ({
  rawPath: `/api/${path}`,
  requestContext: { http: { method } },
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
  cookies,
});
async function fixture() {
  const store = memoryStore();
  await store.put({ pk: "USER#test", passwordHash: await hashPassword("a-good-test-password") });
  let time = 1000000;
  return {
    handler: createHandler(store, { now: () => time }),
    advance: () => {
      time += 3601000;
    },
  };
}
test("login sets a secure cookie; session works and logout revokes it", async () => {
  const { handler } = await fixture();
  assert.equal((await handler(event("me"))).statusCode, 401);
  const login = await handler(
    event("login", "POST", { username: "test", password: "a-good-test-password" }),
  );
  assert.equal(login.statusCode, 200);
  assert.match(login.cookies[0], /HttpOnly; SameSite=Strict; Path=\/api; Max-Age=3600; Secure/);
  const cookies = [login.cookies[0].split(";")[0]];
  assert.deepEqual(JSON.parse((await handler(event("me", "GET", undefined, cookies))).body), {
    user: { username: "test" },
  });
  await handler(event("logout", "POST", {}, cookies));
  assert.equal((await handler(event("me", "GET", undefined, cookies))).statusCode, 401);
});
test("expired sessions are rejected even before DynamoDB TTL deletion", async () => {
  const { handler, advance } = await fixture();
  const result = await handler(
    event("login", "POST", { username: "test", password: "a-good-test-password" }),
  );
  advance();
  assert.equal(
    (await handler(event("me", "GET", undefined, [result.cookies[0].split(";")[0]]))).statusCode,
    401,
  );
});
test("wrong and unknown credentials return the same error", async () => {
  const { handler } = await fixture();
  const wrong = await handler(event("login", "POST", { username: "test", password: "wrong" }));
  const unknown = await handler(event("login", "POST", { username: "missing", password: "wrong" }));
  assert.equal(wrong.statusCode, 401);
  assert.deepEqual(wrong, unknown);
});
test("invalid payloads and content types are rejected", async () => {
  const { handler } = await fixture();
  assert.equal((await handler(event("login", "POST", null))).statusCode, 400);
  assert.equal((await handler({ ...event("login", "POST"), body: "{" })).statusCode, 400);
  assert.equal(
    (await handler({ ...event("login", "POST", {}), headers: { "content-type": "text/plain" } }))
      .statusCode,
    415,
  );
  assert.equal(
    (await handler({ ...event("login", "POST"), body: "x".repeat(4097) })).statusCode,
    413,
  );
});
