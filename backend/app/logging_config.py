import json
import logging
import re
from logging.handlers import RotatingFileHandler
from pathlib import Path

from .config import settings


ERROR_LOGGER_NAME = "cari.errors"
ACCESS_LOGGER_NAME = "cari.access"
OPERATION_LOGGER_NAME = "cari.operations"
INTEGRATION_LOGGER_NAME = "cari.integrations"
SENSITIVE_LOG_KEYS = {
    "authorization", "secret", "token", "access_token", "accesstoken",
    "account", "account_name", "accountname",
}


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
integration_logger = _configure_logger(
    INTEGRATION_LOGGER_NAME, settings.integration_log_file, logging.INFO,
    "%(asctime)s %(levelname)s request_id=%(request_id)s actor_id=%(actor_id)s service=%(service)s "
    "operation=%(operation)s result=%(result)s url=%(url)s status=%(status)s duration_ms=%(duration_ms).2f "
    "error_type=%(error_type)s response=%(response)s message=%(message)s",
)


def _redact_payload(value, key: str = ""):
    normalized_key = key.lower().replace("-", "_")
    if normalized_key in SENSITIVE_LOG_KEYS:
        return "[REDACTED]"
    if isinstance(value, dict):
        return {item_key: _redact_payload(item_value, str(item_key)) for item_key, item_value in value.items()}
    if isinstance(value, list):
        return [_redact_payload(item) for item in value]
    return value


def _safe_log_text(value: str, limit: int | None = None) -> str:
    text = re.sub(r"[\r\n\t]+", " ", value).strip()
    text = re.sub(
        r"(?i)((?:authorization|access[_-]?token|token|secret|account)\s*[=:]\s*)[^,;}]+",
        r"\1[REDACTED]",
        text,
    )
    max_chars = limit or settings.integration_log_response_max_chars
    return f"{text[:max_chars]}..." if len(text) > max_chars else (text or "-")


def summarize_http_response(response) -> str:
    if response is None:
        return "-"
    try:
        content = json.dumps(_redact_payload(response.json()), ensure_ascii=False, separators=(",", ":"))
    except ValueError:
        content = response.text
    return _safe_log_text(content)


def log_integration_event(*, request_id: str, actor_id: str, service: str, operation: str, result: str,
                          url: str, status: int | str = "-", duration_ms: float = 0,
                          response: str = "-", message: str = "Upstream request completed.",
                          exc: Exception | None = None) -> None:
    context = {
        "request_id": request_id,
        "actor_id": actor_id,
        "service": service,
        "operation": operation,
        "result": result,
        "url": _safe_log_text(url.split("?", 1)[0], 500),
        "status": status,
        "duration_ms": duration_ms,
        "error_type": type(exc).__name__ if exc is not None else "-",
        "response": _safe_log_text(response),
    }
    level = logging.ERROR if result == "failed" else logging.INFO
    integration_logger.log(
        level,
        _safe_log_text(message),
        extra=context,
        exc_info=(type(exc), exc, exc.__traceback__) if exc is not None else None,
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
