# app/services/mastery.py

import math
import uuid

# irt params
DIFFICULTY_BETA = {'easy': -1.0, 'medium': 0.0, 'hard': 1.0}
LEARNING_RATE = 0.3
WEIGHTS = {'irt': 0.6, 'llm': 0.3, 'self': 0.1}

CHAT_ASSESSMENT_INTERVAL = 5 # assess every N assistant messages

# irt math
def irt_probability(theta: float, beta: float) -> float:
    """P(correct | theta, beta) - 1PL logistic model"""
    return 1.0 / (1.0 + math.exp(-(theta - beta)))

def update_theta(theta: float, beta: float, correct: bool) -> float:
    """Update ability estimate θ based on one correct observation"""
    p = irt_probability(theta, beta)
    observed = 1.0 if correct else 0.0
    return theta + LEARNING_RATE * (observed - p)

def theta_to_score(theta: float) -> float:
    """Map θ (roughly -3 to +3) -> display score (0 to 1)"""
    return 1.0 / (1.0 + math.exp(-theta))

def score_to_theta(score: float) -> float:
    """Map display to score -> θ"""
    score = max(0.001, min(0.999, score))
    return math.log(score / (1 - score))

def aggregate_score(
    irt_score: float,
    llm_score: float | None,
    self_score: float | None,
) -> float:
    """Weighted aggregation, Redistributes weight if a signal is missing"""
    signals = {'irt': irt_score}
    if llm_score is not None:
        signals['llm'] = llm_score
    if self_score is not None:
        signals['self'] = self_score
    total_weight = sum(WEIGHTS[k] for k in signals)
    return sum((WEIGHTS[k] / total_weight) * v for k, v in signals.items())

# quiz based mastery update (irt)
async def update_mastery(
    user_id: str,
    material_id: uuid.UUID,
    graded_quiz: dict,
    pool,
    session_id: uuid.UUID | None = None,
):
    """Update mastery scores using IRT after a quiz submission"""
    concept_questions: dict[str, list[dict]] = {}
    for r in graded_quiz['results']:
        concept_questions.setdefault(r['concept'], []).append(r)

    async with pool.acquire() as conn:
        for concept, questions in concept_questions.items():
            # load current state
            row = await conn.fetchrow(
                """
                SELECT theta, irt_score, llm_score, self_score, attempts
                FROM mastery_scores
                WHERE user_id=$1 AND material_id=$2 AND concept=$3
                """,
                user_id, material_id, concept
            )
            theta = row['theta'] if row else 0.0
            llm_score = row['llm_score'] if row else None
            self_score = row['self_score'] if row else None

            # apply irt update for each questions
            for q in questions:
                difficulty = q.get('difficulty', 'medium')
                beta = DIFFICULTY_BETA.get(difficulty, 0.0)
                correct = q['score'] >= 0.8
                theta_before = theta
                theta = update_theta(theta, beta, correct)

                await conn.execute(
                    """
                    INSERT INTO mastery_interactions
                    (id, user_id, material_id, concept, session_id,
                     interaction_type, question_text, difficulty, correct,
                     score, theta_before, theta_after) VALUES
                     ($1, $2, $3, $4, $5, $6, $7, $8::float, $9, $10, $11, $12)
                    """,
                    uuid.uuid4(), user_id, material_id, concept, session_id,
                    'quiz_mcq' if q.get('type') == 'mcq' else 'quiz_short',
                    q.get('question_text'), DIFFICULTY_BETA.get(difficulty, 0.0),
                    correct, q['score'], theta_before, theta
                )

                irt_score = theta_to_score(theta)

                await conn.execute(
                    """
                    INSERT INTO mastery_scores
                    (user_id, material_id, concept, theta, irt_score,
                     llm_score, self_score, attempts, last_quiz_at, last_updated)
                    VALUES ($1, $2, $3, $4, $5, $6::float, $7::float, $8, NOW(), NOW())
                    ON CONFLICT (user_id, material_id, concept) DO UPDATE SET
                        theta = EXCLUDED.theta,
                        irt_score = EXCLUDED.irt_score,
                        attempts = mastery_scores.attempts + $8,
                        last_quiz_at = NOW(),
                        last_updated = NOW()
                    """,
                    user_id, material_id, concept, theta, irt_score,
                    llm_score, self_score, len(questions)
                )

# llm chat assessment
async def assess_chat_mastery(
    session_id: uuid.UUID,
    material_ids: list[uuid.UUID],
    pool,
) -> None:
    """
    Assess concept understanding from recent chat messages.
    Called every CHAT_ASSESSMENT_INTERVAL assistant messages.
    Runs as a background task — never blocks the chat response.
    """
    import json, re
    from app.services.llm import _chat, FAST

    async with pool.acquire() as conn:
        messages = await conn.fetch(
            """SELECT role, content FROM messages
               WHERE session_id=$1
               ORDER BY created_at DESC LIMIT 20""",
            session_id
        )
        concept_rows = await conn.fetch(
            """SELECT DISTINCT concept FROM mastery_scores
               WHERE material_id = ANY($1::uuid[])""",
            material_ids
        )
        user_row = await conn.fetchrow(
            "SELECT user_id FROM sessions WHERE id=$1", session_id
        )

    if not messages or not concept_rows or not user_row:
        return

    concepts = [r['concept'] for r in concept_rows]
    user_id  = str(user_row['user_id'])

    conversation = "\n".join(
        f"{m['role'].upper()}: {m['content'][:300]}"
        for m in reversed(messages)
    )

    prompt = (
        f"Analyse this learning conversation and assess the student's understanding.\n\n"
        f"Concepts to assess: {', '.join(concepts[:15])}\n\n"
        f"Conversation:\n{conversation}\n\n"
        f"For each concept that was actually discussed, rate demonstrated understanding "
        f"from 0.0 (confused) to 1.0 (clear mastery). "
        f"Only include concepts that appeared in the conversation.\n"
        f"Respond with JSON only: {{\"concept\": score}}"
    )

    raw = await _chat(FAST, prompt, max_tokens=300)
    raw = raw.strip().removeprefix('```json').removeprefix('```').removesuffix('```').strip()
    try:
        assessments = json.loads(raw)
    except Exception:
        match = re.search(r'\{.*?\}', raw, re.DOTALL)
        assessments = json.loads(match.group()) if match else {}

    if not assessments:
        return

    async with pool.acquire() as conn:
        for concept, llm_score in assessments.items():
            if not isinstance(llm_score, (int, float)):
                continue
            llm_score = max(0.0, min(1.0, float(llm_score)))

            row = await conn.fetchrow(
                """SELECT theta, irt_score, self_score FROM mastery_scores
                   WHERE user_id=$1 AND material_id = ANY($2::uuid[]) AND concept=$3
                   LIMIT 1""",
                user_id, material_ids, concept
            )
            if not row:
                continue

            final_score = aggregate_score(row['irt_score'], llm_score, row['self_score'])

            # Use first material_id that has this concept
            material_row = await conn.fetchrow(
                """SELECT material_id FROM mastery_scores
                   WHERE user_id=$1 AND concept=$2 AND material_id = ANY($3::uuid[])
                   LIMIT 1""",
                user_id, concept, material_ids
            )
            if not material_row:
                continue

            await conn.execute(
                """UPDATE mastery_scores SET
                   llm_score=$1, last_chat_at=NOW(), last_updated=NOW()
                   WHERE user_id=$2 AND material_id=$3 AND concept=$4""",
                llm_score, user_id, material_row['material_id'], concept
            )

            await conn.execute(
                """INSERT INTO mastery_interactions
                   (id, user_id, material_id, concept, session_id,
                    interaction_type, score, theta_before, theta_after)
                   VALUES ($1,$2,$3,$4,$5,'chat_assessment',$6,$7,$7)""",
                uuid.uuid4(), user_id, material_row['material_id'],
                concept, session_id, llm_score,
                score_to_theta(llm_score),
            )

# self report
SELF_REPORT_SCORE = {1: 0.1, 2: 0.35, 3: 0.65, 4: 0.9}

async def update_self_report(
    user_id: str,
    material_id: uuid.UUID,
    concept: str,
    confidence: int,
    pool,
    session_id: uuid.UUID | None = None,
):
    self_score = SELF_REPORT_SCORE.get(confidence, 0.5)

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT theta, irt_score, llm_score
            FROM mastery_scores
            WHERE user_id=$1
                AND material_id=$2
                AND concept=$3
            """,
            user_id, material_id, concept
        )
        if not row:
            return

        final_score = aggregate_score(row['irt_score'], row['llm_score'], self_score)

        await conn.execute(
            """
            UPDATE mastery_scores SET
            self_score=$1, last_updated=NOW()
            WHERE user_id=$2
                AND material_id=$3
                AND concept=$4
            """,
            self_score, user_id, material_id, concept
        )

        await conn.execute(
            """
            INSERT INTO mastery_interactions
            (id, user_id, material_id, concept, session_id,
             interaction_type, score, theta_before, theta_after)
            VALUES ($1, $2, $3, $4, $5, 'self_report', $6, $7, $7)
            """,
            uuid.uuid4(), user_id, material_id, concept, session_id, self_score, score_to_theta(self_score),
        )