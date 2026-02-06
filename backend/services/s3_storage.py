"""S3 Object Storage Service for Hetzner.

Handles all file uploads and downloads to/from S3-compatible storage.
"""
import os
import boto3
from botocore.exceptions import ClientError
from botocore.config import Config
import logging
import mimetypes

logger = logging.getLogger(__name__)

# S3 Configuration from environment
S3_ENDPOINT = os.environ.get('S3_ENDPOINT', 'https://nbg1.your-objectstorage.com')
S3_BUCKET = os.environ.get('S3_BUCKET', 'koodh-clara')
S3_REGION = os.environ.get('S3_REGION', 'eu-central')
S3_ACCESS_KEY = os.environ.get('S3_ACCESS_KEY', '')
S3_SECRET_KEY = os.environ.get('S3_SECRET_KEY', '')

# Initialize S3 client
def get_s3_client():
    """Get configured S3 client for Hetzner Object Storage."""
    return boto3.client(
        's3',
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=S3_ACCESS_KEY,
        aws_secret_access_key=S3_SECRET_KEY,
        region_name=S3_REGION,
        config=Config(
            signature_version='s3v4',
            s3={'addressing_style': 'path'}
        )
    )

def is_s3_configured():
    """Check if S3 is properly configured."""
    return bool(S3_ACCESS_KEY and S3_SECRET_KEY and S3_ENDPOINT and S3_BUCKET)

async def upload_file_to_s3(file_content: bytes, file_key: str, content_type: str = None) -> dict:
    """
    Upload a file to S3 storage.
    
    Args:
        file_content: The file bytes to upload
        file_key: The key/path where the file will be stored (e.g., 'media/uuid.jpg')
        content_type: Optional MIME type of the file
        
    Returns:
        dict with 'url' and 'key' on success, or raises exception
    """
    if not is_s3_configured():
        raise Exception("S3 storage is not configured")
    
    try:
        s3_client = get_s3_client()
        
        # Guess content type if not provided
        if not content_type:
            content_type = mimetypes.guess_type(file_key)[0] or 'application/octet-stream'
        
        # Upload to S3
        s3_client.put_object(
            Bucket=S3_BUCKET,
            Key=file_key,
            Body=file_content,
            ContentType=content_type,
            ACL='public-read'  # Make files publicly readable
        )
        
        # Generate public URL
        public_url = f"{S3_ENDPOINT}/{S3_BUCKET}/{file_key}"
        
        logger.info(f"Uploaded file to S3: {file_key}")
        return {
            'url': public_url,
            'key': file_key,
            'bucket': S3_BUCKET
        }
        
    except ClientError as e:
        logger.error(f"S3 upload error: {e}")
        raise Exception(f"Failed to upload to S3: {str(e)}")

async def delete_file_from_s3(file_key: str) -> bool:
    """
    Delete a file from S3 storage.
    
    Args:
        file_key: The key/path of the file to delete
        
    Returns:
        True on success
    """
    if not is_s3_configured():
        raise Exception("S3 storage is not configured")
    
    try:
        s3_client = get_s3_client()
        s3_client.delete_object(Bucket=S3_BUCKET, Key=file_key)
        logger.info(f"Deleted file from S3: {file_key}")
        return True
    except ClientError as e:
        logger.error(f"S3 delete error: {e}")
        raise Exception(f"Failed to delete from S3: {str(e)}")

async def get_file_from_s3(file_key: str) -> bytes:
    """
    Get a file from S3 storage.
    
    Args:
        file_key: The key/path of the file
        
    Returns:
        File content as bytes
    """
    if not is_s3_configured():
        raise Exception("S3 storage is not configured")
    
    try:
        s3_client = get_s3_client()
        response = s3_client.get_object(Bucket=S3_BUCKET, Key=file_key)
        return response['Body'].read()
    except ClientError as e:
        logger.error(f"S3 get error: {e}")
        raise Exception(f"Failed to get from S3: {str(e)}")

def get_s3_url(file_key: str) -> str:
    """Get the public URL for an S3 file."""
    return f"{S3_ENDPOINT}/{S3_BUCKET}/{file_key}"

async def generate_presigned_url(file_key: str, expiration: int = 3600) -> str:
    """
    Generate a presigned URL for temporary access.
    
    Args:
        file_key: The key/path of the file
        expiration: URL expiration time in seconds (default 1 hour)
        
    Returns:
        Presigned URL string
    """
    if not is_s3_configured():
        raise Exception("S3 storage is not configured")
    
    try:
        s3_client = get_s3_client()
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': S3_BUCKET, 'Key': file_key},
            ExpiresIn=expiration
        )
        return url
    except ClientError as e:
        logger.error(f"S3 presigned URL error: {e}")
        raise Exception(f"Failed to generate presigned URL: {str(e)}")

async def check_s3_connection() -> dict:
    """Test S3 connection and return status."""
    if not is_s3_configured():
        return {'connected': False, 'error': 'S3 credentials not configured'}
    
    try:
        s3_client = get_s3_client()
        # Try to list objects (limit 1) to test connection
        s3_client.list_objects_v2(Bucket=S3_BUCKET, MaxKeys=1)
        return {'connected': True, 'bucket': S3_BUCKET, 'endpoint': S3_ENDPOINT}
    except ClientError as e:
        return {'connected': False, 'error': str(e)}
