import secrets
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from services.auth import get_current_user
from services.supabase import get_supabase

router = APIRouter(tags=["invites"])

# Unambiguous characters — easy to read and type
_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def _generate_code() -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(6))


class JoinRequest(BaseModel):
    code: str


@router.get("/tabs/{tab_id}/invite")
def get_or_create_invite(
    tab_id: str,
    current_user: str = Depends(get_current_user),
) -> dict:
    """
    Return the invite code for a tab, creating one if none exists yet.
    Only tab members can retrieve the code.
    """
    sb = get_supabase()

    # Verify membership
    membership = sb.table("tab_members").select("user_id") \
        .eq("tab_id", tab_id).eq("user_id", current_user).execute()
    if not membership.data:
        raise HTTPException(status_code=403, detail="Not a member of this tab.")

    # Get tab name for display
    tab_res = sb.table("tabs").select("name").eq("id", tab_id).execute()
    if not tab_res.data:
        raise HTTPException(status_code=404, detail="Tab not found.")
    tab_name = tab_res.data[0]["name"]

    # Return existing code if present
    existing = sb.table("tab_invites").select("code").eq("tab_id", tab_id).execute()
    if existing.data:
        return {"code": existing.data[0]["code"], "tab_name": tab_name}

    # Generate a unique code (collision is astronomically unlikely but guard anyway)
    for _ in range(5):
        code = _generate_code()
        try:
            sb.table("tab_invites").insert({
                "tab_id": tab_id,
                "code": code,
                "created_by": current_user,
            }).execute()
            return {"code": code, "tab_name": tab_name}
        except Exception:
            continue

    raise HTTPException(status_code=500, detail="Could not generate invite code. Try again.")


@router.post("/invites/join", status_code=201)
def join_tab(
    body: JoinRequest,
    current_user: str = Depends(get_current_user),
) -> dict:
    """
    Join a tab via invite code. Idempotent — rejoining a tab you're already in
    returns success rather than an error.
    """
    sb = get_supabase()

    code = body.code.strip().upper()
    invite_res = sb.table("tab_invites").select("tab_id").eq("code", code).execute()
    if not invite_res.data:
        raise HTTPException(status_code=404, detail="Invite code not found.")

    tab_id = invite_res.data[0]["tab_id"]

    tab_res = sb.table("tabs").select("id, name, status").eq("id", tab_id).execute()
    if not tab_res.data:
        raise HTTPException(status_code=404, detail="Tab not found.")
    tab = tab_res.data[0]

    if tab["status"] == "closed":
        raise HTTPException(status_code=400, detail="This tab is already closed.")

    # Idempotent — only insert if not already a member
    existing = sb.table("tab_members").select("user_id") \
        .eq("tab_id", tab_id).eq("user_id", current_user).execute()
    if not existing.data:
        sb.table("tab_members").insert({"tab_id": tab_id, "user_id": current_user}).execute()

    return {"tab_id": tab_id, "tab_name": tab["name"]}
