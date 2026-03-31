from fastapi import Header, HTTPException
from services.supabase import get_supabase


async def get_current_user(authorization: str = Header(...)) -> str:
    """
    FastAPI dependency. Verifies the Supabase JWT from the Authorization header
    and returns the authenticated user's UUID.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header.")

    token = authorization.removeprefix("Bearer ").strip()
    try:
        sb = get_supabase()
        response = sb.auth.get_user(jwt=token)
        return str(response.user.id)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
