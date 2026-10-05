import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword, newToken, tokenKey } from "./auth.mjs";
const dummyHash = hashPassword("unused-password-for-unknown-users");
const LOGIN_BODY_LIMIT = 4096;
const LIST_BODY_LIMIT = 16384;
const MAX_LIST_NAME = 100;
const MAX_LISTS = 50;
const MAX_LIST_ITEMS = 100;
const MAX_ITEM_TEXT = 200;
const DEFAULT_LIST_NAME = "Uusi lista";
const idPattern = /^[a-zA-Z0-9_-]{1,64}$/;
const newId = () => randomUUID();
const isPlainObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);
function normalizeName(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string" || value.length > MAX_LIST_NAME) return null;
  const trimmed = value.trim();
  return trimmed === "" ? fallback : trimmed;
}
function normalizeItems(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_LIST_ITEMS) return null;
  const items = [];
  for (const entry of value) {
    const source = typeof entry === "string" ? { text: entry } : entry;
    if (!isPlainObject(source)) return null;
    const { id, text } = source;
    if (typeof text !== "string" || text.length > MAX_ITEM_TEXT) return null;
    items.push({ id: typeof id === "string" && idPattern.test(id) ? id : newId(), text });
  }
  return items;
}
function decodeId(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
export function createHandler(store, { secureCookies = true, now = () => Date.now() } = {}) {
  const cookie = (token, age) =>
    `session=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${age}${secureCookies ? "; Secure" : ""}`;
  const reply = (statusCode, data, cookies) => ({
    statusCode,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify(data),
    ...(cookies ? { cookies } : {}),
  });
  return async (event) => {
    const method = event.requestContext?.http?.method;
    const path = event.rawPath;
    const token = (event.cookies ?? [])
      .flatMap((c) => c.split(";"))
      .map((c) => c.trim())
      .find((c) => c.startsWith("session="))
      ?.slice(8);
    const authenticate = async () => {
      const session = token ? await store.get(tokenKey(token)) : null;
      return session && session.expiresAt > Math.floor(now() / 1000) ? session : null;
    };
    const readBody = (limit, { optional = false } = {}) => {
      const raw = event.isBase64Encoded
        ? Buffer.from(event.body ?? "", "base64").toString()
        : (event.body ?? "");
      if (optional && raw.trim() === "") return { body: {} };
      if (!(event.headers?.["content-type"] ?? "").toLowerCase().startsWith("application/json"))
        return { response: reply(415, { message: "Käytä JSON-muotoa." }) };
      if (Buffer.byteLength(raw) > limit)
        return { response: reply(413, { message: "Liian suuri pyyntö." }) };
      try {
        return { body: JSON.parse(raw) };
      } catch {
        return { response: reply(400, { message: "Virheellinen pyyntö." }) };
      }
    };
    try {
      if (method === "GET" && path === "/api/health") return reply(200, { status: "ok" });
      if (method === "POST" && path === "/api/login") {
        const parsed = readBody(LOGIN_BODY_LIMIT);
        if (parsed.response) return parsed.response;
        const { username, password } = parsed.body ?? {};
        if (
          typeof username !== "string" ||
          !/^[a-zA-Z0-9._-]{1,80}$/.test(username) ||
          typeof password !== "string" ||
          password.length < 1 ||
          password.length > 256
        )
          return reply(400, { message: "Tarkista kirjautumistiedot." });
        const user = await store.get(`USER#${username}`);
        const valid = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
        if (!user || !valid)
          return reply(401, { message: "Virheellinen käyttäjätunnus tai salasana." });
        if (token) await store.delete(tokenKey(token));
        const nextToken = newToken();
        await store.put({
          pk: tokenKey(nextToken),
          username,
          expiresAt: Math.floor(now() / 1000) + 3600,
        });
        return reply(200, { user: { username } }, [cookie(nextToken, 3600)]);
      }
      if (method === "POST" && path === "/api/logout") {
        if (token) await store.delete(tokenKey(token));
        return reply(200, { ok: true }, [cookie("", 0)]);
      }
      if (method === "GET" && path === "/api/me") {
        const session = await authenticate();
        if (!session) return reply(401, { message: "Kirjaudu sisään." });
        return reply(200, { user: { username: session.username } });
      }
      if (path === "/api/lists" && (method === "GET" || method === "POST")) {
        const session = await authenticate();
        if (!session) return reply(401, { message: "Kirjaudu sisään." });
        if (method === "GET") return reply(200, { lists: await store.getLists(session.username) });
        const parsed = readBody(LIST_BODY_LIMIT, { optional: true });
        if (parsed.response) return parsed.response;
        if (!isPlainObject(parsed.body)) return reply(400, { message: "Virheellinen pyyntö." });
        const name = normalizeName(parsed.body.name, DEFAULT_LIST_NAME);
        if (name === null) return reply(400, { message: "Tarkista listan nimi." });
        const lists = await store.getLists(session.username);
        if (lists.length >= MAX_LISTS) return reply(400, { message: "Listoja on liikaa." });
        const list = { id: newId(), name, items: [], updatedAt: new Date(now()).toISOString() };
        await store.putLists(session.username, [...lists, list]);
        return reply(200, { list });
      }
      const listPath = /^\/api\/lists\/([^/]+)$/.exec(path ?? "");
      if (listPath && (method === "PUT" || method === "DELETE")) {
        const session = await authenticate();
        if (!session) return reply(401, { message: "Kirjaudu sisään." });
        const id = decodeId(listPath[1]);
        if (method === "DELETE") {
          const lists = await store.getLists(session.username);
          const remaining = lists.filter((list) => list.id !== id);
          if (remaining.length === lists.length)
            return reply(404, { message: "Listaa ei löytynyt." });
          await store.putLists(session.username, remaining);
          return reply(200, { ok: true });
        }
        const parsed = readBody(LIST_BODY_LIMIT);
        if (parsed.response) return parsed.response;
        if (!isPlainObject(parsed.body)) return reply(400, { message: "Virheellinen pyyntö." });
        const name = normalizeName(parsed.body.name, DEFAULT_LIST_NAME);
        const items = normalizeItems(parsed.body.items);
        if (name === null || items === null)
          return reply(400, { message: "Tarkista listan sisältö." });
        const lists = await store.getLists(session.username);
        const index = lists.findIndex((list) => list.id === id);
        if (index === -1) return reply(404, { message: "Listaa ei löytynyt." });
        const list = { id: lists[index].id, name, items, updatedAt: new Date(now()).toISOString() };
        lists[index] = list;
        await store.putLists(session.username, lists);
        return reply(200, { list });
      }
      return reply(404, { message: "Ei löytynyt." });
    } catch (error) {
      console.error("Request failed", { name: error.name });
      return reply(500, { message: "Palvelu ei ole juuri nyt saatavilla." });
    }
  };
}
