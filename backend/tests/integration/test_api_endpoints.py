from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "online"


def test_routes_compare_addis_ababa():
    # Route from Piassa to Arat Kilo
    payload = {
        "origin": {"latitude": 9.0350, "longitude": 38.7500},
        "destination": {"latitude": 9.0330, "longitude": 38.7620},
        "preference": "safety",
        "departure_hour": 14,
    }
    response = client.post("/api/v1/routes/compare", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert len(data["routes"]) >= 2
    first_route = data["routes"][0]
    assert "safety_indicator" in first_route
    assert "overall_risk_score" in first_route["safety_indicator"]
    assert "data_coverage_score" in first_route["safety_indicator"]
    assert len(first_route["geometry"]["coordinates"]) >= 2


def test_reports_lifecycle():
    # 1. Create a report
    rep_payload = {
        "category": "poor_street_lighting",
        "latitude": 9.0345,
        "longitude": 38.7520,
        "severity": 3,
        "description": "Streetlight broken near crossroad",
        "is_anonymous": True,
    }
    create_res = client.post("/api/v1/reports", json=rep_payload)
    assert create_res.status_code == 201

    # 2. Query nearby reports
    nearby_res = client.get(
        "/api/v1/reports/nearby?latitude=9.0345&longitude=38.7520&radius_meters=1000"
    )
    assert nearby_res.status_code == 200
    geojson = nearby_res.json()
    assert geojson["type"] == "FeatureCollection"
    assert len(geojson["features"]) > 0


def test_safe_locations():
    res = client.get("/api/v1/locations/safe?latitude=9.0300&longitude=38.7500&radius_meters=10000")
    assert res.status_code == 200
    data = res.json()
    assert data["type"] == "FeatureCollection"
    assert len(data["features"]) >= 4


def test_journey_creation_and_sharing():
    journey_payload = {
        "origin": {"latitude": 9.0350, "longitude": 38.7500},
        "destination": {"latitude": 9.0330, "longitude": 38.7620},
        "estimated_duration_seconds": 1200,
    }
    create_res = client.post("/api/v1/journeys", json=journey_payload)
    assert create_res.status_code == 201
    j_id = create_res.json()["journey_id"]

    # Create share link
    share_res = client.post(f"/api/v1/journeys/{j_id}/share", json={"valid_hours": 3})
    assert share_res.status_code == 200
    token = share_res.json()["share_token"]

    # Access shared view via public token
    public_res = client.get(f"/api/v1/shared/journeys/{token}")
    assert public_res.status_code == 200
    assert public_res.json()["journey_id"] == j_id
    assert public_res.json()["status"] == "active"


def test_google_auth():
    payload = {
        "email": "google_traveler@gmail.com",
        "full_name": "Google Safety Explorer",
        "avatar_url": "https://lh3.googleusercontent.com/a/default-user",
    }
    res = client.post("/api/v1/auth/google", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["email"] == "google_traveler@gmail.com"
    assert data["user"]["full_name"] == "Google Safety Explorer"
