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
// server's own Finnish message. A request without a body carries no body or
// content type at all, so GET and DELETE stay valid fetch calls.
export async function request(path, { method = "GET", body } = {}) {
  const options = { method, credentials: "same-origin" };
  if (body !== undefined && body !== null) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(resolvePath(path), options);
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
