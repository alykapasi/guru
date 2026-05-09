# app/services/citations.py

import re

def extract_citation_numbers(text: str) -> list[int]:
    return sorted(set(int(n) for n in re.findall(r'\[(\d+)\]', text)))

def resolve_citations(reply: str, chunks: list[dict]) -> list[dict]:
    """Map [n] markers in reply to chunk metadata, chunk is 1-indexed"""
    cited = extract_citation_numbers(reply)
    if not cited:
        return []
    citations = []
    for n in cited:
        idx = n - 1
        if 0 <= idx < len(chunks):
            c = chunks[idx]
            citations.append({
                "n": n,
                "chunk_id": str(c["id"]),
                "material_title": c.get("material_title", ""),
                "heading_path": c.get("heading_path", []),
                "excerpt": c["raw_text"][:300],
            })
    return citations