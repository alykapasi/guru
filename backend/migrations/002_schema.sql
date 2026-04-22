-- migrations/002_schema.sql

-- USERS
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- LEARNER PROFILES
-- JSONB for onboarding answers: flexible no ALTER TABLE needed
-- as we add or change onboarding questions
CREATE TABLE IF NOT EXISTS learner_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    answers JSONB NOT NULL DEFAULT '{}',
    -- answers shape:
    -- {
    --  background: 'beginner' | 'some' | 'familiar' | 'expert',
    --  learn_style: 'examples' | 'problems' | 'visual' | 'analogies' | 'facts',
    --  goal: 'exam' | 'deep' | 'overview' | 'work',
    --  session_length: 'lt15' | '15-30' | '30-60' | 'gt60',
    --  tone: 'concise' | 'detailed' | 'conversational' | 'formal',
    -- }
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- UPLOAD MATERIALS
CREATE TABLE IF NOT EXISTS materials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL,
    minio_key TEXT NOT NULL,
    status TEXT NOT NULL,
    -- 'pending' -> 'ingesting' -> 'ready'|'error'
    page_count INT,
    word_count INT,
    concepts TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- DOCUMENT CHUNKS
CREATE TABLE IF NOT EXISTS chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    heading_path TEXT[],
    raw_text TEXT NOT NULL,
    context_text TEXT NOT NULL,
    full_text TEXT NOT NULL,
    token_count INT,
    embedding vector(1024),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ANN index - cosine similarity, use ivfflat for v0
-- Run AFTER inserting data, not before
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
    ON chunks USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- STUDY SESSIONS
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    material_id UUID REFERENCES materials(id) ON DELETE SET NULL,
    mode TEXT NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

-- CHAT HISTORY
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    chunks_ids UUID[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MASTERY SCORES
CREATE TABLE IF NOT EXISTS mastery_scores (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    concept TEXT NOT NULL,
    score FLOAT NOT NULL DEFAULT 0.5, -- [0,1]
    attempts INT NOT NULL DEFAULT 0,
    last_tested TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, material_id, concept)
);

-- QUIZ ATTEMPTS
CREATE TABLE IF NOT EXISTS quiz_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    questions JSONB NOT NULL,
    score FLOAT,
    submitted_at TIMESTAMPTZ
);
