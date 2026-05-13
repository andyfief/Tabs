"""
Shared test fixtures for semi-left and other backend tests.

Uses an in-memory QueryBuilder to simulate the Supabase fluent chain:
  sb.table(name).select(...).eq(...).is_(...).execute()
without hitting a real database.
"""
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# In-memory Supabase query builder
# ---------------------------------------------------------------------------

class QueryBuilder:
    """Simulates the Supabase Python client's fluent query builder."""

    def __init__(self, rows: list[dict], tables: dict, table_name: str):
        self._rows = list(rows)
        self._tables = tables
        self._table_name = table_name
        self._filters: list[tuple] = []
        self._select_keys: list[str] | None = None
        self._count_mode = False
        self._op = "select"
        self._update_data: dict = {}
        self._insert_data: list[dict] | dict = []

    def select(self, fields: str = "*", count: str | None = None):
        if count == "exact":
            self._count_mode = True
        if fields != "*":
            self._select_keys = [f.strip() for f in fields.split(",")]
        return self

    def eq(self, key: str, val):
        self._filters.append((key, "eq", val))
        return self

    def is_(self, key: str, val):
        self._filters.append((key, "is_", val))
        return self

    def in_(self, key: str, vals):
        self._filters.append((key, "in_", list(vals)))
        return self

    def update(self, data: dict):
        self._op = "update"
        self._update_data = data
        return self

    def insert(self, data):
        self._op = "insert"
        self._insert_data = data if isinstance(data, list) else [data]
        return self

    def delete(self):
        self._op = "delete"
        return self

    def execute(self):
        result = MagicMock()

        if self._op == "select":
            rows = self._apply_filters(self._rows)
            if self._select_keys:
                rows = [{k: r.get(k) for k in self._select_keys} for r in rows]
            result.data = rows
            result.count = len(rows) if self._count_mode else None

        elif self._op == "update":
            source = self._tables[self._table_name]
            for r in source:
                if self._matches(r):
                    r.update(self._update_data)
            result.data = []
            result.count = None

        elif self._op == "delete":
            source = self._tables[self._table_name]
            self._tables[self._table_name] = [r for r in source if not self._matches(r)]
            result.data = []
            result.count = None

        elif self._op == "insert":
            inserted = []
            for i, d in enumerate(list(self._insert_data)):
                row = dict(d)
                if "id" not in row:
                    row["id"] = f"mock-{self._table_name}-{len(self._tables[self._table_name]) + i}"
                self._tables[self._table_name].append(row)
                inserted.append(row)
            result.data = inserted
            result.count = None

        return result

    def _apply_filters(self, rows: list[dict]) -> list[dict]:
        return [r for r in rows if self._matches(r)]

    def _matches(self, row: dict) -> bool:
        for key, op, val in self._filters:
            if op == "eq":
                if row.get(key) != val:
                    return False
            elif op == "is_":
                if val == "null":
                    if row.get(key) is not None:
                        return False
                else:
                    # is_ with non-null value: check equality
                    if row.get(key) != val:
                        return False
            elif op == "in_":
                if row.get(key) not in val:
                    return False
        return True


def make_mock_sb(tables: dict) -> MagicMock:
    """Return a mock Supabase client backed by the given in-memory tables dict."""
    sb = MagicMock()
    sb.table.side_effect = lambda name: _TableProxy(tables, name)
    return sb


class _TableProxy:
    def __init__(self, tables: dict, name: str):
        self._tables = tables
        self._name = name

    def select(self, fields="*", count=None):
        return QueryBuilder(self._tables.get(self._name, []), self._tables, self._name).select(fields, count)

    def update(self, data):
        return QueryBuilder(self._tables.get(self._name, []), self._tables, self._name).update(data)

    def insert(self, data):
        return QueryBuilder(self._tables.get(self._name, []), self._tables, self._name).insert(data)

    def delete(self):
        return QueryBuilder(self._tables.get(self._name, []), self._tables, self._name).delete()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tables():
    """
    Default in-memory table state for semi-left tests.
    user-a and user-b are both active members of tab-1.
    """
    return {
        "tabs": [
            {
                "id": "tab-1",
                "name": "Test Tab",
                "status": "open",
                "description": None,
                "created_by": "user-a",
                "created_at": "2024-01-01T00:00:00+00:00",
            },
        ],
        "tab_members": [
            {
                "tab_id": "tab-1",
                "user_id": "user-a",
                "joined_at": "2024-01-01T00:00:00+00:00",
                "cleared_at": None,
                "left_at": None,
                "links_unlocked_at": None,
            },
            {
                "tab_id": "tab-1",
                "user_id": "user-b",
                "joined_at": "2024-01-01T00:00:00+00:00",
                "cleared_at": None,
                "left_at": None,
                "links_unlocked_at": None,
            },
        ],
        "tab_invites": [
            {
                "id": "inv-1",
                "tab_id": "tab-1",
                "code": "ABCD12",
                "created_by": "user-a",
            },
        ],
        "users": [
            {"id": "user-a", "display_name": "Alice", "venmo_handle": None, "cashapp_handle": None},
            {"id": "user-b", "display_name": "Bob", "venmo_handle": None, "cashapp_handle": None},
        ],
        "expenses": [],
        "expense_splits": [],
        "balance_settlements": [],
    }


from contextlib import contextmanager


@contextmanager
def make_client(tables: dict, user_id: str):
    """
    Context manager returning a TestClient with auth and supabase dependencies
    overridden. All routers share the same mock supabase instance backed by `tables`.
    """
    import sys
    import os
    backend_dir = os.path.join(os.path.dirname(__file__), "..")
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)

    from main import app
    from services.auth import get_current_user
    import routers.tabs as tabs_router
    import routers.invites as invites_router
    import routers.expenses as expenses_router

    sb = make_mock_sb(tables)
    app.dependency_overrides[get_current_user] = lambda: user_id

    with patch.object(tabs_router, "get_supabase", return_value=sb), \
         patch.object(invites_router, "get_supabase", return_value=sb), \
         patch.object(expenses_router, "get_supabase", return_value=sb):
        yield TestClient(app, raise_server_exceptions=True)

    app.dependency_overrides.clear()
