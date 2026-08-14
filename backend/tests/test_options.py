def test_reference_option_lifecycle(client):
    created = client.post("/api/reference-options", json={
        "category": "supplier_type", "code": "Preferred", "label_en": "Preferred",
        "label_zh": "优选", "sort_order": 1,
    })
    assert created.status_code == 201
    option = created.json()
    updated = client.put(f"/api/reference-options/{option['id']}", json={
        "label_en": option["label_en"], "label_zh": option["label_zh"],
        "active": False, "sort_order": 1,
    })
    assert updated.status_code == 200
    assert updated.json()["active"] is False
    active = client.get("/api/reference-options?category=supplier_type").json()
    assert all(item["id"] != option["id"] for item in active)
    deleted = client.delete(f"/api/reference-options/{option['id']}")
    assert deleted.status_code == 204


def test_used_reference_option_cannot_be_deleted(client):
    option = client.post("/api/reference-options", json={
        "category": "supplier_type", "code": "Used", "label_en": "Used",
        "label_zh": "已使用", "sort_order": 1,
    }).json()
    assert client.post("/api/projects", json={"supplier_type": "Used"}).status_code == 201
    response = client.delete(f"/api/reference-options/{option['id']}")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "OPTION_IN_USE"
