from fastapi import APIRouter, Header, HTTPException
from models.tab import TabCreate
from services.supabase import get_supabase

router = APIRouter(prefix="/tabs", tags=["tabs"])


def _current_user(x_user_id: str = Header(...)) -> str:
    return x_user_id


@router.get("")
def list_tabs(x_user_id: str = Header(...)) -> list[dict]:
    """Return all open tabs the current user is a member of, with member count."""
    sb = get_supabase()

    # Get tab IDs for this user
    memberships = (
        sb.table("tab_members")
        .select("tab_id")
        .eq("user_id", x_user_id)
        .execute()
    )
    tab_ids = [row["tab_id"] for row in memberships.data]

    if not tab_ids:
        return []

    # Fetch open tabs
    tabs_res = (
        sb.table("tabs")
        .select("id, name, description, status")
        .in_("id", tab_ids)
        .eq("status", "open")
        .execute()
    )

    # Count members per tab
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


@router.get("/{tab_id}")
def get_tab(tab_id: str, x_user_id: str = Header(...)) -> dict:
    """Return tab details and member list. Only accessible to tab members."""
    sb = get_supabase()

    # Verify membership
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
        .single()
        .execute()
    )
    if not tab_res.data:
        raise HTTPException(status_code=404, detail="Tab not found.")

    members_res = (
        sb.table("tab_members")
        .select("user_id, users(display_name)")
        .eq("tab_id", tab_id)
        .execute()
    )
    members = [
        {"user_id": row["user_id"], "display_name": row["users"]["display_name"]}
        for row in members_res.data
    ]

    return {**tab_res.data, "members": members}
