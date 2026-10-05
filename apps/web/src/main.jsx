import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

async function api(path, body) {
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "Pyyntö epäonnistui.");
  return result;
}

function UserMenu({ user, busy, onLogout }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handlePointerDown(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <div className="user-menu" ref={containerRef}>
      <button
        type="button"
        className="user-icon"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Käyttäjävalikko"
        onClick={() => setOpen((value) => !value)}
      >
        {user ? user.username.slice(0, 1).toUpperCase() : "?"}
      </button>
      {open && (
        <div className="user-menu-dropdown" role="menu">
          {user ? (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
            >
              Kirjaudu ulos
            </button>
          ) : (
            <span className="user-menu-info">Ei kirjautunut sisään</span>
          )}
        </div>
      )}
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api("me")
      .then((result) => setUser(result.user))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      setUser((await api("login", Object.fromEntries(data))).user);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await api("logout", {});
      setUser(null);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main>
      <header>
        <div className="brand">
          <span className="mark">P.</span>
          <span>Porridge Pot</span>
        </div>
        <div className="auth-status">
          <span className="status-text">
            {loading ? "Ladataan…" : user ? `Kirjautunut: ${user.username}` : "Ei kirjautunut"}
          </span>
          <UserMenu user={user} busy={busy} onLogout={logout} />
        </div>
      </header>
      <section>
        <p className="eyebrow">PIENESTÄ ALKAA</p>
        {loading ? (
          <p role="status">Ladataan…</p>
        ) : user ? (
          <>
            <h1>Welcome to the Porridge Pot</h1>
            <p>Tervetuloa, {user.username}. Tästä rakennamme seuraavan idean.</p>
          </>
        ) : (
          <>
            <h1>Tilaa seuraavalle idealle.</h1>
            <p>Kirjaudu sisään ja aloitetaan.</p>
            <form onSubmit={login}>
              <label>
                Käyttäjätunnus
                <input name="username" autoComplete="username" required maxLength={80} />
              </label>
              <label>
                Salasana
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={256}
                />
              </label>
              <button disabled={busy}>{busy ? "Kirjaudutaan…" : "Kirjaudu sisään"}</button>
            </form>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
      <footer>Yksi idea. Yksi askel kerrallaan.</footer>
    </main>
  );
}
createRoot(document.getElementById("root")).render(<App />);
