import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { reducedMotion } from "../motion.js";

const MODES = {
  ask: { placeholder: "Ask about anything you've saved", maxLength: 1000 },
  note: { label: "Note", placeholder: "Write a note to save", maxLength: 20000 },
  url: { label: "Link", placeholder: "Paste a link to save", maxLength: 2000 },
};

export default function Composer({ busy, onSend }) {
  const [mode, setMode] = useState("ask");
  const [text, setText] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const input = useRef(null);
  const menu = useRef(null);
  const form = useRef(null);

  // Grow with the text, up to the max-height set in CSS
  useEffect(() => {
    const el = input.current;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => {
      if (e.type === "keydown" ? e.key === "Escape" : !menu.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

  // The menu grows up out of the + button
  useGSAP(
    () => {
      if (!menuOpen || reducedMotion) return;
      gsap.from(".menu", {
        opacity: 0,
        y: 6,
        scale: 0.96,
        transformOrigin: "0% 100%",
        duration: 0.18,
        ease: "power2.out",
      });
    },
    { scope: form, dependencies: [menuOpen] }
  );

  useGSAP(
    () => {
      if (mode === "ask" || reducedMotion) return;
      gsap.from(".mode-chip", { opacity: 0, scale: 0.85, duration: 0.3, ease: "back.out(2)" });
    },
    { scope: form, dependencies: [mode] }
  );

  function pick(next) {
    setMode(next);
    setMenuOpen(false);
    input.current.focus();
  }

  async function submit(e) {
    e?.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    // Clear straight away like a chat app; a failed save puts the text back so it can be fixed
    setText("");
    const ok = await onSend(mode, value);
    if (ok) {
      setMode("ask");
    } else {
      setText(value);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      submit(e);
    }
  }

  const current = MODES[mode];

  return (
    <form className="composer" ref={form} onSubmit={submit}>
      <textarea
        ref={input}
        rows={1}
        aria-label={current.placeholder}
        placeholder={current.placeholder}
        maxLength={current.maxLength}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />

      <div className="composer-bar">
        <div className="menu-wrap" ref={menu}>
          <button
            type="button"
            className="icon-btn"
            aria-label="Save to inbox"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 3v10M3 8h10" />
            </svg>
          </button>
          {menuOpen && (
            <div className="menu" role="menu">
              <button type="button" role="menuitem" onClick={() => pick("note")}>
                Save a note
              </button>
              <button type="button" role="menuitem" onClick={() => pick("url")}>
                Save a link
              </button>
            </div>
          )}
        </div>

        {mode !== "ask" && (
          <span className="mode-chip">
            {current.label}
            <button type="button" aria-label="Back to asking" onClick={() => pick("ask")}>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </span>
        )}

        <button
          type="submit"
          className="send"
          aria-label={mode === "ask" ? "Ask" : "Save"}
          disabled={busy || !text.trim()}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" />
          </svg>
        </button>
      </div>
    </form>
  );
}
