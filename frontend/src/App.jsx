import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { reducedMotion } from "./motion.js";
import Chat from "./components/Chat.jsx";
import ItemList from "./components/ItemList.jsx";
import { useItems } from "./useItems.js";

export default function App() {
  const { items, error, addItem } = useItems();
  // On narrow screens only one pane fits, so this picks which one is shown
  const [view, setView] = useState("chat");
  // `n` changes on every click, so clicking the same source twice highlights it again
  const [highlight, setHighlight] = useState({ id: null, n: 0 });

  const root = useRef(null);

  // One short entrance on load: the headers drop in, then the composer rises
  useGSAP(
    () => {
      if (reducedMotion) return;
      gsap
        .timeline({ defaults: { ease: "power3.out", duration: 0.5 } })
        .from(".pane-head", { opacity: 0, y: -6, stagger: 0.08 })
        .from(".composer", { opacity: 0, y: 16 }, "<0.1");
    },
    { scope: root }
  );

  // On a phone the panes swap places, so slide the new one in from the side it lives on
  useGSAP(
    () => {
      if (reducedMotion || !window.matchMedia("(max-width: 860px)").matches) return;
      gsap.from(view === "chat" ? ".chat" : ".inbox", {
        opacity: 0,
        x: view === "chat" ? -16 : 16,
        duration: 0.3,
        ease: "power2.out",
      });
    },
    { scope: root, dependencies: [view] }
  );

  function showItem(id) {
    setHighlight((prev) => ({ id, n: prev.n + 1 }));
    setView("inbox");
  }

  return (
    <div className={`app view-${view}`} ref={root}>
      <Chat
        items={items}
        onSave={addItem}
        onShowItem={showItem}
        onOpenInbox={() => setView("inbox")}
      />

      <section className="pane inbox" aria-label="Inbox">
        <header className="pane-head">
          <button type="button" className="ghost mobile-only" onClick={() => setView("chat")}>
            Back to chat
          </button>
          <h2>Inbox</h2>
          <span className="count">{items.length}</span>
        </header>
        <div className="inbox-body">
          {error && <p className="error">{error}</p>}
          <ItemList items={items} highlight={highlight} />
        </div>
      </section>
    </div>
  );
}
