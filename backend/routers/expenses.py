from datetime import datetime, timezone
from decimal import Decimal, ROUND_DOWN
from fastapi import APIRouter, Depends, HTTPException
from models.expense import ExpenseCreate
from services.supabase import get_supabase
from services.auth import get_current_user

router = APIRouter(prefix="/tabs/{tab_id}/expenses", tags=["expenses"])


def _assert_member(sb, tab_id: str, user_id: str) -> None:
    res = (
        sb.table("tab_members")
        .select("user_id")
        .eq("tab_id", tab_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=403, detail="Not a member of this tab.")


def _even_splits(amount: float, member_ids: list[str]) -> list[dict]:
    """Split amount evenly; any rounding remainder goes to the first member."""
    total = Decimal(str(amount))
    n = len(member_ids)
    share = (total / n).quantize(Decimal("0.01"), rounding=ROUND_DOWN)
    remainder = total - share * n

    splits = []
    for i, uid in enumerate(member_ids):
        member_share = share + remainder if i == 0 else share
        splits.append({"user_id": uid, "share_amount": float(member_share)})
    return splits


@router.post("", status_code=201)
def create_expense(
    tab_id: str,
    body: ExpenseCreate,
    current_user: str = Depends(get_current_user),
) -> dict:
    """Create an expense and its splits. Validates membership for caller and all split members."""
    sb = get_supabase()
    _assert_member(sb, tab_id, current_user)

    # Verify payer and all split members belong to the tab
    members_res = (
        sb.table("tab_members").select("user_id").eq("tab_id", tab_id).execute()
    )
    tab_member_ids = {row["user_id"] for row in members_res.data}

    if body.payer_id not in tab_member_ids:
        raise HTTPException(status_code=400, detail="Payer is not a member of this tab.")
    for uid in body.split_member_ids:
        if uid not in tab_member_ids:
            raise HTTPException(
                status_code=400, detail=f"Split member {uid} is not in this tab."
            )

    # Insert expense
    expense_res = (
        sb.table("expenses")
        .insert({
            "tab_id": tab_id,
            "payer_id": body.payer_id,
            "created_by": current_user,
            "title": body.title,
            "amount": body.amount,
        })
        .execute()
    )
    expense = expense_res.data[0]

    # Insert splits
    splits = _even_splits(body.amount, body.split_member_ids)
    for split in splits:
        split["expense_id"] = expense["id"]
    sb.table("expense_splits").insert(splits).execute()

    return {"id": expense["id"]}


@router.get("")
def list_expenses(tab_id: str, current_user: str = Depends(get_current_user)) -> list[dict]:
    """
    Return all expenses for a tab — active ones first (newest first),
    removed ones appended at the bottom (most recently removed first).
    """
    sb = get_supabase()
    _assert_member(sb, tab_id, current_user)

    res = (
        sb.table("expenses")
        .select("id, title, amount, created_at, removed_at, payer_id")
        .eq("tab_id", tab_id)
        .execute()
    )

    if not res.data:
        return []

    # Batch-fetch payer names
    payer_ids = list({row["payer_id"] for row in res.data})
    users_res = (
        sb.table("users").select("id, display_name").in_("id", payer_ids).execute()
    )
    name_map = {row["id"]: row["display_name"] for row in users_res.data}

    active = [r for r in res.data if r["removed_at"] is None]
    removed = [r for r in res.data if r["removed_at"] is not None]
    active.sort(key=lambda r: r["created_at"], reverse=True)
    removed.sort(key=lambda r: r["removed_at"], reverse=True)

    return [
        {
            "id": row["id"],
            "title": row["title"],
            "amount": row["amount"],
            "created_at": row["created_at"],
            "removed_at": row["removed_at"],
            "payer_id": row["payer_id"],
            "payer_name": name_map.get(row["payer_id"], "Unknown"),
        }
        for row in active + removed
    ]


@router.patch("/{expense_id}")
def toggle_remove_expense(
    tab_id: str,
    expense_id: str,
    current_user: str = Depends(get_current_user),
) -> dict:
    """Toggle soft-remove on an expense. Active → removed; removed → restored."""
    sb = get_supabase()
    _assert_member(sb, tab_id, current_user)

    res = (
        sb.table("expenses")
        .select("id, removed_at")
        .eq("id", expense_id)
        .eq("tab_id", tab_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Expense not found.")

    currently_removed = res.data[0]["removed_at"] is not None
    new_value = None if currently_removed else datetime.now(timezone.utc).isoformat()

    sb.table("expenses").update({"removed_at": new_value}).eq("id", expense_id).execute()
    return {"removed": not currently_removed}


@router.get("/balances")
def get_balances(tab_id: str, current_user: str = Depends(get_current_user)) -> list[dict]:
    """
    Return all pairwise net balances for the tab from the pairwise_balances view,
    with display names joined. The mobile filters to the current user's rows.

    Each item:
      user_a_id, user_a_name, user_b_id, user_b_name, net_balance
      net_balance > 0 → user_a owes user_b
      net_balance < 0 → user_b owes user_a
    """
    sb = get_supabase()
    _assert_member(sb, tab_id, current_user)

    balances_res = (
        sb.table("pairwise_balances")
        .select("user_a_id, user_b_id, net_balance")
        .eq("tab_id", tab_id)
        .execute()
    )

    if not balances_res.data:
        return []

    # Collect all user IDs we need names for
    user_ids = set()
    for row in balances_res.data:
        user_ids.add(row["user_a_id"])
        user_ids.add(row["user_b_id"])

    names_res = (
        sb.table("users")
        .select("id, display_name")
        .in_("id", list(user_ids))
        .execute()
    )
    name_map = {row["id"]: row["display_name"] for row in names_res.data}

    return [
        {
            "user_a_id": row["user_a_id"],
            "user_a_name": name_map.get(row["user_a_id"], "Unknown"),
            "user_b_id": row["user_b_id"],
            "user_b_name": name_map.get(row["user_b_id"], "Unknown"),
            "net_balance": float(row["net_balance"]),
        }
        for row in balances_res.data
    ]
