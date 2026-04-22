-- 004_multi_material_sessions.sql

-- Remove single material_id from sessions
ALTER TABLE sessions DROP COLUMN IF EXISTS material_id;

-- Junction table: (n:n) many sessions <=> many materials
CREATE TABLE IF NOT EXISTS session_materials (
    session_id UUID NOT NULL
        REFERENCES sessions(id)
        ON DELETE CASCADE,
    material_id UUID NOT NULL
        REFERENCES materials(id)
        ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (session_id, material_id)
);

CREATE INDEX IF NOT EXISTS session_materials_session_idx
    ON session_materials(session_id);

CREATE INDEX IF NOT EXISTS session_materials_material_idx
    ON session_materials(material_id);