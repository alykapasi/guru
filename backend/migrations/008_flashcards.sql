-- migrations/008_flashcards.sql

CREATE TABLE IF NOT EXISTS flashcards (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    material_id     UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    concept         TEXT NOT NULL,
    front           TEXT NOT NULL,
    back            TEXT NOT NULL,
    source_chunk_id UUID REFERENCES chunks(id) ON DELETE SET NULL,
    interval        FLOAT  NOT NULL DEFAULT 1,
    ease_factor     FLOAT  NOT NULL DEFAULT 2.5,
    repetitions     INT    NOT NULL DEFAULT 0,
    due_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    last_reviewed   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS flashcards_user_due_idx
    ON flashcards(user_id, due_at);

CREATE INDEX IF NOT EXISTS flashcards_concept_idx
    ON flashcards(user_id, material_id, concept);

CREATE TABLE IF NOT EXISTS flashcard_reviews (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id         UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
    grade           INT NOT NULL,
    interval_before FLOAT,
    interval_after  FLOAT,
    theta_before    FLOAT,
    theta_after     FLOAT,
    reviewed_at     TIMESTAMPTZ DEFAULT NOW()
);
