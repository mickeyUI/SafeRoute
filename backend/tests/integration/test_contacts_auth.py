from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_contacts_crud():
    # 1. List pre-seeded contacts
    res = client.get("/api/v1/contacts")
    assert res.status_code == 200
    contacts = res.json()
    assert len(contacts) >= 2

    # 2. Create new contact
    new_contact = {
        "name": "Abebe (Friend / Emergency)",
        "phone": "+251 92 345 6789",
        "email": "abebe@example.com",
        "relationship": "Friend",
    }
    create_res = client.post("/api/v1/contacts", json=new_contact)
    assert create_res.status_code == 201
    created_id = create_res.json()["id"]

    # 3. Delete contact
    del_res = client.delete(f"/api/v1/contacts/{created_id}")
    assert del_res.status_code == 204


def test_auth_register_and_login():
    # 1. Register new user
    user_payload = {
        "email": "newtraveler@example.com",
        "password": "SecurePassword123!",
        "full_name": "New Traveler",
    }
    reg_res = client.post("/api/v1/auth/register", json=user_payload)
    assert reg_res.status_code == 201
    assert "access_token" in reg_res.json()

    # 2. Login
    login_payload = {"email": "newtraveler@example.com", "password": "SecurePassword123!"}
    login_res = client.post("/api/v1/auth/login", json=login_payload)
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    assert len(token) > 20

    # 3. Authenticated me endpoint
    me_res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    assert me_res.json()["email"] == "newtraveler@example.com"
