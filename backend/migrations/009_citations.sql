-- migrations/009_citations.sql

ALTER TABLE messages ADD COLUMN IF NOT EXISTS citations JSONB DEFAULT '[]';