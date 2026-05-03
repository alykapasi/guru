-- migrations/006_sub_documents.sql

ALTER TABLE materials ADD COLUMN IF NOT EXISTS sub_doc_count INT DEFAULT 1;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS sub_doc_index INT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS parent_material_id UUID REFERENCES materials(id);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS page_range INT[];