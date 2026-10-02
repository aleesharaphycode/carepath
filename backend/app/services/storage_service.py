import logging
from fastapi import HTTPException, status
from supabase import Client

logger = logging.getLogger("carepath.storage")

STORAGE_BUCKET = "medical-documents"


class StorageService:
    def download_document(self, client: Client, storage_path: str) -> bytes:
        """
        Downloads a private medical document binary from Supabase Storage.
        Uses server-side admin client to access the private bucket.
        """
        try:
            logger.info(f"Downloading file from private storage: {STORAGE_BUCKET}/{storage_path}")
            response = client.storage.from_(STORAGE_BUCKET).download(storage_path)
            if not response:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Medical document file could not be retrieved from private storage.",
                )
            return response
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to download storage object {storage_path}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Storage retrieval failed: {str(e)}",
            )


storage_service = StorageService()
