import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

from .config import settings


ERROR_LOGGER_NAME = "cari.errors"
ACCESS_LOGGER_NAME = "cari.access"
OPERATION_LOGGER_NAME = "cari.operations"


def _configure_logger(name: str, path: str, level: int, format_string: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    logger.setLevel(level)
    logger.propagate = False
    formatter = logging.Formatter(format_string)

    log_path = Path(path)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    file_handler = RotatingFileHandler(
        log_path,
        maxBytes=settings.error_log_max_bytes,
        backupCount=settings.error_log_backup_count,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    return logger


error_logger = _configure_logger(
    ERROR_LOGGER_NAME, settings.error_log_file, logging.WARNING,
    "%(asctime)s %(levelname)s request_id=%(request_id)s method=%(method)s path=%(path)s "
    "status=%(status)s error_type=%(error_type)s message=%(message)s",
)
access_logger = _configure_logger(
    ACCESS_LOGGER_NAME, settings.access_log_file, logging.INFO,
    "%(asctime)s %(levelname)s request_id=%(request_id)s actor_id=%(actor_id)s method=%(method)s "
    "path=%(path)s status=%(status)s duration_ms=%(duration_ms).2f message=%(message)s",
)
operation_logger = _configure_logger(
    OPERATION_LOGGER_NAME, settings.operation_log_file, logging.INFO,
    "%(asctime)s %(levelname)s request_id=%(request_id)s actor_id=%(actor_id)s action=%(action)s "
    "project_id=%(project_id)s ceg=%(ceg)s result=%(result)s count=%(count)s duration_ms=%(duration_ms).2f message=%(message)s",
)


def log_request_error(request, status: int, error_type: str, message: str, *, exc: Exception | None = None) -> None:
    context = {
        "request_id": getattr(request.state, "request_id", "unknown"),
        "method": request.method,
        "path": request.url.path,
        "status": status,
        "error_type": error_type,
    }
    if exc is not None:
        error_logger.error(message, extra=context, exc_info=(type(exc), exc, exc.__traceback__))
    elif status >= 500:
        error_logger.error(message, extra=context)
    else:
        error_logger.warning(message, extra=context)


def log_access(request, status: int, duration_ms: float) -> None:
    access_logger.info("Request completed.", extra={
        "request_id": getattr(request.state, "request_id", "unknown"),
        "actor_id": getattr(request.state, "actor_id", "anonymous"),
        "method": request.method,
        "path": request.url.path,
        "status": status,
        "duration_ms": duration_ms,
    })


def log_operation(action: str, actor_id: str, *, project_id: int | str = "-", ceg: str | None = None,
                  result: str = "success", count: int = 1, duration_ms: float = 0,
                  request_id: str = "system", message: str = "Business operation completed.") -> None:
    operation_logger.info(message, extra={
        "request_id": request_id,
        "actor_id": actor_id,
        "action": action,
        "project_id": project_id,
        "ceg": ceg or "-",
        "result": result,
        "count": count,
        "duration_ms": duration_ms,
    })
