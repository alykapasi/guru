-- 005_mastery_v2.sql

-- Drop old simple mastery table
DROP TABLE IF EXISTS mastery_scores;

-- New IRT-based mastery table
CREATE TABLE IF NOT EXISTS mastery_scores (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    material_id     UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    concept         TEXT NOT NULL,

    -- IRT ability estimate (internal scale, mapped to 0-1 for display)
    theta           FLOAT NOT NULL DEFAULT 0.0,

    -- Component signals
    irt_score       FLOAT NOT NULL DEFAULT 0.5,
    llm_score       FLOAT,
    self_score      FLOAT,

    -- Metadata
    attempts        INT NOT NULL DEFAULT 0,
    last_quiz_at    TIMESTAMPTZ,
    last_chat_at    TIMESTAMPTZ,
    last_updated    TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY (user_id, material_id, concept)
);

-- Interaction log for future DKT training
CREATE TABLE IF NOT EXISTS mastery_interactions (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    material_id      UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    concept          TEXT NOT NULL,
    session_id       UUID REFERENCES sessions(id),
    interaction_type TEXT NOT NULL,  -- 'quiz_mcq', 'quiz_short', 'chat_assessment', 'self_report'
    question_text    TEXT,
    difficulty       FLOAT,          -- 0.0 to 1.0
    correct          BOOLEAN,
    score            FLOAT,
    theta_before     FLOAT,
    theta_after      FLOAT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mastery_interactions_user_concept_idx
    ON mastery_interactions(user_id, concept, created_at);
