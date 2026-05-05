from typing import Optional

from fastapi import Header, HTTPException, status

from .config import HALO_API_KEY


def require_api_key(x_api_key: Optional[str] = Header(None, alias="X-API-Key")) -> None:
    if not HALO_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="HALO_API_KEY is not configured on the server.",
        )

    if x_api_key != HALO_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key.",
        )
