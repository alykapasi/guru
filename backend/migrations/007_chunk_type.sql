-- migrations/007_chunk_type.sql

ALTER TABLE chunks ADD COLUMN IF NOT EXISTS chunk_type TEXT DEFAULT 'normal';
CREATE INDEX IF NOT EXISTS chunks_type_idx ON chunks(chunk_type);