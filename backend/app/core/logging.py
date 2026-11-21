"""Structured logging configuration."""

from __future__ import annotations

import json
import logging
import logging.config
from typing import Any

from app.core.config import Settings


class JsonFormatter(logging.Formatter):
    """Minimal JSON formatter; stdlib only, no extra dependency."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging(settings: Settings) -> None:
    formatter = "json" if settings.app_env != "local" else "generic"
    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "generic": {"format": "%(levelname)-5s %(name)s: %(message)s"},
                "json": {"()": JsonFormatter},
            },
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "formatter": formatter,
                    "stream": "ext://sys.stdout",
                }
            },
            "root": {
                "level": "DEBUG" if settings.debug else "INFO",
                "handlers": ["console"],
            },
        }
    )
