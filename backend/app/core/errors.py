"""Typed application errors and their HTTP mapping."""

from __future__ import annotations

from typing import Any


class AppError(Exception):
    """Base error translated to a consistent JSON envelope by main.py."""

    status_code: int = 500
    code: str = "internal_error"

    def __init__(
        self,
        message: str | None = None,
        *,
        details: Any = None,
    ) -> None:
        self.message = message or self.code.replace("_", " ").capitalize()
        self.details = details
        super().__init__(self.message)


class ValidationError(AppError):
    status_code = 422
    code = "validation_error"


class AuthenticationError(AppError):
    status_code = 401
    code = "authentication_error"


class ForbiddenError(AppError):
    status_code = 403
    code = "forbidden_error"


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class ConflictError(AppError):
    status_code = 409
    code = "conflict_error"


class RateLimitError(AppError):
    status_code = 429
    code = "rate_limited"


class InvalidStateError(ConflictError):
    code = "invalid_state"


class RoutingError(AppError):
    status_code = 502
    code = "routing_error"
