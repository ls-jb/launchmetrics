from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    DATABASE_URL: str
    SUPABASE_URL: str
    SUPABASE_JWT_SECRET: str
    SUPABASE_SERVICE_KEY: str = ""
    CORS_ORIGINS: str = "http://localhost:5173"
    ENVIRONMENT: str = "development"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origem.strip() for origem in self.CORS_ORIGINS.split(",") if origem.strip()]

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == "development"


settings = Settings()
