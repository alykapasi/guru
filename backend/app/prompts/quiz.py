# app/prompts/quiz.py
def build_quiz_prompt(ctx: dict, topic: str | None, n: int) -> str:
    topic_str = f"the topic: '{topic}'" if topic else "the full material"
    concepts = ctx["all_concepts"]
    weak = ctx["weak_concepts"]
    n_short = max(2, n // 4)
    n_mcq = n - n_short

    weak_note = ""
    if weak:
        weak_note = f"Prioritize these weaker concepts: {', '.join(weak[:5])}.\n"
    
    return f"""Generate a quiz on {topic_str} using only the source mateiral below.
{weak_note}
Requirements:
- {n_mcq} multiple-choice questions (4 options each, exactly one correct)
- {n_short} short-answer questions
- Cover these concepts where possible: {", ".join(concepts[:12])}
- Tag each question with exactly one concept from that list
- Vary difficulty: ~40% easy, ~40% medium, ~20% hard

Respond with ONLY a JSON array - no preamble, no markdown fences.
Each item must match this schema exactly:
MCQ:    {{"id": "q1", "type": "mcq", "concept": "...", "question": "...",
          "options": {{"A": "...", "B": "...", "C": "...", "D": "..."}},
          "correct": "A", "difficulty: "easy|medium|hard"}}
SA:     {{"id": "q2", "type": "short_answer", "concept": "...", "question": "...",
          "ideal_answer": "...", "difficulty": "easy|medium|hard"}}

SOURCE MATERIAL
---
{ctx["retrieved_chunks"]}
---
"""