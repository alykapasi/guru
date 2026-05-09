# app/services/ingestion.py

import asyncio
from docling.document_converter import DocumentConverter
from docling.datamodel.base_models import InputFormat, DocItemLabel
import fitz
import math
import pathlib
import re
import tempfile
import uuid

from app.services.embedding import embed_texts
from app.services.llm import extract_concepts, generate_context_prefix
from app.services.storage import download_from_minio
from app.services.vision import transcribe_image

MAX_CHUNK_TOKENS = 600
OVERLAP_TOKENS = 60
SUB_DOC_PAGE_LIMIT = 25
IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".webp"}
TEXT_TYPES = {".txt", ".md", ".markdown"}
DOC_TYPES = {".pdf", ".docx", ".pptx"}
SKIP_LABELS = {"page_header", "page_footer", "footnote"}
JUNK_HEADING_PATTERNS = [
    r'^acknowledgements?$', r'^preface$', r'^foreword$',
    r'^dedication$', r'^copyright', r'^table of contents$',
    r'^contents$', r'^index$', r'^about the author',
    r'^colophon$', r'^list of (figures|tables|abbreviations)', 
]
BORDERLINE_HEADING_PATTERNS = [
    r'^references?$', r'^bibliography$', r'^appendix',
    r'^glossary$', r'^notes?$', r'^further reading$',
    r'^works cited$', r'^endnotes?$',
]

def classify_section(heading_path: list[str], label: str) -> str:
    """Returns 'skip', 'borderline', or 'normal'."""
    label_lower = (label or "").lower().replace(" ", "_")
    if label_lower in SKIP_LABELS:
        return "skip"
    heading_text = " ".join(heading_path).lower().strip()
    for pattern in JUNK_HEADING_PATTERNS:
        if re.search(pattern, heading_text):
            return "skip"
    for pattern in BORDERLINE_HEADING_PATTERNS:
        if re.search(pattern, heading_text):
            return "borderline"
    return "normal"

def get_ingestion_strategy(filename: str) -> str:
    ext = pathlib.Path(filename).suffix.lower()
    if ext in IMAGE_TYPES: return "vision"
    if ext in TEXT_TYPES: return "text"
    if ext in DOC_TYPES: return "docling"
    return "docling"

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
    with tempfile.TemporaryDirectory() as tmpdir:
        local_path = pathlib.Path(tmpdir) / minio_key.split('/')[-1]
        await download_from_minio(minio_key, local_path)

        strategy = get_ingestion_strategy(local_path.name)

        if strategy == 'vision':
            # Transcribe image to text, then treat as plain text
            raw_text = await transcribe_image(local_path)
            raw_chunks = _chunk_plain_text(raw_text, local_path.name)
            full_doc_text = raw_text[:8000]

        elif strategy == 'text':
            raw_text = local_path.read_text(errors='replace')
            raw_chunks = _chunk_plain_text(raw_text, local_path.name)
            full_doc_text = raw_text[:8000]

        else:  # docling
            converter = DocumentConverter()
            result = converter.convert(local_path)
            doc = result.document
            raw_chunks = _chunk_document(doc)
            full_doc_text = doc.export_to_markdown()[:8000]

            # detect scanned pdf - if it yields suspiciously low text fallback -> vision
            word_count = len(full_doc_text.split())
            is_scanned = (
                local_path.suffix.lower() == ".pdf"
                and word_count < 50
            )

            if is_scanned:
                raw_chunks = await _ocr_pdf(local_path)
                full_doc_text = " ".join(c["text"] for c in raw_chunks)[:8000]
            else:
                raw_chunks = _chunk_document(doc)

    # Context prefix + embed + store (unchanged from here)
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
            await asyncio.sleep(0.5)

    concepts = await extract_concepts(full_doc_text)
    texts_to_embed = [c['text'] for c in enriched]
    embeddings = await embed_texts(texts_to_embed)

    async with pool.acquire() as conn:
        async with conn.transaction():
            for i, (chunk, emb) in enumerate(zip(enriched, embeddings)):
                await conn.execute(
                    """INSERT INTO chunks
                       (id, material_id, chunk_index, heading_path,
                        raw_text, context_text, full_text, embedding, chunk_type)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::vector, $9)""",
                    uuid.uuid4(), material_id, i,
                    chunk["heading_path"], chunk["text"],
                    chunk["context_text"], chunk["full_text"],
                    str(emb), chunk.get("chunk_type", "normal"),
                )
            await conn.execute(
                "UPDATE materials SET status='ready', concepts=$1 WHERE id=$2",
                concepts, material_id
            )
    
    print(f"=== _run_ingestion complete for {material_id}, checking parent ===", flush=True)
    await _check_parent_complete(material_id, pool)

def _chunk_document(doc) -> list[dict]:
    """
    walk docling's doc tree and produce structure-aware chunks
    each chunk keeps its heading_path (breadcrumb) for context
    """
    chunks = []
    current_heading_path = []
    current_section_text = []
    current_section_type = "normal"

    def flush(heading_path, text_parts, section_type):
        if not text_parts:
            return
        full = " ".join(text_parts).strip()
        if len(full) < 80:
            return
        # split if too long
        for chunk in _split_if_long(full, heading_path[:]):
            chunk["chunk_type"] = section_type
            chunks.append(chunk)

    for element, _level in doc.iterate_items():
        label = getattr(element, "label", None)
        text = getattr(element, "text", "") or ""
        text = text.strip()
        if not text:
            continue

        label_str = str(label).lower().replace("docitemlabel.", "").replace(" ", "_") \
                    if label else ""
        
        # always skip structural noise regardless of heading
        if label_str in SKIP_LABELS:
            continue

        if label == DocItemLabel.SECTION_HEADER:
            # flush current section before starting new one
            flush(current_heading_path[:], current_section_text[:], current_section_type)
            current_section_text = []

            level = getattr(element, "level", 1) or 1
            current_heading_path = current_heading_path[:level-1] + [text]

            # classify the new section
            current_section_type = classify_section(current_heading_path, label_str)

        else:
            if current_section_type == "skip":
                continue
            current_section_text.append(text)

    flush(current_heading_path, current_section_text, current_section_type)
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

def _chunk_plain_text(text: str, filename: str) -> list[dict]:
    """chunk plain text by paragraphs; used for .txt .md and ocr output"""
    heading = pathlib.Path(filename).stem
    paragraphs = [p.strip() for p in text.split('\n\n') if p.string()]

    chunks = []
    current, current_len = [], 0
    for para in paragraphs:
        para_len = len(para.split())
        if current_len + para_len > MAX_CHUNK_TOKENS and current:
            chunks.append({
                "text": "\n\n".join(current),
                "heading_path": [heading]
            })
            current = current[-1:] + [para]
            current_len = len(" ".join(current).split())
        else:
            current.append(para)
            current_len += para_len

    if current:
        chunks.append({"text": "\n\n".join(current), "heading_path": [heading]})

    return chunks if chunks else [{"text": text[:2000], "heading_path": [heading]}]

async def _ocr_pdf(pdf_path: pathlib.Path) -> list[dict]:
    """
    ocr a scanned pdf by converting each page to an image and running vision
    requires pymupdf (fitz)
    """
    doc = fitz.open(str(pdf_path))
    all_chunks = []

    for page_num in range(len(doc)):
        page = doc[page_num]
        mat = fitz.Matrix(2.0, 2.0)
        pix = page.get_pixmap(matrix=mat)

        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            pix.save(f.name)
            page_image = pathlib.Path(f.name)

        try:
            text = await transcribe_image(page_image)
            if text.strip():
                chunks = _chunk_plain_text(text, f"Page {page_num + 1}")
                all_chunks.extend(chunks)
        finally:
            page_image.unlink(missing_ok=True)

        if page_num < len(doc) - 1:
            await asyncio.sleep(1)

    doc.close()
    return all_chunks if all_chunks else [{"text": "Could not extract text from this PDF.", "heading_path": ["Document"]}]

async def maybe_split_and_ingest(material_id: uuid.UUID, minio_key: str, pool):
    async with pool.acquire() as conn:
        if not minio_key:
            row = await conn.fetchrow(
                "SELECT minio_key, parent_material_id FROM materials WHERE id=$1",
                material_id
            )
            if not row:
                raise ValueError(f"Material {material_id} not found")
            minio_key = row['minio_key']
            is_sub_doc = row['parent_material_id'] is not None
        else:
            is_sub_doc = False

        await conn.execute(
            "UPDATE materials SET status='ingesting' WHERE id=$1", material_id
        )

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            local_path = pathlib.Path(tmpdir) / minio_key.split('/')[-1]
            await download_from_minio(minio_key, local_path)

            strategy = get_ingestion_strategy(local_path.name)
            print(f"=== INGESTION STRATEGY: {strategy} for {local_path.name} ===")

            if strategy != 'docling' or is_sub_doc:
                await _run_ingestion(material_id, minio_key, pool)
                if is_sub_doc:
                    await _check_parent_complete(material_id, pool)
                return

            try:
                doc = fitz.open(str(local_path))
                page_count = len(doc)
                doc.close()
                print(f"=== PAGE COUNT: {page_count} ===")
            except Exception as e:
                print(f"=== FITZ ERROR: {e} ===")
                page_count = 0

            if page_count <= SUB_DOC_PAGE_LIMIT or page_count == 0:
                print(f"=== INGESTING NORMALLY ({page_count} pages) ===")
                await _run_ingestion(material_id, minio_key, pool)
                return

            print(f"=== SPLITTING INTO {math.ceil(page_count / SUB_DOC_PAGE_LIMIT)} PARTS ===")
            await _split_and_ingest(material_id, minio_key, local_path, page_count, pool)

    except Exception as e:
        print(f"=== INGESTION ERROR: {e} ===")
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE materials SET status='error' WHERE id=$1", material_id
            )
        # Still check parent even if this sub-doc failed
        if is_sub_doc:
            await _check_parent_complete(material_id, pool)
        raise

async def _split_and_ingest(
        parent_id: uuid.UUID,
        minio_key: str,
        local_path: pathlib.Path,
        page_count: int,
        pool,
):
    n_splits = math.ceil(page_count / SUB_DOC_PAGE_LIMIT)

    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE materials SET status='splitting', sub_doc_count=$1 WHERE id=$2",
            n_splits, parent_id
        )

    async with pool.acquire() as conn:
        parent = await conn.fetchrow(
            "SELECT user_id, title, file_type FROM materials WHERE id=$1", parent_id
        )

    doc = fitz.open(str(local_path))
    sub_ids = []

    for i in range(n_splits):
        start_page = i * SUB_DOC_PAGE_LIMIT
        end_page = min((i + 1) * SUB_DOC_PAGE_LIMIT, page_count)

        sub_doc = fitz.open()
        sub_doc.insert_pdf(doc, from_page=start_page, to_page=end_page - 1)

        sub_filename = f"part_{i+1}_of_{n_splits}_{local_path.name}"
        sub_key = f"{parent['user_id']}/{parent_id}/splits/{sub_filename}"

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            sub_doc.save(f.name)
            sub_path = pathlib.Path(f.name)

        try:
            # upload sub-doc to minio
            with open(sub_path, 'rb') as f:
                import boto3
                from app.services.storage import s3
                from app.config import settings
                s3.put_object(
                    Bucket=settings.minio_bucket,
                    Key=sub_key,
                    Body=f.read(),
                    ContentType="application/pdf",
                )
        finally:
            sub_path.unlink(missing_ok=True)

        sub_doc.close()

        sub_id = uuid.uuid4()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO materials (
                id, user_id, title, filename, file_type, minio_key,
                status, parent_material_id, sub_doc_index, page_range)
                VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9)
                """,
                sub_id, parent['user_id'], f"{parent['title']} (Part {i+1}/{n_splits})",
                sub_filename, parent['file_type'], sub_key,
                parent_id, i, [start_page + 1, end_page],
            )
        sub_ids.append(sub_id)

    doc.close()

    # update parent to partial
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE materials SET status='partial' WHERE id=$1", parent_id
        )

    from app.queue import get_queue
    queue = await get_queue()
    for sub_id in sub_ids:
        await queue.enqueue_job('run_ingest', str(sub_id), '')

async def ingest_material(material_id: uuid.UUID, minio_key: str, pool):
    """arq task entry point"""
    async with pool.acquire() as conn:
        # if minio_key is not passed (sub-doc), load from db
        if not minio_key:
            row = await conn.fetchrow(
                "SELECT minio_key, parent_material_id FROM materials WHERE id=$1",
                material_id
            )
            if not row:
                raise ValueError(f"Material {material_id} not found")
            minio_key = row["minio_key"]

        await conn.execute(
            "UPDATE materials SET status='ingesting' WHERE id=$1", material_id
        )

    try:
        await _run_ingestion(material_id, minio_key, pool)
        # await _check_parent_complete(material_id, minio_key, pool)
        return
    except Exception:
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE materials SET status='error' WHERE id=$1", material_id
            )
        raise

async def _check_parent_complete(material_id: uuid.UUID, pool):
    try:
        print(f"=== CHECK PARENT CALLED for {material_id} ===", flush=True)
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT parent_material_id FROM materials WHERE id=$1",
                material_id
            )
            print(f"=== PARENT ROW: {row} ===", flush=True)
            if not row or not row['parent_material_id']:
                print("=== NO PARENT, SKIPPING ===", flush=True)
                return

            parent_id = row['parent_material_id']

            counts = await conn.fetchrow(
                """SELECT
                    COUNT(*)                                           AS total,
                    COUNT(*) FILTER (WHERE status = 'ready')          AS ready,
                    COUNT(*) FILTER (WHERE status = 'error')          AS errors,
                    COUNT(*) FILTER (WHERE status IN
                        ('pending','ingesting','splitting'))           AS in_progress
                   FROM materials WHERE parent_material_id=$1""",
                str(parent_id)   # explicit str() cast
            )

            total       = counts['total']
            ready       = counts['ready']
            errors      = counts['errors']
            in_progress = counts['in_progress']

            print(f"=== PARENT {parent_id}: {ready} ready, {errors} errors, "
                  f"{in_progress} in_progress of {total} ===", flush=True)

            if in_progress == 0:
                new_status = 'ready' if ready > 0 else 'error'
                await conn.execute(
                    "UPDATE materials SET status=$1 WHERE id=$2",
                    new_status, str(parent_id)
                )
                print(f"=== PARENT STATUS → {new_status} ===", flush=True)

    except Exception as e:
        print(f"=== CHECK PARENT ERROR: {e} ===", flush=True)
        import traceback
        traceback.print_exc()