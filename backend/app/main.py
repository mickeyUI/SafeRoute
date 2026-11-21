from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import SQLAlchemyError

from app.api.v1.api_router import api_router
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

    application = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.version,
        description=(
            "SafeRoute API: Community-powered safety navigation and "
            "pedestrian travel decision support."
        ),
        docs_url="/docs",
        redoc_url="/redoc" if settings.debug else None,
    )

    # CORS
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Request ID tracing middleware
    @application.middleware("http")
    async def request_id_middleware(request: Request, call_next):
        request.state.request_id = request.headers.get("x-request-id") or str(uuid4())
        response = await call_next(request)
        response.headers["x-request-id"] = request.state.request_id
        return response

    @application.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        return _error_response(request, exc.status_code, exc.code, exc.message, exc.details)

    @application.exception_handler(HTTPException)
    async def handle_http_error(request: Request, exc: HTTPException) -> JSONResponse:
        codes = {
            400: "bad_request",
            401: "authentication_error",
            403: "forbidden_error",
            404: "not_found",
            409: "conflict_error",
        }
        return _error_response(
            request,
            exc.status_code,
            codes.get(exc.status_code, "http_error"),
            str(exc.detail),
        )

    @application.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return _error_response(
            request, 422, "validation_error", "Request validation failed", exc.errors()
        )

    @application.exception_handler(SQLAlchemyError)
    async def handle_database_error(request: Request, exc: SQLAlchemyError) -> JSONResponse:
        return _error_response(request, 500, "database_error", "A database error occurred")

    # Root and liveness endpoints
    @application.get("/")
    async def root():
        return {
            "name": settings.PROJECT_NAME,
            "status": "online",
            "version": settings.version,
            "routing_provider": settings.routing_provider,
            "docs_url": "/docs",
            "description": "SafeRoute pedestrian safety scoring and navigation platform.",
        }

    @application.get("/health", tags=["Health"])
    async def health_check():
        return {
            "status": "ok",
            "version": settings.version,
            "routing_provider": settings.routing_provider,
        }

    # Mount API v1 router
    application.include_router(api_router, prefix=settings.API_V1_STR)

    # Static visual map demo, served from the same origin as the API.
    demo_dir = Path(__file__).resolve().parents[2] / "demo" / "map"
    if demo_dir.is_dir():
        application.mount(
            "/demo/map",
            StaticFiles(directory=demo_dir, html=True),
            name="demo-map",
        )

    return application


app = create_app()
