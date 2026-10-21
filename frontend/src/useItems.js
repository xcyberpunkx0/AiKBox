import { useCallback, useEffect, useState } from "react";
import { getItems, ingest } from "./api.js";

const POLL_MS = 1500;

// Owns the saved-items list. Polls while anything is still being processed in the background.
export function useItems() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setItems(await getItems());
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const hasPending = items.some((item) => item.status === "pending");
  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [hasPending, refresh]);

  const addItem = useCallback(async (payload) => {
    const item = await ingest(payload);
    setItems((prev) => [item, ...prev]);
    return item;
  }, []);

  return { items, error, addItem };
}
