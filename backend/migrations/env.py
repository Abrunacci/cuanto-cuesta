"""Run the migrations against the database named by the environment.

In production infra runs ``alembic upgrade head`` before each deploy switches, as the owner of
the database (``MIGRATION_DATABASE_URL``), and passes the app's role as ``APP_DB_USER`` so the
migrations can grant it what it needs. With a single role (``MIGRATION_DATABASE_URL`` unset),
``DATABASE_URL`` runs them. A URL already set on the config (the test suite) wins.
"""

import os

from alembic import context
from sqlalchemy import engine_from_config, pool

from cuanto_cuesta.infrastructure.db import metadata
from cuanto_cuesta.infrastructure.settings import sqlalchemy_url

config = context.config

if not config.get_main_option("sqlalchemy.url"):
    url = os.environ.get("MIGRATION_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("Set MIGRATION_DATABASE_URL (or DATABASE_URL) to run the migrations.")
    # Escaped: the ini parser would read a "%" in a password as interpolation.
    config.set_main_option("sqlalchemy.url", sqlalchemy_url(url).replace("%", "%%"))

target_metadata = metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
