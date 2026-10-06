"""Settings from the environment, checked once at startup.

The server's values come from infra: ``DATABASE_URL`` and ``INGEST_TOKEN`` are secrets it
generates. A missing or unusable value stops the app from starting, with a message that names the
variable and never its value.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path

MIN_TOKEN_LENGTH = 32
"""Long enough that guessing is out of the question for a token infra generates at random."""

DEFAULT_CONFIG_DIR = Path("config")
"""Relative to the working directory: ``backend/`` in development, ``/app`` in the image."""


class SettingsError(Exception):
    """A required variable is missing, or one has a value the app cannot use."""


@dataclass(frozen=True, slots=True)
class Settings:
    database_url: str
    ingest_token: str = field(repr=False)
    """The only token ``/api/ingest`` accepts. Infra rotates it by restarting the app."""
    config_dir: Path = DEFAULT_CONFIG_DIR

    @classmethod
    def from_env(cls, env: Mapping[str, str]) -> Settings:
        return cls(
            database_url=sqlalchemy_url(_required(env, "DATABASE_URL")),
            ingest_token=_token(env, "INGEST_TOKEN"),
            config_dir=Path(env.get("CONFIG_DIR") or DEFAULT_CONFIG_DIR),
        )


def sqlalchemy_url(url: str) -> str:
    """Point a plain ``postgresql://`` URL at psycopg 3, the driver this app installs.

    Infra hands out ``postgresql://`` by default, which SQLAlchemy would read as psycopg2.
    A URL that already names a driver is kept as it is.
    """
    for scheme in ("postgresql://", "postgres://"):
        if url.startswith(scheme):
            return "postgresql+psycopg://" + url.removeprefix(scheme)
    return url


def _required(env: Mapping[str, str], name: str) -> str:
    value = env.get(name, "").strip()
    if not value:
        raise SettingsError(f"{name} is not set")
    return value


def _token(env: Mapping[str, str], name: str) -> str:
    value = _required(env, name)
    if len(value) < MIN_TOKEN_LENGTH:
        raise SettingsError(f"{name} must be at least {MIN_TOKEN_LENGTH} characters long")
    return value
