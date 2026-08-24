from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "CARI Procurement Project Tracking"
    database_url: str = "sqlite:///./data/procurement.db"
    auth_mode: str = "disabled"
    local_actor_id: str = "local-test-user"
    local_actor_name: str = "Local Test User"
    cors_origins: str = "http://localhost:5173,http://localhost:8080"
    exchange_rate_api_url: str = "https://apigp-kwe.huawei.com/api/idata/fin/v2/projects/project_id/getBatchRatemsRateList"
    exchange_rate_tenant_id: str = ""
    exchange_rate_rate_type: str = "SPOT"
    exchange_rate_timeout_seconds: float = 10.0

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


settings = Settings()
Path("data").mkdir(parents=True, exist_ok=True)
