import test from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../apps/api/handler.mjs";
import { memoryStore } from "../apps/api/store.mjs";
import { hashPassword } from "../apps/api/auth.mjs";

const PASSWORD = "a-good-test-password";
const event = (path, method = "GET", body, cookies = []) => ({
  rawPath: `/api/${path}`,
  requestContext: { http: { method } },
  headers: { "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
  cookies,
});
const json = (result) => JSON.parse(result.body);

async function fixture() {
  const store = memoryStore();
  for (const username of ["owner", "other"])
    await store.put({ pk: `USER#${username}`, passwordHash: await hashPassword(PASSWORD) });
  let time = 1000000;
  const handler = createHandler(store, { now: () => time });
  const login = async (username) => {
    const result = await handler(event("login", "POST", { username, password: PASSWORD }));
    assert.equal(result.statusCode, 200);
    return [result.cookies[0].split(";")[0]];
  };
  return {
    handler,
    login,
    advance: () => {
      time += 3601000;
    },
  };
}

test("signed-in user can list, create, update and delete shopping lists", async () => {
  const { handler, login } = await fixture();
  const cookies = await login("owner");
  const empty = await handler(event("lists", "GET", undefined, cookies));
  assert.equal(empty.statusCode, 200);
  assert.deepEqual(json(empty), { lists: [] });

  const created = await handler(event("lists", "POST", {}, cookies));
  assert.equal(created.statusCode, 200);
  const list = json(created).list;
  assert.equal(typeof list.id, "string");
  assert.equal(list.name, "Uusi lista");
  assert.deepEqual(list.items, []);

  const named = await handler(event("lists", "POST", { name: "Ruokakauppa" }, cookies));
  assert.equal(named.statusCode, 200);
  assert.equal(json(named).list.name, "Ruokakauppa");

  const listed = await handler(event("lists", "GET", undefined, cookies));
  assert.deepEqual(
    json(listed).lists.map((entry) => entry.name),
    ["Uusi lista", "Ruokakauppa"],
  );

  const updated = await handler(
    event(
      `lists/${list.id}`,
      "PUT",
      { name: "  Viikonloppu  ", items: [{ text: "Maito" }, { text: "Leipä" }] },
      cookies,
    ),
  );
  assert.equal(updated.statusCode, 200);
  const saved = json(updated).list;
  assert.equal(saved.id, list.id);
  assert.equal(saved.name, "Viikonloppu");
  assert.deepEqual(
    saved.items.map((item) => item.text),
    ["Maito", "Leipä"],
  );
  assert.ok(saved.items.every((item) => typeof item.id === "string" && item.id.length > 0));

  const afterUpdate = await handler(event("lists", "GET", undefined, cookies));
  assert.deepEqual(
    json(afterUpdate).lists.find((entry) => entry.id === list.id),
    saved,
  );

  const removed = await handler(event(`lists/${list.id}`, "DELETE", undefined, cookies));
  assert.equal(removed.statusCode, 200);
  assert.deepEqual(json(removed), { ok: true });
  const afterDelete = await handler(event("lists", "GET", undefined, cookies));
  assert.deepEqual(
    json(afterDelete).lists.map((entry) => entry.name),
    ["Ruokakauppa"],
  );
});

test("unknown list identifiers are not found", async () => {
  const { handler, login } = await fixture();
  const cookies = await login("owner");
  const missingUpdate = await handler(
    event("lists/missing-id", "PUT", { name: "Lista", items: [] }, cookies),
  );
  assert.equal(missingUpdate.statusCode, 404);
  assert.equal(json(missingUpdate).message, "Listaa ei löytynyt.");
  const missingDelete = await handler(event("lists/missing-id", "DELETE", undefined, cookies));
  assert.equal(missingDelete.statusCode, 404);
});

test("every shopping list endpoint requires a valid session", async () => {
  const { handler, login, advance } = await fixture();
  const cookies = await login("owner");
  const list = json(await handler(event("lists", "POST", {}, cookies))).list;
  const requests = [
    event("lists", "GET"),
    event("lists", "POST", {}),
    event(`lists/${list.id}`, "PUT", { name: "Lista", items: [] }),
    event(`lists/${list.id}`, "DELETE"),
  ];
  for (const request of requests) {
    const anonymous = await handler(request);
    assert.equal(anonymous.statusCode, 401);
    assert.equal(json(anonymous).message, "Kirjaudu sisään.");
    const bogus = await handler({ ...request, cookies: ["session=not-a-real-token"] });
    assert.equal(bogus.statusCode, 401);
  }
  advance();
  for (const request of requests) {
    const expired = await handler({ ...request, cookies });
    assert.equal(expired.statusCode, 401);
    assert.equal(expired.body.includes(list.id), false);
  }
});

test("a user cannot see, edit or delete another user's list", async () => {
  const { handler, login } = await fixture();
  const ownerCookies = await login("owner");
  const created = await handler(event("lists", "POST", { name: "Omistajan lista" }, ownerCookies));
  const list = json(created).list;

  const otherCookies = await login("other");
  const otherListing = await handler(event("lists", "GET", undefined, otherCookies));
  assert.deepEqual(json(otherListing), { lists: [] });
  assert.equal(otherListing.body.includes("Omistajan lista"), false);

  const foreignUpdate = await handler(
    event(`lists/${list.id}`, "PUT", { name: "Kaapattu", items: [] }, otherCookies),
  );
  assert.equal(foreignUpdate.statusCode, 404);
  const foreignDelete = await handler(event(`lists/${list.id}`, "DELETE", undefined, otherCookies));
  assert.equal(foreignDelete.statusCode, 404);

  const ownerListing = await handler(event("lists", "GET", undefined, ownerCookies));
  assert.deepEqual(json(ownerListing).lists, [list]);
});

test("shopping list payloads are validated with Finnish messages", async () => {
  const { handler, login } = await fixture();
  const cookies = await login("owner");
  const list = json(await handler(event("lists", "POST", {}, cookies))).list;
  const path = `lists/${list.id}`;

  const brokenJson = await handler({
    ...event(path, "PUT", undefined, cookies),
    body: "{",
  });
  assert.equal(brokenJson.statusCode, 400);
  assert.equal(json(brokenJson).message, "Virheellinen pyyntö.");

  const longName = "x".repeat(101);
  assert.equal(
    (await handler(event(path, "PUT", { name: longName, items: [] }, cookies))).statusCode,
    400,
  );
  assert.equal(
    (await handler(event("lists", "POST", { name: longName }, cookies))).statusCode,
    400,
  );

  const tooManyItems = Array.from({ length: 101 }, (_, index) => ({ text: `rivi ${index}` }));
  const manyItems = await handler(
    event(path, "PUT", { name: "Lista", items: tooManyItems }, cookies),
  );
  assert.equal(manyItems.statusCode, 400);
  assert.equal(json(manyItems).message, "Tarkista listan sisältö.");

  const longText = await handler(
    event(path, "PUT", { name: "Lista", items: [{ text: "y".repeat(201) }] }, cookies),
  );
  assert.equal(longText.statusCode, 400);

  for (const request of [
    event(path, "PUT", { name: "Lista" }, cookies),
    event("lists", "POST", {}, cookies),
  ]) {
    const wrongType = await handler({ ...request, headers: { "content-type": "text/plain" } });
    assert.equal(wrongType.statusCode, 415);
    assert.equal(json(wrongType).message, "Käytä JSON-muotoa.");
  }

  for (const request of [
    event(path, "PUT", undefined, cookies),
    event("lists", "POST", undefined, cookies),
  ]) {
    const tooLarge = await handler({ ...request, body: "x".repeat(16385) });
    assert.equal(tooLarge.statusCode, 413);
    assert.equal(json(tooLarge).message, "Liian suuri pyyntö.");
  }

  const unchanged = await handler(event("lists", "GET", undefined, cookies));
  assert.deepEqual(json(unchanged).lists, [list]);
});
