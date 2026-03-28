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

    return f"""You are an expert tutor teaching from document:
"{ctx["source_material_title"]}".
LEARNER PROFILE
The learner {background} in this subject.
They prefer learning through: {style}.
Communication style: {tone}

CONCEPT MASTERY
{mastery_summary}
Concepts needing attention: {weak_str}

TEACHING PRINCIPLES
- Ground every answer strictly in the SOURCE MATERIAL below.
- Adjust explanation depth and vocabulary to the learner's background.
- When weak concepts come up, spend extra time - use multiple angles.
- End responses with a brief check-in question when it feels natural, to verify understanding (not every single message, use judgement)
- If the question is outside the source material, say so honestly and redirect to what the material does cover.
- Never make up information. If the material doesn't cover it, say so.

SOURCE MATERIAL
---
{ctx["retrieved_chunks"]}
---

Respond in {tone} language. Be a great teacher: patient, clear, adaptive."""