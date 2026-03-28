# app/services/ingestion.py

import asyncio
from docling.document_converter import DocumentConverter
from docling.datamodel.base_models import InputFormat, DocItemLabel
import pathlib 
import tempfile
import uuid

from app.services.storage import download_from_minio
from app.services.llm import extract_concepts, generate_context_prefix
from app.services.embedding import embed_texts

MAX_CHUNK_TOKENS = 600
OVERLAP_TOKENS = 60

async def ingest_material(material_id: uuid.UUID, minio_key: str, pool):
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE materials SET status='ingesting' WHERE id=$1",
            material_id
        )
    try:
        await _run_ingestion(material_id, minio_key, pool)
    except Exception as e:
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE materials SET status='error' WHERE id=$1",
                material_id
            )
        raise

async def _run_ingestion(material_id: uuid.UUID, minio_key: str, pool):
    # 1. download from minio
    with tempfile.TemporaryDirectory() as tmpdir:
        local_path = pathlib.Path(tmpdir) / minio_key.split('/')[-1]
        await download_from_minio(minio_key, local_path)

        # 2. parse with docling
        converter = DocumentConverter()
        result = converter.convert(local_path)
        doc = result.document

        # DEBUG
        # print("=== DOCLING ITEMS ===")
        # for item, level in doc.iterate_items():
        #     print(f"  level={level} label={getattr(item, 'label', None)!r} text={getattr(item, 'text', '')[:60]!r}")

        # # 3. chunk by structure
        raw_chunks = _chunk_document(doc)
        # print(f"=== CHUNKS: {len(raw_chunks)} ===")
        # for c in raw_chunks[:3]:
        #     print(f"  heading={c['heading_path']} text={c['text'][:80]!r}")
    
    # 4. generate context prefix for each chunk
    # get full document text for context generation
    full_doc_text = doc.export_to_markdown()[:8000]

    enriched = []
    for i, chunk in enumerate(raw_chunks):
        prefix = await generate_context_prefix(
            document_summary=full_doc_text,
            chunk_text=chunk["text"],
            heading_path=chunk["heading_path"]
        )
        full_text = f"{prefix}\n\n{chunk['text']}"
        enriched.append({**chunk, "context_text": prefix, "full_text": full_text})
        if i < len(raw_chunks) - 1:
            await asyncio.sleep(1)

    # 5. extract concepts
    concepts = await extract_concepts(full_doc_text)

    # 6. embed all chunks
    texts_to_embed = [c['full_text'] for c in enriched]
    embeddings = await embed_texts(texts_to_embed)

    # 7. write to Postgres
    async with pool.acquire() as conn:
        async with conn.transaction():
            for i, (chunk, emb) in enumerate(zip(enriched, embeddings)):
                await conn.execute(
                    """INSERT INTO chunks
                    (id, material_id, chunk_index, heading_path, raw_text, context_text, full_text, embedding)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector)""",
                    uuid.uuid4(), material_id, i,
                    chunk["heading_path"],
                    chunk["text"],
                    chunk["context_text"],
                    chunk["full_text"],
                    str(emb)
                )
            await conn.execute(
                "UPDATE materials SET status='ready', concepts=$1 WHERE id=$2",
                concepts, material_id
            )

def _chunk_document(doc) -> list[dict]:
    """
    walk docling's doc tree and produce structure-aware chunks
    each chunk keeps its heading_path (breadcrumb) for context
    """
    chunks = []
    # docling exports to a list of elements with .label and .text
    # labels: 'section_header', 'text', 'list_item', 'table', 'figure_caption'
    current_heading_path = []
    current_section_text = []

    def flush(heading_path, text_parts):
        if not text_parts:
            return
        full = " ".join(text_parts).strip()
        if len(full) < 80:
            return
        # split if too long
        chunks.extend(_split_if_long(full, heading_path[:]))

    for element, _level in doc.iterate_items():
        label = getattr(element, "label", None)
        text = getattr(element, "text", "") or ""
        text = text.strip()
        if not text:
            continue

        if label == DocItemLabel.SECTION_HEADER:
            # flush current section before starting a new one
            flush(current_heading_path[:], current_section_text[:])
            current_section_text = []
            # docling provides heading level on the element
            level = getattr(element, "level", 1) or 1
            # trim path to current level and append new heading
            current_heading_path = current_heading_path[:level-1] + [text]
        else:
            current_section_text.append(text)

    flush(current_heading_path, current_section_text)
    return chunks

def _split_if_long(text: str, heading_path: list[str]) -> list[dict]:
    """Split long seeections into paragraph boundaries with overlap"""
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks = []
    current, current_len = [], 0

    for para in paragraphs:
        para_len = len(para.split())
        if current_len + para_len > MAX_CHUNK_TOKENS and current:
            chunks.append({'text': "\n\n".join(current), "heading_path": heading_path})
            # keep last paragraph as overlap context
            current = current[-1:] + [para]
            current_len = len(" ".join(current).split())
        else:
            current.append(para)
            current_len += para_len

    if current:
        chunks.append({"text": "\n\n".join(current), "heading_path": heading_path})

    return chunks