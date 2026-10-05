import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "./api.js";

const AUTOSAVE_DELAY_MS = 600;
const MAX_NAME_LENGTH = 100;
const MAX_ITEM_LENGTH = 200;

function newItemId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `item-${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
}

export function ShoppingLists() {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(null);
  const [itemText, setItemText] = useState("");
  const timer = useRef(null);
  const pending = useRef(null);

  // Sends the latest pending edit immediately; there is no save button.
  const flush = useCallback(async () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const payload = pending.current;
    if (!payload) return;
    pending.current = null;
    setSaving(true);
    try {
      const result = await apiPut(`lists/${encodeURIComponent(payload.id)}`, {
        name: payload.name,
        items: payload.items,
      });
      if (result.list) {
        const saved = result.list;
        setLists((current) => current.map((list) => (list.id === saved.id ? saved : list)));
      }
      setError("");
    } catch (failure) {
      setError(failure.message || "Tallennus epäonnistui.");
    } finally {
      setSaving(false);
    }
  }, []);

  // Consecutive keystrokes are batched into a single request.
  const schedule = useCallback(
    (next) => {
      pending.current = { id: next.id, name: next.name, items: next.items };
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void flush();
      }, AUTOSAVE_DELAY_MS);
    },
    [flush],
  );

  useEffect(() => {
    let cancelled = false;
    apiGet("lists")
      .then((result) => {
        if (!cancelled) setLists(Array.isArray(result.lists) ? result.lists : []);
      })
      .catch((failure) => {
        if (!cancelled) setError(failure.message || "Listojen lataus epäonnistui.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      void flush();
    },
    [flush],
  );

  function changeDraft(changes) {
    if (!draft) return;
    const next = { ...draft, ...changes };
    setDraft(next);
    schedule(next);
  }

  function openList(list) {
    setItemText("");
    setDraft({
      id: list.id,
      name: list.name ?? "",
      items: (list.items ?? []).map((item) => ({
        id: typeof item?.id === "string" ? item.id : newItemId(),
        text: typeof item?.text === "string" ? item.text : String(item ?? ""),
      })),
    });
  }

  async function backToListing() {
    await flush();
    setDraft(null);
    setItemText("");
  }

  async function createList() {
    setBusy(true);
    setError("");
    try {
      const result = await apiPost("lists", {});
      if (result.list) {
        setLists((current) => [...current, result.list]);
        openList(result.list);
      }
    } catch (failure) {
      setError(failure.message || "Listan luonti epäonnistui.");
    } finally {
      setBusy(false);
    }
  }

  async function removeList(id) {
    setBusy(true);
    setError("");
    try {
      await apiDelete(`lists/${encodeURIComponent(id)}`);
      setLists((current) => current.filter((list) => list.id !== id));
      if (pending.current?.id === id) pending.current = null;
      if (draft?.id === id) {
        setDraft(null);
        setItemText("");
      }
    } catch (failure) {
      setError(failure.message || "Listan poisto epäonnistui.");
    } finally {
      setBusy(false);
    }
  }

  function addItem(event) {
    event.preventDefault();
    const text = itemText.trim();
    if (!draft || text === "") return;
    changeDraft({ items: [...draft.items, { id: newItemId(), text }] });
    setItemText("");
  }

  function removeItem(index) {
    if (!draft) return;
    changeDraft({ items: draft.items.filter((_, position) => position !== index) });
  }

  function changeItem(index, text) {
    if (!draft) return;
    changeDraft({
      items: draft.items.map((item, position) => (position === index ? { ...item, text } : item)),
    });
  }

  const status = saving ? "Tallennetaan…" : "Muutokset tallentuvat automaattisesti.";

  return (
    <div className="shopping-lists">
      {loading ? (
        <p role="status">Ladataan ostoslistoja…</p>
      ) : draft ? (
        <div className="shopping-list-editor">
          <div className="shopping-lists-toolbar">
            <button type="button" onClick={backToListing}>
              Takaisin listaukseen
            </button>
            <span className="shopping-lists-status" role="status">
              {status}
            </span>
          </div>
          <label>
            Listan nimi
            <input
              value={draft.name}
              maxLength={MAX_NAME_LENGTH}
              onChange={(event) => changeDraft({ name: event.target.value })}
            />
          </label>
          {draft.items.length === 0 ? (
            <p>Listalla ei ole vielä rivejä.</p>
          ) : (
            <ul className="shopping-list-items">
              {draft.items.map((item, index) => (
                <li key={item.id} className="shopping-list-item">
                  <input
                    value={item.text}
                    maxLength={MAX_ITEM_LENGTH}
                    aria-label={`Rivi ${index + 1}`}
                    onChange={(event) => changeItem(index, event.target.value)}
                  />
                  <button
                    type="button"
                    className="shopping-list-item-remove"
                    aria-label={`Poista rivi: ${item.text || `rivi ${index + 1}`}`}
                    onClick={() => removeItem(index)}
                  >
                    X
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form className="shopping-list-add" onSubmit={addItem}>
            <label>
              Uusi rivi
              <input
                value={itemText}
                maxLength={MAX_ITEM_LENGTH}
                onChange={(event) => setItemText(event.target.value)}
              />
            </label>
            <button type="submit">Lisää rivi</button>
          </form>
        </div>
      ) : (
        <div className="shopping-lists-listing">
          <div className="shopping-lists-toolbar">
            <button type="button" disabled={busy} onClick={createList}>
              {busy ? "Odota…" : "Uusi lista"}
            </button>
          </div>
          {lists.length === 0 ? (
            <p>Ei vielä ostoslistoja. Luo ensimmäinen lista.</p>
          ) : (
            <ul className="shopping-lists-items">
              {lists.map((list) => (
                <li key={list.id} className="shopping-lists-row">
                  <span className="shopping-lists-name">{list.name}</span>
                  <span className="shopping-lists-count">{(list.items ?? []).length} riviä</span>
                  <button type="button" onClick={() => openList(list)}>
                    Muokkaa
                  </button>
                  <button
                    type="button"
                    className="shopping-lists-delete"
                    disabled={busy}
                    aria-label={`Poista lista: ${list.name}`}
                    onClick={() => removeList(list.id)}
                  >
                    Poista
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default ShoppingLists;
