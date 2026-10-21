from app.chunker import chunk_text


def test_short_text_is_one_chunk():
    assert chunk_text("Hello there.\nSecond line.") == ["Hello there.\nSecond line."]


def test_blank_text_gives_no_chunks():
    assert chunk_text("  \n\n  ") == []


def test_chunks_respect_max_size_and_overlap():
    paragraphs = [f"Paragraph {i} " + "word " * 60 for i in range(20)]
    chunks = chunk_text("\n\n".join(paragraphs), max_chars=500, overlap=100)

    assert len(chunks) > 1
    assert all(len(c) <= 500 for c in chunks)
    # each chunk starts with words carried over from the end of the previous one
    for prev, nxt in zip(chunks, chunks[1:]):
        assert prev.endswith(nxt.split("\n")[0])


def test_long_paragraph_without_punctuation_is_hard_split():
    chunks = chunk_text("x" * 3000, max_chars=500, overlap=100)
    assert all(len(c) <= 500 for c in chunks)
    assert "".join(chunks).count("x") >= 3000
