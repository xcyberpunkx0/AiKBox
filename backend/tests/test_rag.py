from app.rag import build_prompt, cited_numbers


def test_cited_numbers_handles_single_adjacent_and_grouped():
    answer = "It's on Nov 14 [1]. RAG grounds answers [2][3], see also [4, 5]."
    assert cited_numbers(answer) == {1, 2, 3, 4, 5}


def test_cited_numbers_ignores_text_without_citations():
    assert cited_numbers("I couldn't find that [in your notes].") == set()


def test_build_prompt_numbers_sources_in_order():
    hits = [
        {"title": "Dentist", "url": None, "text": "Nov 14 at 3pm"},
        {"title": None, "url": "https://example.com", "text": "Some page"},
    ]
    prompt = build_prompt("When?", hits)
    assert '<source id="1" title="Dentist">' in prompt
    assert '<source id="2" title="https://example.com">' in prompt
    assert prompt.endswith("Question: When?")
