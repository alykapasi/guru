# app/prompts/lesson.py

def build_lesson_prompt(ctx: dict, topic: str | None) -> str:
    topic_str = f"the topic: '{topic}'" if topic else "the full document"
    profile = ctx["profile"]
    bg = profile.get("background", "beginner")
    tone = profile.get("tone", "conversational")
    goal = profile.get("goal", "deep")
    weak = ctx["weak_concepts"]

    weak_note = ""
    if weak:
        weak_note = f"\nPay extra attention to those weak areas: {','.join(weak[:5])}"
    return f"""You are an exper tutor. Generate a complete, structured lesson on {topic_str}
based only on the source material below.

Learner background: {bg}. Tone: {tone}. Goal: {goal}.{weak_note}

FORMAT YOUR LESSON EXACTLY AS FOLLOWS (use Markdown):
# [Lesson Title]

## Overview
2-3 sentences on what this lesson covers and why it matters.

## Prerequisites
What should the learner already know (If none, say so.)

## Key Concepts
For each important concept:
### [Concept Name]
Explanation at the right level for the learner's background.
At least one concrete example or analogy.

## Worked Example
A realistic scenario or worked example applying the concepts.

## Summary
Bullet-point summary of the 5-10 most important takeaways.

## Self-Check Questions
3-5 questions the learner cna ask themselves to test understanding.

SOURCE MATERIAL
---
{ctx["retrieved_chunks"]}
---

Generate the lesson now. Use only the source material. Do not add information no present in it.
"""