"""Password and JWT helper tests."""

from datetime import timedelta

from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_password_hash_roundtrip() -> None:
    hashed = hash_password("correct horse battery staple")
    assert hashed != "correct horse battery staple"
    assert verify_password("correct horse battery staple", hashed)
    assert not verify_password("wrong password", hashed)


def test_access_token_roundtrip() -> None:
    token = create_access_token("user-123", timedelta(minutes=5))
    payload = decode_access_token(token)
    assert payload["sub"] == "user-123"
    assert "exp" in payload
