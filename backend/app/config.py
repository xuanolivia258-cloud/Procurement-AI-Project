from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "CARI Procurement Project Tracking"
    database_url: str = "sqlite:///./data/procurement.db"
    auth_mode: str = "disabled"
    local_actor_id: str = "local-test-user"
    local_actor_name: str = "Local Test User"
    cors_origins: str = "http://localhost:5173,http://localhost:8080"
    exchange_rate_api_url: str = "https://apig.his.huawei.com/api/idata/fin/v2/projects/com.huawei.caplatform/getBatchRatemsRateList"
    exchange_rate_tenant_id: str = ""
    exchange_rate_rate_type: str = "SPOT"
    exchange_rate_timeout_seconds: float = 10.0
    exchange_rate_iam_token_url: str = "https://iam.his-op-beta.huawei.com/iam/auth/token"
    exchange_rate_iam_account: str = ""
    exchange_rate_iam_secret: SecretStr = SecretStr("")
    exchange_rate_iam_project_id: str = ""
    exchange_rate_iam_enterprise_id: str = ""
    error_log_file: str = "data/logs/backend-errors.log"
    access_log_file: str = "data/logs/backend-access.log"
    operation_log_file: str = "data/logs/backend-operations.log"
    integration_log_file: str = "data/logs/backend-integrations.log"
    integration_log_response_max_chars: int = 2000
    error_log_max_bytes: int = 5_000_000
    error_log_backup_count: int = 5

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


settings = Settings()
Path("data").mkdir(parents=True, exist_ok=True)
