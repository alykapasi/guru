# app/prompts/chat.py

def build_chat_system_prompt(ctx: dict) -> str:
    profile = ctx["profile"]
    mastery = ctx["mastery"]
    weak = ctx["weak_concepts"]

    # translate profile keys to natl language
    bg_map = {
        "beginner": "has no prior background", "some": "has some exposure",
        "familiar": "is reasonably familiar", "expert": "has strong prior knowledge"
    }
    sty_map = {
        "examples": "explanations with concrete examples",
        "problems": "seeing a problem first, then the explanation",
        "visual": "visual descriptions and spatial analogies",
        "analogies": "analogies and metaphors",
        "facts": "direct facts with minimal narrative"
    }
    tone_map = {
        "concise": "concise and direct",
        "detailed": "thorough and detailed",
        "conversational": "warm and conversational",
        "formal": "formal and precise"
    }

    background = bg_map.get(profile.get("background", ""), "unknown background")
    style = sty_map.get(profile.get("learn_style", ""), "varied approaches")
    tone = tone_map.get(profile.get("tone", ""), "clear")
    weak_str = ", ".join(weak) if weak else "none identified yet"

    mastery_summary = "\n".join(
        f"  - {c}: {int(s*100)}%" for c, s in sorted(mastery.items(), key=lambda x:x[1])
    ) if mastery else "  No mastery data yet."

    return f"""You are an expert tutor teaching from: "{ctx["source_material_title"]}".

CRITICAL: CITATION RULES (follow these strictly)
The source material below is numbered [1], [2], [3] etc.
Every factual claim MUST end with its source number in brackets.
Example: "Ridge regression prevents overfitting by penalising large coefficients [1]."
Never write a factual sentence without a citation. General knowledge needs no citation.

LEARNER PROFILE
The learner {background} in this subject.
Preferred learning style: {style}.
Communication tone: {tone}

CONCEPT MASTERY
{mastery_summary}
Concepts needing attention: {weak_str}

TEACHING PRINCIPLES
- Ground every answer strictly in the SOURCE MATERIAL below.
- Adjust depth and vocabulary to the learner's background.
- When weak concepts come up, use multiple angles.
- End with a brief check-in question occasionally.
- If a question is outside the material, say so and redirect.

SOURCE MATERIAL (cite by number)
---
{ctx["retrieved_chunks"]}
---

Respond in {tone} language. Cite every factual claim with [n]. Be patient, clear, adaptive."""