"""A real Postgres for the integration tests, set up the way production is.

The suite reads the same variables as the app and the migrations: ``MIGRATION_DATABASE_URL``
(the owner), ``DATABASE_URL`` (the app's role, which owns nothing) and ``APP_DB_USER``. It
creates its own database next to theirs (``<name>_test``), migrates it as the owner, and the app
under test connects as the app's role, so a missing grant fails here and not in production.

Without those variables the tests are skipped locally, and fail in CI.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from cuanto_cuesta.api.app import create_app
from cuanto_cuesta.infrastructure.settings import Settings, sqlalchemy_url

BACKEND_DIR = Path(__file__).parents[2]
TOKEN = "current-token-" + "c" * 32


@dataclass(frozen=True)
class Database:
    owner_url: sa.URL
    app_url: sa.URL


@dataclass
class Clock:
    now: datetime = datetime(2026, 10, 1, 15, 0, tzinfo=UTC)

    def __call__(self) -> datetime:
        return self.now


@pytest.fixture(scope="session")
def database() -> Iterator[Database]:
    owner = os.environ.get("MIGRATION_DATABASE_URL")
    app = os.environ.get("DATABASE_URL")
    if not owner or not app:
        message = "MIGRATION_DATABASE_URL and DATABASE_URL are needed for the integration tests"
        if os.environ.get("CI"):
            pytest.fail(message)
        pytest.skip(message)
    owner_url = sa.make_url(sqlalchemy_url(owner))
    name = f"{owner_url.database}_test"
    test = Database(
        owner_url.set(database=name), sa.make_url(sqlalchemy_url(app)).set(database=name)
    )

    admin = sa.create_engine(owner_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        connection.execute(sa.text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        connection.execute(sa.text(f'CREATE DATABASE "{name}"'))
    config = Config(BACKEND_DIR / "alembic.ini")
    url = test.owner_url.render_as_string(hide_password=False)
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    command.upgrade(config, "head")
    yield test
    with admin.connect() as connection:
        connection.execute(sa.text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
    admin.dispose()


@pytest.fixture
def owner(database: Database) -> Iterator[sa.Engine]:
    """The owner's connection, to set up and inspect rows; every test starts with none."""
    engine = sa.create_engine(database.owner_url)
    with engine.begin() as connection:
        connection.execute(sa.text("TRUNCATE rate_quote"))
    yield engine
    engine.dispose()


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def client(database: Database, owner: sa.Engine, clock: Clock) -> Iterator[TestClient]:
    settings = Settings(
        database_url=database.app_url.render_as_string(hide_password=False),
        ingest_token=TOKEN,
        config_dir=BACKEND_DIR / "config",
    )
    with TestClient(create_app(settings, clock)) as test_client:
        yield test_client
