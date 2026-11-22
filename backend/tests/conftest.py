"""Shared pytest fixtures."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture()
def client() -> TestClient:
    with TestClient(create_app()) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def reset_datastore() -> None:
    from app.services.data_store import data_store

    data_store.journeys.clear()
    data_store.reports.clear()
    data_store.safe_locations.clear()
    data_store.shares.clear()
    data_store.contacts.clear()
    data_store.users.clear()
    data_store.sos_alerts.clear()
    data_store.seed_initial_data()
    yield

