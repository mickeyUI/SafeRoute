"""Ensure the published OpenAPI schema stays aligned with documented routes."""

from fastapi.testclient import TestClient

EXPECTED_PATHS = {
    "/api/v1/auth/register",
    "/api/v1/auth/login",
    "/api/v1/auth/me",
    "/api/v1/routes/compare",
    "/api/v1/reports",
    "/api/v1/reports/nearby",
    "/api/v1/safe-locations",
    "/api/v1/safe-locations/nearby",
    "/api/v1/journeys",
    "/api/v1/journeys/active",
    "/api/v1/contacts",
    "/api/v1/sos",
    "/api/v1/sos/mine",
    "/api/v1/sos/alerts",
    "/api/v1/sos/alerts/nearby",
    "/api/v1/sos/alerts/{alert_id}/resolve",
    "/api/v1/health/ready",
}


def test_openapi_contains_core_paths(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    assert EXPECTED_PATHS.issubset(schema["paths"])
