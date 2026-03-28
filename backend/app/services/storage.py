# backend/app/services/storage.py

import boto3
from botocore.config import Config
from fastapi import UploadFile
import pathlib

from app.config import settings

s3 = boto3.client(
    "s3",
    endpoint_url=f"http://{settings.minio_endpoint}",
    aws_access_key_id=settings.minio_access_key,
    aws_secret_access_key=settings.minio_secret_key,
    config=Config(signature_version="s3v4"),
    region_name="ap-south-1"
)

def ensure_bucket():
    try:
        s3.head_bucket(Bucket=settings.minio_bucket)
    except Exception:
        s3.create_bucket(Bucket=settings.minio_bucket)

async def upload_to_minio(key: str, file: UploadFile) -> None:
    contents = await file.read()
    s3.put_object(
        Bucket=settings.minio_bucket,
        Key=key,
        Body=contents,
        ContentType=file.content_type or "application/octet-stream",
    )
    await file.seek(0)

async def download_from_minio(key: str, dest: pathlib.Path) -> None:
    response = s3.get_object(Bucket=settings.minio_bucket, Key=key)
    dest.write_bytes(response["Body"].read())

def get_presigned_url(key: str, expires_in: int = 3600) -> str:
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.minio_bucket, "Key": key},
        ExpiresIn=expires_in,
    )