from fastapi import APIRouter, Depends, HTTPException
from models.user import ProfileUpdate
from services.auth import get_current_user
from services.supabase import get_supabase

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me")
def get_profile(current_user: str = Depends(get_current_user)) -> dict:
    """Return the current user's profile. 404 if not yet set up."""
    sb = get_supabase()
    res = sb.table("users").select("id, display_name, phone, venmo_handle, cashapp_handle") \
        .eq("id", current_user).execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Profile not found.")
    return res.data[0]


@router.put("/me")
def upsert_profile(
    body: ProfileUpdate,
    current_user: str = Depends(get_current_user),
) -> dict:
    """Create or update the current user's profile. Safe to call multiple times."""
    sb = get_supabase()

    # Get phone from Supabase Auth — the authoritative source
    user_res = sb.auth.admin.get_user_by_id(current_user)
    phone = user_res.user.phone or ""

    sb.table("users").upsert({
        "id": current_user,
        "display_name": body.display_name.strip(),
        "phone": phone,
        "venmo_handle": body.venmo_handle.strip().lstrip("@") if body.venmo_handle else None,
        "cashapp_handle": body.cashapp_handle.strip().lstrip("$") if body.cashapp_handle else None,
    }).execute()

    return {"ok": True}
