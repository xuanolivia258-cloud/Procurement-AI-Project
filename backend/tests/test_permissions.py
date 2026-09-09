from contextlib import contextmanager

import pytest
from starlette.requests import Request

from app.auth import get_actor
from app.config import Settings, settings
from app.database import get_db
from app.main import app
from app.models import AccessGrant
from app.schemas import Actor


def actor(employee_id: str, role: str):
    return Actor(id=employee_id, name=employee_id, role=role)


@pytest.mark.parametrize("value,expected", [
    (" L00123456, z00876543 ,, l00123456, ", {"l00123456", "z00876543"}),
    ("00123456,00987654", {"00123456", "00987654"}),
    ("l00123456", {"l00123456"}),
    (" , , ", set()),
    ("", set()),
])
def test_initial_admin_ids_read_comma_separated_environment(monkeypatch, value, expected):
    monkeypatch.setenv("INITIAL_ADMIN_IDS", value)
    assert Settings(_env_file=None).initial_admin_id_set == expected


def test_permissions_ignore_names_and_old_session_roles(client, monkeypatch):
    monkeypatch.setattr(settings, "auth_mode", "w3")
    monkeypatch.setattr(settings, "initial_admin_ids", "l00123456")
    # Reuse the client's isolated database, never the developer's runtime database.
    with contextmanager(app.dependency_overrides[get_db])() as db:
        db.add(AccessGrant(employee_id="z00876543", role="admin", cn_name="相同姓名",
                           full_name="Same Name", created_by="l00123456", updated_by="l00123456"))
        db.commit()
        for employee_id, saved_role, expected_role in [
            ("L00123456", "member", "admin"),
            ("z00876543", "member", "admin"),
            ("l99999999", "admin", "member"),
        ]:
            request = Request({"type": "http", "session": {"actor": {
                "id": employee_id, "name": "相同姓名", "name_en": "Same Name", "role": saved_role,
            }}})
            assert get_actor(request, db).role == expected_role


def test_member_only_sees_and_changes_own_projects(client):
    app.dependency_overrides[get_actor] = lambda: actor("member-a", "member")
    own = client.post("/api/projects", json={"ceg": "OWN"}).json()
    app.dependency_overrides[get_actor] = lambda: actor("member-b", "member")
    other = client.post("/api/projects", json={"ceg": "OTHER"}).json()
    listing = client.get("/api/projects").json()
    assert [item["id"] for item in listing["items"]] == [other["id"]]
    assert client.get(f"/api/projects/{own['id']}").status_code == 404
    assert client.delete(f"/api/projects/{own['id']}?version={own['version']}").status_code == 404


def test_admin_sees_all_projects_and_manages_grants(client):
    app.dependency_overrides[get_actor] = lambda: actor("member-a", "member")
    client.post("/api/projects", json={"ceg": "A"})
    app.dependency_overrides[get_actor] = lambda: actor("member-b", "member")
    client.post("/api/projects", json={"ceg": "B"})
    assert client.get("/api/access-grants").status_code == 403

    app.dependency_overrides[get_actor] = lambda: actor("admin-a", "admin")
    assert client.get("/api/projects").json()["total"] == 2
    saved = client.put("/api/access-grants/member-a", json={
        "employee_id": "MEMBER-A", "role": "member", "cn_name": "成员甲",
        "full_name": "Member A", "department": "Procurement",
    })
    assert saved.status_code == 200
    assert saved.json()["employee_id"] == "member-a"
    assert any(item["employee_id"] == "member-a" for item in client.get("/api/access-grants").json())

