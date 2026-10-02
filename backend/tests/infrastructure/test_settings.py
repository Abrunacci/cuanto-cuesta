from pathlib import Path

import pytest

from cuanto_cuesta.infrastructure.settings import Settings, SettingsError, sqlalchemy_url

TOKEN = "t" * 32
NEXT = "n" * 32
URL = "postgresql://app:secret@db:5432/cuanto_cuesta"


def test_reads_the_required_variables() -> None:
    settings = Settings.from_env({"DATABASE_URL": URL, "INGEST_TOKEN": TOKEN})
    assert settings.database_url == "postgresql+psycopg://app:secret@db:5432/cuanto_cuesta"
    assert settings.ingest_tokens == (TOKEN,)
    assert settings.config_dir == Path("config")


def test_accepts_the_next_token_while_rotating() -> None:
    env = {"DATABASE_URL": URL, "INGEST_TOKEN": TOKEN, "INGEST_TOKEN_NEXT": NEXT}
    assert Settings.from_env(env).ingest_tokens == (TOKEN, NEXT)


def test_an_empty_next_token_turns_rotation_off() -> None:
    env = {"DATABASE_URL": URL, "INGEST_TOKEN": TOKEN, "INGEST_TOKEN_NEXT": "  "}
    assert Settings.from_env(env).ingest_tokens == (TOKEN,)


@pytest.mark.parametrize(
    ("env", "message"),
    [
        ({"INGEST_TOKEN": TOKEN}, "DATABASE_URL is not set"),
        ({"DATABASE_URL": URL}, "INGEST_TOKEN is not set"),
        ({"DATABASE_URL": URL, "INGEST_TOKEN": " "}, "INGEST_TOKEN is not set"),
        ({"DATABASE_URL": URL, "INGEST_TOKEN": "t" * 31}, "INGEST_TOKEN must be at least 32"),
        (
            {"DATABASE_URL": URL, "INGEST_TOKEN": TOKEN, "INGEST_TOKEN_NEXT": "short"},
            "INGEST_TOKEN_NEXT must be at least 32",
        ),
    ],
)
def test_refuses_to_start_without_usable_values(env: dict[str, str], message: str) -> None:
    with pytest.raises(SettingsError, match=message) as info:
        Settings.from_env(env)
    assert "secret" not in str(info.value)


def test_the_tokens_never_show_in_the_settings_repr() -> None:
    settings = Settings.from_env({"DATABASE_URL": URL, "INGEST_TOKEN": TOKEN})
    assert TOKEN not in repr(settings)


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("postgresql://u:p@h/d", "postgresql+psycopg://u:p@h/d"),
        ("postgres://u:p@h/d", "postgresql+psycopg://u:p@h/d"),
        ("postgresql+psycopg://u:p@h/d", "postgresql+psycopg://u:p@h/d"),
    ],
)
def test_points_plain_postgres_urls_at_psycopg(url: str, expected: str) -> None:
    assert sqlalchemy_url(url) == expected
