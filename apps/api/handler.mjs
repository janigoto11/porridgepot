import { hashPassword, verifyPassword, newToken, tokenKey } from "./auth.mjs";
const dummyHash = hashPassword("unused-password-for-unknown-users");
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
    try {
      if (method === "GET" && path === "/api/health") return reply(200, { status: "ok" });
      if (method === "POST" && path === "/api/login") {
        if (!(event.headers?.["content-type"] ?? "").toLowerCase().startsWith("application/json"))
          return reply(415, { message: "Käytä JSON-muotoa." });
        const raw = event.isBase64Encoded
          ? Buffer.from(event.body ?? "", "base64").toString()
          : (event.body ?? "");
        if (Buffer.byteLength(raw) > 4096) return reply(413, { message: "Liian suuri pyyntö." });
        let body;
        try {
          body = JSON.parse(raw);
        } catch {
          return reply(400, { message: "Virheellinen pyyntö." });
        }
        const { username, password } = body ?? {};
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
        const session = token ? await store.get(tokenKey(token)) : null;
        if (!session || session.expiresAt <= Math.floor(now() / 1000))
          return reply(401, { message: "Kirjaudu sisään." });
        return reply(200, { user: { username: session.username } });
      }
      return reply(404, { message: "Ei löytynyt." });
    } catch (error) {
      console.error("Request failed", { name: error.name });
      return reply(500, { message: "Palvelu ei ole juuri nyt saatavilla." });
    }
  };
}
