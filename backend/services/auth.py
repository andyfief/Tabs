import os
import jwt
from jwt import PyJWKClient
from fastapi import Header, HTTPException

_jwks_client: PyJWKClient | None = None

def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        url = os.environ["SUPABASE_URL"]
        _jwks_client = PyJWKClient(f"{url}/auth/v1/.well-known/jwks.json")
    return _jwks_client


async def get_current_user(authorization: str = Header(...)) -> str:
    """
    FastAPI dependency. Verifies the Supabase JWT using the project's JWKS endpoint
    (supports P-256 and HS256) and returns the authenticated user's UUID.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header.")

    token = authorization.removeprefix("Bearer ").strip()
    try:
        client = _get_jwks_client()
        signing_key = client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "ES256", "HS256"],
            audience="authenticated",
        )
        return str(payload["sub"])
    except Exception as e:
        print(f"[auth] jwt decode failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
