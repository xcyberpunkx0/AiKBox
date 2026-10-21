import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { askQuestion } from "../api.js";
import { reducedMotion, useEnter } from "../motion.js";
import Composer from "./Composer.jsx";

let nextId = 1;

export default function Chat({ items, onSave, onShowItem, onOpenInbox }) {
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const thread = useRef(null);
  const { contextSafe } = useGSAP({ scope: thread });

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function push(...msgs) {
    setMessages((prev) => [...prev, ...msgs.map((m) => ({ id: nextId++, ...m }))]);
  }

  // Replaces the last message, which is always the assistant placeholder we just added
  function settle(update) {
    setMessages((prev) => [...prev.slice(0, -1), { ...prev.at(-1), pending: false, ...update }]);
  }

  // Fade the old conversation out before clearing it
  const clear = contextSafe(() => {
    if (reducedMotion) return setMessages([]);
    gsap.to(".msg", {
      opacity: 0,
      y: -8,
      duration: 0.2,
      stagger: 0.03,
      ease: "power1.in",
      onComplete: () => setMessages([]),
    });
  });

  // Returns false when the text should go back into the composer
  async function send(mode, text) {
    setBusy(true);
    push({ role: "user", mode, text }, { role: "assistant", mode, pending: true });
    try {
      if (mode === "ask") {
        settle({ result: await askQuestion(text) });
      } else {
        const payload =
          mode === "note" ? { source_type: "note", content: text } : { source_type: "url", url: text };
        const item = await onSave(payload);
        settle({ itemId: item.id });
      }
      return true;
    } catch (err) {
      settle({ error: err.message });
      return mode === "ask";
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pane chat" aria-label="Chat">
      <header className="pane-head">
        <span className="mark" aria-hidden="true" />
        <h1>Knowledge Inbox</h1>
        <button
          type="button"
          className="ghost"
          onClick={clear}
          disabled={busy || messages.length === 0}
        >
          New chat
        </button>
        <button type="button" className="ghost mobile-only" onClick={onOpenInbox}>
          Inbox <span className="count">{items.length}</span>
        </button>
      </header>

      <div className="thread" ref={thread} aria-live="polite">
        {messages.length === 0 ? (
          <EmptyChat />
        ) : (
          messages.map((msg) =>
            msg.role === "user" ? (
              <UserMessage key={msg.id} msg={msg} />
            ) : (
              <AssistantMessage key={msg.id} msg={msg} items={items} onShowItem={onShowItem} />
            )
          )
        )}
      </div>

      <Composer busy={busy} onSend={send} />
    </section>
  );
}

function EmptyChat() {
  const ref = useEnter({ y: 14, duration: 0.6, delay: 0.2 });
  return (
    <div className="empty" ref={ref}>
      <h2>Ask your inbox</h2>
      <p>
        Answers come only from the notes and links you've saved, with the sources they used. Use +
        to save something new.
      </p>
    </div>
  );
}

// Rises out of the composer, growing from its bottom-right corner like a sent bubble
function UserMessage({ msg }) {
  const ref = useEnter({ y: 16, scale: 0.96, transformOrigin: "100% 100%" });
  return (
    <div className="msg user" ref={ref}>
      {msg.mode !== "ask" && <span className="msg-kind">{msg.mode === "note" ? "Note" : "Link"}</span>}
      <p>{msg.text}</p>
    </div>
  );
}

function AssistantMessage({ msg, items, onShowItem }) {
  if (msg.pending) {
    return (
      <Line className="thinking">{msg.mode === "ask" ? "Searching your inbox..." : "Saving..."}</Line>
    );
  }
  if (msg.error) {
    return <Line className="error">{msg.error}</Line>;
  }
  if (msg.itemId) {
    return <SavedReceipt item={items.find((i) => i.id === msg.itemId)} onShowItem={onShowItem} />;
  }
  return <Answer result={msg.result} onShowItem={onShowItem} />;
}

function Line({ className, children }) {
  const ref = useEnter({ y: 6 });
  return (
    <p className={`msg assistant ${className}`} ref={ref}>
      {children}
    </p>
  );
}

// Follows the item's live status, since the list keeps polling while it's processed
function SavedReceipt({ item, onShowItem }) {
  const box = useEnter({ y: 6 });
  const status = item?.status;

  // Fade the new wording in once background processing finishes
  useGSAP(
    () => {
      if (reducedMotion || status === "pending") return;
      gsap.from("p", { opacity: 0, y: 4, duration: 0.4, ease: "power2.out" });
    },
    { scope: box, dependencies: [status] }
  );

  if (!item) return null;
  const text = {
    pending: "Saved. Reading and indexing it now...",
    ready: "Saved and ready. You can ask about it.",
    failed: `Saved, but processing failed: ${item.error}`,
  }[item.status];
  return (
    <div className={`msg assistant receipt status-text-${item.status}`} ref={box}>
      <p>{text}</p>
      <button type="button" className="link" onClick={() => onShowItem(item.id)}>
        Show in inbox
      </button>
    </div>
  );
}

function Answer({ result, onShowItem }) {
  const box = useRef(null);
  // Split on whitespace but keep it, so the words can fade in one after another
  const words = result.answer.split(/(\s+)/);

  // The API returns the whole answer at once. Revealing it word by word reads like it's being
  // written out, then the sources follow. Long answers still finish within about a second.
  useGSAP(
    () => {
      if (reducedMotion) return;
      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
      tl.from(".answer-text span", {
        opacity: 0,
        duration: 0.3,
        stagger: { amount: Math.min(words.length * 0.015, 1) },
      });
      if (result.sources.length > 0) {
        tl.from(".source", { y: 8, opacity: 0, duration: 0.3, stagger: 0.08 }, "-=0.15");
      }
    },
    { scope: box }
  );

  return (
    <div className="msg assistant" ref={box}>
      <p className="answer-text">
        {words.map((word, i) => (
          <span key={i}>{word}</span>
        ))}
      </p>
      {result.sources.length > 0 && (
        <ol className="sources" aria-label="Sources">
          {result.sources.map((source) => (
            <li key={source.citation}>
              <button type="button" className="source" onClick={() => onShowItem(source.item_id)}>
                <span className="source-head">
                  <span className="cite">{source.citation}</span>
                  <span className="source-title">
                    {source.title || source.url || `Note #${source.item_id}`}
                  </span>
                  <span className="muted">{Math.round(source.score * 100)}% match</span>
                </span>
                <span className="snippet">{source.snippet}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
