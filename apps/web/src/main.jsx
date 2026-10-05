import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api.js";
import ShoppingLists from "./shoppingLists.jsx";
import "./style.css";

const HOME_TAB = "home";
const TABS = [
  { id: HOME_TAB, label: "Koti" },
  { id: "lists", label: "Omat ostoslistat" },
];

function Tabs({ active, onSelect }) {
  return (
    <div className="tabs" role="tablist" aria-label="Näkymät">
      {TABS.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            className={selected ? "tab tab-active" : "tab"}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
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
  // The Home tab is the active one on page load and right after signing in.
  const [tab, setTab] = useState(HOME_TAB);
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
      setTab(HOME_TAB);
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
      setTab(HOME_TAB);
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
      <section className={user && tab !== HOME_TAB ? "wide" : undefined}>
        <p className="eyebrow">PIENESTÄ ALKAA</p>
        {loading ? (
          <p role="status">Ladataan…</p>
        ) : user ? (
          <>
            <Tabs active={tab} onSelect={setTab} />
            <div
              className="tab-panel"
              role="tabpanel"
              id={`panel-${tab}`}
              aria-labelledby={`tab-${tab}`}
            >
              {tab === HOME_TAB ? (
                <>
                  <h1>Welcome to the Porridge Pot</h1>
                  <p>Tervetuloa, {user.username}. Tästä rakennamme seuraavan idean.</p>
                </>
              ) : (
                <ShoppingLists />
              )}
            </div>
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
