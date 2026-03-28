-- migrations/003_add_chunk_ids.sql

ALTER TABLE messages ADD COLUMN IF NOT EXISTS chunk_ids UUID[] DEFAULT '{}';