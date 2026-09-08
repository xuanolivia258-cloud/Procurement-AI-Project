from app.auth import get_actor
from app.main import app
from app.schemas import Actor


def actor(employee_id: str, role: str):
    return Actor(id=employee_id, name=employee_id, role=role)


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

