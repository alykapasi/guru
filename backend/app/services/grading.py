# app/services/grading.py

import json

from app.services.llm import _chat, FAST

async def grade_quiz(questions: list[dict], answers: dict[str, str]) -> dict:
    results = []
    for i, q in enumerate(questions):
        # Use model's id if present, fall back to index-based id
        qid = q.get("id") or f"q{i}"
        user_answer = answers.get(qid, "")

        if q.get("type") == "mcq":
            correct_key = (
                q.get("correct") or q.get("correct_answer") or
                q.get("answer") or q.get("correctAnswer") or ""
            )
            correct = user_answer.strip().upper() == correct_key.strip().upper()
            score = 1.0 if correct else 0.0
            feedback = None
        else:
            ideal = q.get("ideal_answer") or q.get("answer") or ""
            question_text = q.get("question") or ""
            score, feedback = await _grade_short_answer(question_text, ideal, user_answer)

        results.append({
            "question_id": qid,
            "concept": q.get("concept", "General"),
            "score": score,
            "feedback": feedback,
            "correct_answer": (
                q.get("correct") or q.get("correct_answer") or
                q.get("ideal_answer") or q.get("answer") or ""
            ),
        })

    overall = sum(r["score"] for r in results) / len(results) if results else 0
    return {"results": results, "overall_score": round(overall, 3)}
    
async def _grade_short_answer(question, ideal, user_answer) -> tuple[float, str]:
    prompt = f"""Grade this answer. Respond with JSON only, no markdown: 
                {{\"score\": 0.0-1.0, \"feedback\": \"...\"}}\n
                Question: {question}\n
                Ideal answer: {ideal}\n
                Student answer: {user_answer}"""
    raw = await _chat(
        model=FAST, 
        prompt=prompt,
        max_tokens=200
    )
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    import re
    match = re.search(r"\{[^{}]+\}", raw, re.DOTALL)
    if not match:
        return 0.5, "Could not grade automatically."

    data = json.loads(match.group())
    return float(data.get("score", 0.5)), data.get("feedback") or data.get("comment") or data.get("explanation") or "No feedback provided."