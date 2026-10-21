import { useState } from "react";

export default function AddItemForm({ onAdd }) {
  const [sourceType, setSourceType] = useState("note");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload =
        sourceType === "note"
          ? { source_type: "note", content: value }
          : { source_type: "url", url: value.trim() };
      await onAdd(payload);
      setValue("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function switchType(type) {
    setSourceType(type);
    setValue("");
    setError(null);
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <div className="toggle">
        {["note", "url"].map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={sourceType === type}
            onClick={() => switchType(type)}
          >
            {type === "note" ? "Note" : "URL"}
          </button>
        ))}
      </div>

      {sourceType === "note" ? (
        <textarea
          aria-label="Note text"
          placeholder="Write a note..."
          rows={4}
          maxLength={20000}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      ) : (
        <input
          type="url"
          aria-label="Page URL"
          placeholder="https://example.com/article"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      )}

      <button type="submit" disabled={saving || !value.trim()}>
        {saving ? "Saving..." : "Save"}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
