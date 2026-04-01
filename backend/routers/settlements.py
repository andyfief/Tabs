from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from services.supabase import get_supabase
from services.auth import get_current_user

router = APIRouter(prefix="/tabs", tags=["settlements"])


class SettlementCreate(BaseModel):
    counterpart_id: str
    amount: float
    # True  = current user owed the counterpart (user paid out).
    # False = counterpart owed the current user (user requested / received).
    i_owe: bool


def _require_member(sb, tab_id: str, user_id: str) -> None:
    res = (
        sb.table("tab_members")
        .select("user_id")
        .eq("tab_id", tab_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=403, detail="Not a member of this tab.")


def _verify_settlement_member(sb, tab_id: str, settlement_id: str, user_id: str) -> None:
    """Allow both the initiator and the counterpart to restore/resettle a settlement."""
    res = (
        sb.table("balance_settlements")
        .select("initiator_id, counterpart_id")
        .eq("id", settlement_id)
        .eq("tab_id", tab_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Settlement not found.")
    row = res.data[0]
    if user_id not in (row["initiator_id"], row["counterpart_id"]):
        raise HTTPException(status_code=403, detail="Not your settlement.")


@router.get("/{tab_id}/balance-settlements")
def list_settlements(tab_id: str, current_user: str = Depends(get_current_user)) -> list[dict]:
    """Return all balance settlements involving the current user for this tab."""
    sb = get_supabase()
    _require_member(sb, tab_id, current_user)

    res = (
        sb.table("balance_settlements")
        .select("id, initiator_id, counterpart_id, amount, i_owe, settled_at, restored_at")
        .eq("tab_id", tab_id)
        .or_(f"initiator_id.eq.{current_user},counterpart_id.eq.{current_user}")
        .execute()
    )

    if not res.data:
        return []

    all_user_ids = list({row["initiator_id"] for row in res.data} | {row["counterpart_id"] for row in res.data})
    users_res = (
        sb.table("users")
        .select("id, display_name")
        .in_("id", all_user_ids)
        .execute()
    )
    name_map = {u["id"]: u["display_name"] for u in users_res.data}

    return [
        {
            **row,
            "initiator_name": name_map.get(row["initiator_id"], "Unknown"),
            "counterpart_name": name_map.get(row["counterpart_id"], "Unknown"),
        }
        for row in res.data
    ]


@router.post("/{tab_id}/balance-settlements", status_code=201)
def create_settlement(
    tab_id: str,
    body: SettlementCreate,
    current_user: str = Depends(get_current_user),
) -> dict:
    """Record that the current user has settled a balance with a counterpart."""
    sb = get_supabase()
    _require_member(sb, tab_id, current_user)

    res = (
        sb.table("balance_settlements")
        .insert({
            "tab_id": tab_id,
            "initiator_id": current_user,
            "counterpart_id": body.counterpart_id,
            "amount": body.amount,
            "i_owe": body.i_owe,
        })
        .execute()
    )
    row = res.data[0]

    # Attach counterpart name so the client can display it immediately.
    user_res = (
        sb.table("users")
        .select("display_name")
        .eq("id", body.counterpart_id)
        .execute()
    )
    counterpart_name = user_res.data[0]["display_name"] if user_res.data else "Unknown"

    initiator_res = (
        sb.table("users")
        .select("display_name")
        .eq("id", current_user)
        .execute()
    )
    initiator_name = initiator_res.data[0]["display_name"] if initiator_res.data else "Unknown"

    return {**row, "initiator_name": initiator_name, "counterpart_name": counterpart_name}


@router.patch("/{tab_id}/balance-settlements/{settlement_id}/restore")
def restore_settlement(
    tab_id: str,
    settlement_id: str,
    current_user: str = Depends(get_current_user),
) -> dict:
    """Mark a settlement as restored — moves it from the settled section back to active."""
    sb = get_supabase()
    _verify_settlement_member(sb, tab_id, settlement_id, current_user)

    sb.table("balance_settlements").update(
        {"restored_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", settlement_id).execute()

    return {"restored": True}


@router.patch("/{tab_id}/balance-settlements/{settlement_id}/resettle")
def resettle_settlement(
    tab_id: str,
    settlement_id: str,
    current_user: str = Depends(get_current_user),
) -> dict:
    """Re-settle a previously restored settlement — clears restored_at, moving it back to settled."""
    sb = get_supabase()
    _verify_settlement_member(sb, tab_id, settlement_id, current_user)

    sb.table("balance_settlements").update(
        {"restored_at": None}
    ).eq("id", settlement_id).execute()

    return {"resettled": True}
