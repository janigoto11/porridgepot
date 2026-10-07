import { createServer } from "node:http";
import { createHandler } from "../apps/api/handler.mjs";
import { memoryStore } from "../apps/api/store.mjs";
import { hashPassword } from "../apps/api/auth.mjs";
const store = memoryStore();
await store.put({
  pk: "USER#dev",
  passwordHash: await hashPassword(process.env.DEV_PASSWORD || "local-demo-only"),
});
const handler = createHandler(store, { secureCookies: false });
createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 4096) {
      res.writeHead(413);
      res.end();
      return;
    }
  }
  const result = await handler({
    rawPath: new URL(req.url, "http://localhost").pathname,
    requestContext: { http: { method: req.method } },
    headers: req.headers,
    cookies: req.headers.cookie ? [req.headers.cookie] : [],
    body,
  });
  res.writeHead(result.statusCode, {
    ...result.headers,
    ...(result.cookies ? { "set-cookie": result.cookies } : {}),
  });
  res.end(result.body);
}).listen(3001, "127.0.0.1", () =>
  console.log("Local API: http://127.0.0.1:3001 (user: dev; default password: local-demo-only)"),
);
