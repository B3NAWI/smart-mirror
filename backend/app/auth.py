from ipaddress import ip_address
from typing import Optional

from fastapi import Header, HTTPException, Request, status

from .config import HALO_API_KEY, HALO_DEV_API_KEY


def _is_local_client(host: Optional[str]) -> bool:
    if not host:
        return False

    try:
        parsed = ip_address(host)
    except ValueError:
        return host in {"localhost"}

    return parsed.is_loopback or parsed.is_private


def require_api_key(
    request: Request,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
) -> None:
    if not HALO_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="HALO_API_KEY is not configured on the server.",
        )

    if x_api_key == HALO_API_KEY:
        return

    client_host = request.client.host if request.client else None
    if HALO_DEV_API_KEY and x_api_key == HALO_DEV_API_KEY and _is_local_client(client_host):
        return

    if x_api_key != HALO_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key.",
        )
