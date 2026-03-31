from datetime import datetime, timezone
from fastapi import APIRouter, Header, HTTPException
from models.tab import TabCreate
from services.supabase import get_supabase

router = APIRouter(prefix="/tabs", tags=["tabs"])


def _fetch_tabs_for_ids(sb, tab_ids: list[str]) -> list[dict]:
    """Fetch open tabs by ID list and attach member counts."""
    if not tab_ids:
        return []

    tabs_res = (
        sb.table("tabs")
        .select("id, name, description, status, created_at")
        .in_("id", tab_ids)
        .eq("status", "open")
        .execute()
    )

    result = []
    for tab in tabs_res.data:
        count_res = (
            sb.table("tab_members")
            .select("user_id", count="exact")
            .eq("tab_id", tab["id"])
            .execute()
        )
        result.append({**tab, "member_count": count_res.count})
    return result


@router.get("/cleared")
def list_cleared_tabs(x_user_id: str = Header(...)) -> list[dict]:
    """Return open tabs the current user has cleared from their homescreen."""
    sb = get_supabase()

    memberships = (
        sb.table("tab_members")
        .select("tab_id")
        .eq("user_id", x_user_id)
        .not_.is_("cleared_at", "null")
        .execute()
    )
    tab_ids = [row["tab_id"] for row in memberships.data]
    return _fetch_tabs_for_ids(sb, tab_ids)


@router.get("")
def list_tabs(x_user_id: str = Header(...)) -> list[dict]:
    """Return open tabs the current user is a member of and has not cleared."""
    sb = get_supabase()

    memberships = (
        sb.table("tab_members")
        .select("tab_id")
        .eq("user_id", x_user_id)
        .is_("cleared_at", "null")
        .execute()
    )
    tab_ids = [row["tab_id"] for row in memberships.data]
    return _fetch_tabs_for_ids(sb, tab_ids)


@router.post("", status_code=201)
def create_tab(body: TabCreate, x_user_id: str = Header(...)) -> dict:
    """Create a new tab and add the creator as the first member."""
    sb = get_supabase()

    tab_res = (
        sb.table("tabs")
        .insert({"name": body.name, "description": body.description, "created_by": x_user_id})
        .execute()
    )
    tab = tab_res.data[0]

    sb.table("tab_members").insert({"tab_id": tab["id"], "user_id": x_user_id}).execute()

    return {"id": tab["id"]}


@router.patch("/{tab_id}/clear")
def toggle_clear_tab(tab_id: str, x_user_id: str = Header(...)) -> dict:
    """Toggle cleared_at for the current user on a tab. Personal — does not affect other members."""
    sb = get_supabase()

    member_res = (
        sb.table("tab_members")
        .select("cleared_at")
        .eq("tab_id", tab_id)
        .eq("user_id", x_user_id)
        .execute()
    )
    if not member_res.data:
        raise HTTPException(status_code=403, detail="Not a member of this tab.")

    currently_cleared = member_res.data[0]["cleared_at"] is not None
    new_value = None if currently_cleared else datetime.now(timezone.utc).isoformat()

    sb.table("tab_members").update({"cleared_at": new_value}) \
        .eq("tab_id", tab_id).eq("user_id", x_user_id).execute()

    return {"cleared": not currently_cleared}


@router.get("/{tab_id}")
def get_tab(tab_id: str, x_user_id: str = Header(...)) -> dict:
    """Return tab details and member list. Only accessible to tab members."""
    sb = get_supabase()

    membership = (
        sb.table("tab_members")
        .select("user_id")
        .eq("tab_id", tab_id)
        .eq("user_id", x_user_id)
        .execute()
    )
    if not membership.data:
        raise HTTPException(status_code=403, detail="Not a member of this tab.")

    tab_res = (
        sb.table("tabs")
        .select("id, name, description, status")
        .eq("id", tab_id)
        .execute()
    )
    if not tab_res.data:
        raise HTTPException(status_code=404, detail="Tab not found.")
    tab = tab_res.data[0]

    members_res = (
        sb.table("tab_members")
        .select("user_id")
        .eq("tab_id", tab_id)
        .execute()
    )
    member_ids = [row["user_id"] for row in members_res.data]

    users_res = (
        sb.table("users")
        .select("id, display_name")
        .in_("id", member_ids)
        .execute()
    )
    name_map = {row["id"]: row["display_name"] for row in users_res.data}
    members = [
        {"user_id": uid, "display_name": name_map.get(uid, "Unknown")}
        for uid in member_ids
    ]

    return {**tab, "members": members}
