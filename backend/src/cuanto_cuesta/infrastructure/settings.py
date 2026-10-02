"""Settings from the environment, checked once at startup.

The server's values come from infra: ``DATABASE_URL`` and ``INGEST_TOKEN`` are secrets it
generates, ``INGEST_TOKEN_NEXT`` is set only while rotating the token. A missing or unusable value
stops the app from starting, with a message that names the variable and never its value.
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
    ingest_tokens: tuple[str, ...] = field(repr=False)
    """The current token and, while rotating, the next one. Either is accepted."""
    config_dir: Path = DEFAULT_CONFIG_DIR

    @classmethod
    def from_env(cls, env: Mapping[str, str]) -> Settings:
        tokens = [_token(env, "INGEST_TOKEN", required=True)]
        if next_token := _token(env, "INGEST_TOKEN_NEXT", required=False):
            tokens.append(next_token)
        return cls(
            database_url=sqlalchemy_url(_required(env, "DATABASE_URL")),
            ingest_tokens=tuple(t for t in tokens if t),
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


def _token(env: Mapping[str, str], name: str, *, required: bool) -> str:
    value = _required(env, name) if required else env.get(name, "").strip()
    if value and len(value) < MIN_TOKEN_LENGTH:
        raise SettingsError(f"{name} must be at least {MIN_TOKEN_LENGTH} characters long")
    return value
