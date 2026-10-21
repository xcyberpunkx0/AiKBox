import { useState } from "react";
import { askQuestion } from "../api.js";

export default function AskPanel() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await askQuestion(question));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form className="card ask-form" onSubmit={handleSubmit}>
        <input
          aria-label="Question"
          placeholder="e.g. When is my dentist appointment?"
          maxLength={1000}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" disabled={loading || !question.trim()}>
          {loading ? "Thinking..." : "Ask"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {result && <Answer result={result} />}
    </div>
  );
}

function Answer({ result }) {
  return (
    <div className="card answer">
      <p className="answer-text">{result.answer}</p>

      {result.sources.length > 0 && (
        <>
          <h3>Sources</h3>
          <ol className="sources">
            {result.sources.map((source) => (
              <li key={source.citation} className="source">
                <div className="item-head">
                  <span className="tag">[{source.citation}]</span>
                  {source.url ? (
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.title || source.url}
                    </a>
                  ) : (
                    <span>Note #{source.item_id}</span>
                  )}
                  <span className="muted">relevance {source.score.toFixed(2)}</span>
                </div>
                <blockquote>{source.snippet}</blockquote>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
