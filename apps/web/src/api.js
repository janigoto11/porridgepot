const API_PREFIX = "/api";

function resolvePath(path) {
  const value = String(path ?? "");
  if (value.startsWith("/")) return value;
  return `${API_PREFIX}/${value}`;
}

async function parseBody(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

// Shared request helper for every API call: sends the session cookie with the
// same-origin policy and turns a non-ok response into an Error that carries the
// server's own Finnish message.
export async function request(path, { method = "GET", body } = {}) {
  const hasBody = body !== undefined && body !== null;
  const response = await fetch(resolvePath(path), {
    method,
    credentials: "same-origin",
    headers: hasBody ? { "Content-Type": "application/json" } : {},
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  const result = await parseBody(response);
  if (!response.ok) throw new Error(result.message || "Pyyntö epäonnistui.");
  return result;
}

export const apiGet = (path) => request(path, { method: "GET" });
export const apiPost = (path, body) => request(path, { method: "POST", body: body ?? {} });
export const apiPut = (path, body) => request(path, { method: "PUT", body: body ?? {} });
export const apiDelete = (path) => request(path, { method: "DELETE" });

// Compact form used by the application root: a missing body means GET.
export const api = (path, body) =>
  request(path, { method: body === undefined ? "GET" : "POST", body });

export default request;
