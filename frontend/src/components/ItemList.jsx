export default function ItemList({ items }) {
  if (items.length === 0) {
    return <p className="muted">Nothing saved yet.</p>;
  }
  return (
    <ul className="items">
      {items.map((item) => (
        <ItemRow key={item.id} item={item} />
      ))}
    </ul>
  );
}

function ItemRow({ item }) {
  return (
    <li className="card">
      <div className="item-head">
        <span className="tag">{item.source_type}</span>
        <span className={`status status-${item.status}`}>{item.status}</span>
        <time className="muted">{new Date(item.created_at).toLocaleString()}</time>
      </div>

      {item.source_type === "url" && (
        <a href={item.url} target="_blank" rel="noreferrer" className="item-title">
          {item.title || item.url}
        </a>
      )}
      {item.preview && <p className="preview">{item.preview}</p>}
      {item.error && <p className="error">{item.error}</p>}
    </li>
  );
}
