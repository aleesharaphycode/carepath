from fastapi import APIRouter

router = APIRouter(tags=["Health"])


@router.get("/health")
def health_check():
    """
    Public health check endpoint. Does not require authentication.
    """
    return {
        "status": "healthy",
        "service": "carepath-ai-engine",
        "version": "1.0.0",
        "pipeline": "Sprint 3: AI Document Intelligence Active",
    }
