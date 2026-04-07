import asyncio
import os
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from models.tab import TabCreate
from services.supabase import get_supabase
from services.auth import get_current_user

router = APIRouter(prefix="/tabs", tags=["tabs"])

# How long a cleared tab survives before auto-deletion.
# Set CLEARED_TAB_TTL_SECONDS in env to override (e.g. 604800 for 7 days).
CLEARED_TAB_TTL_SECONDS = int(os.getenv("CLEARED_TAB_TTL_SECONDS", "300"))  # 5 min for testing


def _delete_expired_cleared_tabs() -> None:
    """Delete tabs where every member has cleared_at set and all cleared_at values are older than TTL."""
    sb = get_supabase()
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=CLEARED_TAB_TTL_SECONDS)

    res = sb.table("tab_members").select("tab_id, cleared_at").execute()

    tab_clearances: dict[str, list[datetime | None]] = defaultdict(list)
    for row in res.data:
        raw = row["cleared_at"]
        if raw is None:
            tab_clearances[row["tab_id"]].append(None)
        else:
            # Parse ISO timestamp, normalise to UTC-aware datetime.
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            tab_clearances[row["tab_id"]].append(dt)

    for tab_id, clearances in tab_clearances.items():
        # All members must have cleared the tab.
        if any(c is None for c in clearances):
            continue
        # Every cleared_at must be older than the cutoff.
        if all(c < cutoff for c in clearances):  # type: ignore[operator]
            sb.table("tabs").delete().eq("id", tab_id).execute()


async def run_cleanup_loop() -> None:
    """Background task: check for expired cleared tabs every 60 seconds."""
    while True:
        await asyncio.sleep(60)
        try:
            _delete_expired_cleared_tabs()
        except Exception:
            pass  # Never let a cleanup error crash the loop


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


@router.get("/all")
def list_all_tabs(current_user: str = Depends(get_current_user)) -> list[dict]:
    """Return all open tabs the current user is a member of, with is_cleared per-user."""
    sb = get_supabase()

    memberships = (
        sb.table("tab_members")
        .select("tab_id, cleared_at")
        .eq("user_id", current_user)
        .execute()
    )
    if not memberships.data:
        return []

    cleared_map = {row["tab_id"]: row["cleared_at"] is not None for row in memberships.data}
    tab_ids = list(cleared_map.keys())

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
        result.append({
            **tab,
            "member_count": count_res.count,
            "is_cleared": cleared_map.get(tab["id"], False),
        })
    return result


@router.post("", status_code=201)
def create_tab(body: TabCreate, current_user: str = Depends(get_current_user)) -> dict:
    """Create a new tab and add the creator as the first member."""
    sb = get_supabase()

    tab_res = (
        sb.table("tabs")
        .insert({"name": body.name, "description": body.description, "created_by": current_user})
        .execute()
    )
    tab = tab_res.data[0]

    sb.table("tab_members").insert({"tab_id": tab["id"], "user_id": current_user}).execute()

    return {"id": tab["id"]}


@router.patch("/{tab_id}/clear")
def toggle_clear_tab(tab_id: str, current_user: str = Depends(get_current_user)) -> dict:
    """Toggle cleared_at for the current user on a tab. Personal — does not affect other members."""
    sb = get_supabase()

    member_res = (
        sb.table("tab_members")
        .select("cleared_at")
        .eq("tab_id", tab_id)
        .eq("user_id", current_user)
        .execute()
    )
    if not member_res.data:
        raise HTTPException(status_code=403, detail="Not a member of this tab.")

    currently_cleared = member_res.data[0]["cleared_at"] is not None
    new_value = None if currently_cleared else datetime.now(timezone.utc).isoformat()

    sb.table("tab_members").update({"cleared_at": new_value}) \
        .eq("tab_id", tab_id).eq("user_id", current_user).execute()

    return {"cleared": not currently_cleared}


@router.get("/{tab_id}")
def get_tab(tab_id: str, current_user: str = Depends(get_current_user)) -> dict:
    """Return tab details, member list (with payment handles), and whether the
    current user has unlocked balance payment links for this tab."""
    sb = get_supabase()

    membership = (
        sb.table("tab_members")
        .select("user_id, links_unlocked_at")
        .eq("tab_id", tab_id)
        .eq("user_id", current_user)
        .execute()
    )
    if not membership.data:
        raise HTTPException(status_code=403, detail="Not a member of this tab.")

    links_unlocked = membership.data[0]["links_unlocked_at"] is not None

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
        .select("id, display_name, venmo_handle, cashapp_handle")
        .in_("id", member_ids)
        .execute()
    )
    members = [
        {
            "user_id": u["id"],
            "display_name": u["display_name"],
            "venmo_handle": u.get("venmo_handle"),
            "cashapp_handle": u.get("cashapp_handle"),
        }
        for u in users_res.data
    ]

    return {**tab, "members": members, "links_unlocked": links_unlocked}


@router.post("/{tab_id}/unlock-balance-links")
def unlock_balance_links(tab_id: str, current_user: str = Depends(get_current_user)) -> dict:
    """Set links_unlocked_at for the current user on this tab. One-time, irreversible."""
    sb = get_supabase()

    membership = (
        sb.table("tab_members")
        .select("user_id, links_unlocked_at")
        .eq("tab_id", tab_id)
        .eq("user_id", current_user)
        .execute()
    )
    if not membership.data:
        raise HTTPException(status_code=403, detail="Not a member of this tab.")

    if membership.data[0]["links_unlocked_at"] is None:
        sb.table("tab_members").update(
            {"links_unlocked_at": datetime.now(timezone.utc).isoformat()}
        ).eq("tab_id", tab_id).eq("user_id", current_user).execute()

    return {"unlocked": True}


@router.delete("/{tab_id}/members/me")
def leave_tab(tab_id: str, current_user: str = Depends(get_current_user)) -> dict:
    """Remove the current user from a tab. Deletes the tab entirely if they were the last member."""
    sb = get_supabase()

    membership = (
        sb.table("tab_members")
        .select("user_id")
        .eq("tab_id", tab_id)
        .eq("user_id", current_user)
        .execute()
    )
    if not membership.data:
        raise HTTPException(status_code=403, detail="Not a member of this tab.")

    sb.table("tab_members").delete().eq("tab_id", tab_id).eq("user_id", current_user).execute()

    remaining = (
        sb.table("tab_members")
        .select("user_id", count="exact")
        .eq("tab_id", tab_id)
        .execute()
    )
    if remaining.count == 0:
        # Cascade deletes clean up expenses, splits, settlements, invites.
        sb.table("tabs").delete().eq("id", tab_id).execute()

    return {"left": True}
