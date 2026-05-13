"""
Tests for the semi-left state feature.

When a user leaves a tab their tab_members row gets left_at set (not deleted).
They lose access to the tab (403), but remaining members still see all their
expenses, balances, and the user appears in expense forms with a left_at field.
"""
import copy
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from tests.conftest import make_mock_sb, make_client


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _member_row(tables: dict, tab_id: str, user_id: str) -> dict | None:
    for row in tables["tab_members"]:
        if row["tab_id"] == tab_id and row["user_id"] == user_id:
            return row
    return None


def _tab_exists(tables: dict, tab_id: str) -> bool:
    return any(t["id"] == tab_id for t in tables["tabs"])


# ---------------------------------------------------------------------------
# Test 1 — Leave sets left_at; does NOT delete the row; tab survives
# ---------------------------------------------------------------------------

def test_leave_sets_left_at_does_not_delete_row(tables):
    with make_client(tables, "user-a") as client:
        resp = client.delete("/tabs/tab-1/members/me")

    assert resp.status_code == 200
    assert resp.json() == {"left": True}

    row = _member_row(tables, "tab-1", "user-a")
    assert row is not None, "membership row must still exist"
    assert row["left_at"] is not None, "left_at must be set after leaving"

    # Tab must still exist because user-b is still active
    assert _tab_exists(tables, "tab-1")


# ---------------------------------------------------------------------------
# Test 2 — Semi-left user gets 403 on GET /tabs/{tab_id}
# ---------------------------------------------------------------------------

def test_semi_left_user_gets_403_on_tab_access(tables):
    # Put user-a in the semi-left state before the request
    _member_row(tables, "tab-1", "user-a")["left_at"] = "2024-06-01T00:00:00+00:00"

    with make_client(tables, "user-a") as client:
        resp = client.get("/tabs/tab-1")

    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Test 3 — Active members see ALL members including semi-left
# ---------------------------------------------------------------------------

def test_active_members_see_all_members_including_semi_left(tables):
    _member_row(tables, "tab-1", "user-b")["left_at"] = "2024-06-01T00:00:00+00:00"

    with make_client(tables, "user-a") as client:
        resp = client.get("/tabs/tab-1")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["members"]) == 2, "both members must appear in the response"


# ---------------------------------------------------------------------------
# Test 4 — Tab deletes when ALL members have left
# ---------------------------------------------------------------------------

def test_tab_deletes_when_all_members_have_left(tables):
    # Remove user-b so user-a is the sole active member
    tables["tab_members"] = [r for r in tables["tab_members"] if r["user_id"] != "user-b"]

    with make_client(tables, "user-a") as client:
        resp = client.delete("/tabs/tab-1/members/me")

    assert resp.status_code == 200
    assert not _tab_exists(tables, "tab-1"), "tab must be deleted when last active member leaves"


# ---------------------------------------------------------------------------
# Test 5 — Cleared-tab TTL ignores semi-left users
# ---------------------------------------------------------------------------

def test_cleared_tab_ttl_ignores_semi_left_users(tables):
    """
    user-a is semi-left.
    user-b is active and has cleared the tab a long time ago (past TTL).
    _delete_expired_cleared_tabs() should delete the tab because
    the only ACTIVE member (user-b) is cleared past the TTL.
    """
    import routers.tabs as tabs_router

    # user-a is semi-left — their cleared_at should NOT block deletion
    _member_row(tables, "tab-1", "user-a")["left_at"] = "2024-06-01T00:00:00+00:00"
    _member_row(tables, "tab-1", "user-a")["cleared_at"] = None  # not cleared, but irrelevant

    # user-b is active and cleared long ago
    _member_row(tables, "tab-1", "user-b")["cleared_at"] = "2020-01-01T00:00:00+00:00"

    sb = make_mock_sb(tables)
    with patch.object(tabs_router, "get_supabase", return_value=sb):
        tabs_router._delete_expired_cleared_tabs()

    assert not _tab_exists(tables, "tab-1"), "tab must be deleted when only active member is cleared past TTL"


def test_cleared_tab_ttl_not_deleted_when_active_member_not_cleared(tables):
    """
    user-a is semi-left.
    user-b is active but has NOT cleared.
    Tab must NOT be deleted.
    """
    import routers.tabs as tabs_router

    _member_row(tables, "tab-1", "user-a")["left_at"] = "2024-06-01T00:00:00+00:00"
    _member_row(tables, "tab-1", "user-a")["cleared_at"] = "2020-01-01T00:00:00+00:00"
    # user-b: cleared_at stays None (not cleared)

    sb = make_mock_sb(tables)
    with patch.object(tabs_router, "get_supabase", return_value=sb):
        tabs_router._delete_expired_cleared_tabs()

    assert _tab_exists(tables, "tab-1"), "tab must survive while an active member has not cleared"


# ---------------------------------------------------------------------------
# Test 6 — Create expense works with semi-left user in payer/splits
# ---------------------------------------------------------------------------

def test_create_expense_works_with_semi_left_in_splits(tables):
    """
    user-b is semi-left, but user-a (active) can still create an expense
    with user-b as the payer and in the split.
    """
    _member_row(tables, "tab-1", "user-b")["left_at"] = "2024-06-01T00:00:00+00:00"
    tables["expenses"] = []
    tables["expense_splits"] = []

    with make_client(tables, "user-a") as client:
        resp = client.post("/tabs/tab-1/expenses", json={
            "title": "Dinner",
            "amount": 30.00,
            "payer_id": "user-b",
            "split_member_ids": ["user-a", "user-b"],
        })

    assert resp.status_code == 201, f"expected 201, got {resp.status_code}: {resp.text}"


# ---------------------------------------------------------------------------
# Test 7 — Rejoin via invite code clears left_at
# ---------------------------------------------------------------------------

def test_rejoin_clears_left_at(tables):
    _member_row(tables, "tab-1", "user-a")["left_at"] = "2024-06-01T00:00:00+00:00"

    with make_client(tables, "user-a") as client:
        resp = client.post("/invites/join", json={"code": "ABCD12"})

    assert resp.status_code == 201
    row = _member_row(tables, "tab-1", "user-a")
    assert row["left_at"] is None, "left_at must be cleared on rejoin"
    assert row["joined_at"] != "2024-01-01T00:00:00+00:00", "joined_at must be refreshed on rejoin"


# ---------------------------------------------------------------------------
# Test 8 — Member list includes left_at field with correct values
# ---------------------------------------------------------------------------

def test_member_list_includes_left_at_field(tables):
    _member_row(tables, "tab-1", "user-b")["left_at"] = "2024-06-01T00:00:00+00:00"

    with make_client(tables, "user-a") as client:
        resp = client.get("/tabs/tab-1")

    assert resp.status_code == 200
    members = resp.json()["members"]
    by_id = {m["user_id"]: m for m in members}

    assert "left_at" in by_id["user-a"], "left_at field must be present for active member"
    assert by_id["user-a"]["left_at"] is None, "active member must have left_at = null"

    assert "left_at" in by_id["user-b"], "left_at field must be present for semi-left member"
    assert by_id["user-b"]["left_at"] is not None, "semi-left member must have left_at set"


# ---------------------------------------------------------------------------
# Test 9 — member_count only counts active members
# ---------------------------------------------------------------------------

def test_member_count_only_counts_active_members(tables):
    _member_row(tables, "tab-1", "user-b")["left_at"] = "2024-06-01T00:00:00+00:00"

    with make_client(tables, "user-a") as client:
        resp = client.get("/tabs/tab-1")

    assert resp.status_code == 200
    assert resp.json()["member_count"] == 1, "member_count must only count active members"
