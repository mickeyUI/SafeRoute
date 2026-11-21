"""FastAPI application factory, CORS, error handlers, and liveness endpoint."""

from __future__ import annotations

from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app import __version__
from app.api.v1.router import router as api_v1_router
from app.core.config import settings
from app.core.errors import AppError
from app.core.logging import configure_logging


def _error_response(
    request: Request,
    status_code: int,
    code: str,
    message: str,
    details: object = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "details": jsonable_encoder(details),
                "request_id": getattr(request.state, "request_id", None),
            }
        },
    )


def create_app() -> FastAPI:
    configure_logging(settings)

    app = FastAPI(
        title=settings.app_name,
        version=settings.version or __version__,
        description="Safety-aware route comparison API",
        docs_url="/docs" if settings.debug else None,
        redoc_url="/redoc" if settings.debug else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):  # type: ignore[no-untyped-def]
        request.state.request_id = request.headers.get("x-request-id") or str(uuid4())
        response = await call_next(request)
        response.headers["x-request-id"] = request.state.request_id
        return response

    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        return _error_response(
            request, exc.status_code, exc.code, exc.message, exc.details
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return _error_response(
            request, 422, "validation_error", "Request validation failed", exc.errors()
        )

    @app.exception_handler(SQLAlchemyError)
    async def handle_database_error(request: Request, exc: SQLAlchemyError) -> JSONResponse:
        return _error_response(
            request, 500, "database_error", "A database error occurred"
        )

    @app.get("/health", tags=["health"])
    def liveness() -> dict:
        return {
            "status": "ok",
            "version": settings.version,
            "routing_provider": settings.routing_provider,
        }

    app.include_router(api_v1_router, prefix=settings.api_v1_prefix)
    return app


app = create_app()
