import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { reducedMotion } from "../motion.js";

export default function ItemList({ items, highlight }) {
  if (items.length === 0) {
    return (
      <div className="empty">
        <h2>Nothing saved yet</h2>
        <p>Use + in the chat to save a note or a link. It shows up here while it's being indexed.</p>
      </div>
    );
  }
  return (
    <ul className="items">
      {items.map((item, index) => (
        <ItemRow key={item.id} item={item} index={index} highlight={highlight} />
      ))}
    </ul>
  );
}

function ItemRow({ item, index, highlight }) {
  const row = useRef(null);
  const prevStatus = useRef(item.status);

  // Runs once when the row mounts. On page load the index staggers the rows;
  // a newly added item sits at index 0, so it comes in straight away.
  useGSAP(
    () => {
      if (reducedMotion) return;
      gsap.from(row.current, {
        y: 12,
        opacity: 0,
        duration: 0.4,
        ease: "power2.out",
        delay: Math.min(index, 10) * 0.04,
      });
    },
    { scope: row }
  );

  // Pop the badge when background processing finishes
  useGSAP(
    () => {
      const finished = prevStatus.current === "pending" && item.status !== "pending";
      prevStatus.current = item.status;
      if (!finished || reducedMotion) return;
      gsap.fromTo(".status", { scale: 1.3 }, { scale: 1, duration: 0.5, ease: "back.out(3)" });
    },
    { scope: row, dependencies: [item.status] }
  );

  // A source was clicked in the chat: bring this item into view and tint it for a moment
  useGSAP(
    () => {
      if (highlight.id !== item.id) return;
      row.current.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
      const tint = getComputedStyle(row.current).getPropertyValue("--accent-soft").trim();
      gsap.fromTo(
        row.current,
        { backgroundColor: tint },
        {
          backgroundColor: "rgba(0, 0, 0, 0)",
          duration: reducedMotion ? 0 : 1.2,
          delay: 1,
          // Hand the background back to CSS so the hover colour works again
          clearProps: "backgroundColor",
        }
      );
    },
    { dependencies: [highlight] }
  );

  const isLink = item.source_type === "url";
  const created = new Date(item.created_at);

  // Laid out like a mail list: where it came from and when, then the title and a snippet
  return (
    <li ref={row} className="item">
      <div className="item-head">
        <span className={`status status-${item.status}`} role="img" aria-label={item.status} title={item.status} />
        <span className="item-from">{isLink ? new URL(item.url).hostname.replace(/^www\./, "") : "Note"}</span>
        <time dateTime={item.created_at} title={created.toLocaleString()}>
          {shortDate(created)}
        </time>
      </div>
      <p className="item-body">
        {isLink && (
          <a href={item.url} target="_blank" rel="noreferrer" className="item-title">
            {item.title || item.url}
          </a>
        )}
        {isLink && (item.preview || item.error) && " - "}
        {item.error ? (
          <span className="error">{item.error}</span>
        ) : (
          item.preview ?? <span className="muted">Fetching page...</span>
        )}
      </p>
    </li>
  );
}

// Today shows the time, anything older shows the date, like most mail apps
function shortDate(date) {
  if (date.toDateString() === new Date().toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}
