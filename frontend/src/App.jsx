import AddItemForm from "./components/AddItemForm.jsx";
import AskPanel from "./components/AskPanel.jsx";
import ItemList from "./components/ItemList.jsx";
import { useItems } from "./useItems.js";

export default function App() {
  const { items, error, addItem } = useItems();

  return (
    <div className="page">
      <header>
        <h1>Knowledge Inbox</h1>
        <p className="muted">Save notes and links, then ask questions about them.</p>
      </header>

      <main className="layout">
        <section>
          <h2>Add to inbox</h2>
          <AddItemForm onAdd={addItem} />

          <h2>Saved items ({items.length})</h2>
          {error && <p className="error">{error}</p>}
          <ItemList items={items} />
        </section>

        <section>
          <h2>Ask your inbox</h2>
          <AskPanel />
        </section>
      </main>
    </div>
  );
}
