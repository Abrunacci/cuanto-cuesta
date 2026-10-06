"""The three routes end to end: HTTP in, Postgres underneath, connected as the app's role."""

from __future__ import annotations

import json
from datetime import timedelta
from typing import Any

import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient

from cuanto_cuesta.api.app import MAX_BODY_BYTES

from .conftest import TOKEN, Clock

BATCH = "0b8e6a3c-5d1f-4c1e-9a77-2f0c8f3e1b20"
AUTH = {"Authorization": f"Bearer {TOKEN}"}

BITSO: dict[str, Any] = {
    "key": "bitso_usdt_ars",
    "base": "USDT",
    "quote": "ARS",
    "price": "1452.30",
    "source": "bitso_api",
    "source_url": "https://bitso.com/ar",
    "observed_at": "2026-10-01T14:58:00Z",
}
CARD: dict[str, Any] = {
    "key": "binance_card_usd_usdt",
    "base": "USD",
    "quote": "USDT",
    "price": "0.9850",
    "estimated_final": "0.9712",
    "source": "binance_web",
    "source_url": None,
    "observed_at": "2026-10-01T11:58:00-03:00",
}


def send(client: TestClient, *items: object, **headers: str) -> Any:
    response = client.post(
        "/api/ingest", json={"batch_id": BATCH, "rates": list(items)}, headers=AUTH | headers
    )
    assert response.status_code == 200, response.text
    return response.json()


def held(owner: sa.Engine) -> tuple[str, str | None, int | None]:
    """Bitso's current price, its held price and the held one's confirmations."""
    with owner.connect() as connection:
        price, held_price, confirmations = connection.execute(
            sa.text("SELECT price, held_price, held_confirmations FROM rate_quote")
        ).one()
    return str(price), None if held_price is None else str(held_price), confirmations


class TestIngest:
    def test_stores_each_item_and_says_how_it_went(self, client: TestClient) -> None:
        assert send(client, BITSO, CARD | {"price": "9"}) == {
            "batch_id": BATCH,
            "results": [
                {"index": 0, "key": "bitso_usdt_ars", "status": "stored"},
                {
                    "index": 1,
                    "key": "binance_card_usd_usdt",
                    "status": "rejected",
                    "error": "out_of_range",
                },
            ],
        }

    def test_keeps_one_row_per_rate_with_the_newest_value(
        self, client: TestClient, owner: sa.Engine
    ) -> None:
        send(client, BITSO)
        send(client, BITSO | {"price": "1460", "observed_at": "2026-10-01T14:59:00Z"})
        older = send(client, BITSO | {"price": "1400", "observed_at": "2026-10-01T14:00:00Z"})
        assert older["results"][0]["status"] == "older"
        with owner.connect() as connection:
            rows = connection.execute(sa.text("SELECT key, price FROM rate_quote")).all()
        assert [(key, str(price)) for key, price in rows] == [("bitso_usdt_ars", "1460")]

    def test_the_same_quote_again_is_unchanged(self, client: TestClient) -> None:
        send(client, BITSO)
        again = send(client, BITSO | {"price": "1452.3"})
        assert again["results"][0]["status"] == "unchanged"

    def test_a_different_value_for_the_same_time_is_a_conflict(self, client: TestClient) -> None:
        send(client, BITSO)
        conflict = send(client, BITSO | {"price": "1452.31"})
        assert conflict["results"][0] == {
            "index": 0,
            "key": "bitso_usdt_ars",
            "status": "rejected",
            "error": "conflict",
        }

    def test_a_malformed_item_is_rejected_alone(self, client: TestClient) -> None:
        results = send(client, BITSO | {"price": 1452.3}, "not an item", CARD)["results"]
        assert results == [
            {"index": 0, "key": "bitso_usdt_ars", "status": "rejected", "error": "invalid_item"},
            {"index": 1, "key": None, "status": "rejected", "error": "invalid_item"},
            {"index": 2, "key": "binance_card_usd_usdt", "status": "stored"},
        ]

    def test_rejects_an_observation_too_far_in_the_future(
        self, client: TestClient, clock: Clock
    ) -> None:
        ahead = (clock.now + timedelta(minutes=6)).isoformat()
        result = send(client, BITSO | {"observed_at": ahead})["results"][0]
        assert result["error"] == "future_observed_at"

    @pytest.mark.parametrize(
        "authorization",
        [None, "", f"Basic {TOKEN}", f"Bearer {TOKEN}x", f"Bearer {TOKEN[:-1]}", "Bearer "],
    )
    def test_refuses_a_request_without_a_valid_token(
        self, client: TestClient, owner: sa.Engine, authorization: str | None
    ) -> None:
        headers = {} if authorization is None else {"Authorization": authorization}
        response = client.post(
            "/api/ingest", json={"batch_id": BATCH, "rates": [BITSO]}, headers=headers
        )
        assert response.status_code == 401
        assert response.json() == {"error": "unauthorized"}
        assert response.headers["www-authenticate"] == "Bearer"
        with owner.connect() as connection:
            assert connection.execute(sa.text("SELECT count(*) FROM rate_quote")).scalar() == 0

    def test_the_token_is_checked_before_the_body(self, client: TestClient) -> None:
        response = client.post("/api/ingest", content=b"{not json")
        assert response.status_code == 401

    @pytest.mark.parametrize("body", [b"{not json", b'{"batch_id": "x"', b"\xff\xfe"])
    def test_refuses_malformed_json(self, client: TestClient, body: bytes) -> None:
        response = client.post("/api/ingest", content=body, headers=AUTH)
        assert (response.status_code, response.json()) == (400, {"error": "malformed_json"})

    @pytest.mark.parametrize(
        "data",
        [
            {"rates": [BITSO]},
            {"batch_id": BATCH},
            {"batch_id": "nope", "rates": [BITSO]},
            {"batch_id": BATCH, "rates": [BITSO], "fees": []},
            {"batch_id": BATCH, "rates": [BITSO] * 21},
        ],
    )
    def test_refuses_an_invalid_envelope(self, client: TestClient, data: dict[str, Any]) -> None:
        response = client.post("/api/ingest", json=data, headers=AUTH)
        assert (response.status_code, response.json()) == (422, {"error": "invalid_envelope"})

    def test_refuses_a_body_over_the_limit(self, client: TestClient) -> None:
        padding = "x" * MAX_BODY_BYTES
        body = json.dumps({"batch_id": BATCH, "rates": [], "padding": padding}).encode()
        response = client.post("/api/ingest", content=body, headers=AUTH)
        assert (response.status_code, response.json()) == (413, {"error": "too_large"})

    def test_refuses_an_oversized_body_whatever_its_declared_length(
        self, client: TestClient
    ) -> None:
        def chunks() -> Any:
            yield b'{"batch_id": "' + BATCH.encode() + b'", "rates": [], "p": "'
            for _ in range(MAX_BODY_BYTES // 1024 + 1):
                yield b"x" * 1024
            yield b'"}'

        response = client.post("/api/ingest", content=chunks(), headers=AUTH)
        assert response.status_code == 413

    def test_a_jump_is_held_until_the_next_two_readings_confirm_it(
        self, client: TestClient, owner: sa.Engine, caplog: pytest.LogCaptureFixture
    ) -> None:
        send(client, BITSO)  # 1452.30 at 14:58; Bitso may move 10 %

        def at(time: str, price: str) -> Any:
            item = BITSO | {"price": price, "observed_at": f"2026-10-01T{time}:00Z"}
            [result] = send(client, item)["results"]
            return result

        jump = {"index": 0, "key": "bitso_usdt_ars", "status": "rejected", "error": "jump"}
        assert at("14:59", "1700") == jump
        assert at("14:59", "1700") == jump  # sent again: it counts once
        assert at("15:00", "1710") == jump
        assert held(owner) == ("1452.30", "1700", 1)
        assert "jump_confirmed" not in caplog.text

        assert at("15:01", "1690") == {"index": 0, "key": "bitso_usdt_ars", "status": "stored"}
        assert held(owner) == ("1690", None, None)
        assert "(bitso_usdt_ars) jump_confirmed: 1452.30 replaced by 1690" in caplog.text

    def test_a_jump_that_is_not_confirmed_is_discarded(
        self, client: TestClient, owner: sa.Engine
    ) -> None:
        send(client, BITSO)
        send(client, BITSO | {"price": "14523", "observed_at": "2026-10-01T14:59:00Z"})
        assert held(owner) == ("1452.30", "14523", 0)
        send(client, BITSO | {"price": "1453", "observed_at": "2026-10-01T15:00:00Z"})
        assert held(owner) == ("1453", None, None)

    def test_reading_is_not_ingesting(self, client: TestClient) -> None:
        assert client.get("/api/ingest", headers=AUTH).status_code == 405


class TestRates:
    def test_is_empty_before_anything_arrives(self, client: TestClient) -> None:
        response = client.get("/api/rates")
        assert response.json() == {"server_time": "2026-10-01T15:00:00Z", "rates": []}
        assert response.headers["cache-control"] == "no-store"

    def test_returns_the_current_quotes_in_the_calculator_order(self, client: TestClient) -> None:
        send(client, CARD, BITSO)
        assert client.get("/api/rates").json()["rates"] == [
            {
                "key": "bitso_usdt_ars",
                "base": "USDT",
                "quote": "ARS",
                "price": "1452.30",
                "source": "bitso_api",
                "source_url": "https://bitso.com/ar",
                "observed_at": "2026-10-01T14:58:00Z",
                "held": None,
            },
            {
                "key": "binance_card_usd_usdt",
                "base": "USD",
                "quote": "USDT",
                "price": "0.9850",
                "estimated_final": "0.9712",
                "source": "binance_web",
                "source_url": None,
                "observed_at": "2026-10-01T14:58:00Z",
                "held": None,
            },
        ]

    def test_a_held_reading_is_shown_next_to_the_current_price(self, client: TestClient) -> None:
        send(client, CARD)
        send(client, CARD | {"estimated_final": "0.5", "observed_at": "2026-10-01T14:59:00Z"})
        [card] = client.get("/api/rates").json()["rates"]
        assert (card["price"], card["estimated_final"]) == ("0.9850", "0.9712")
        assert card["held"] == {
            "price": "0.9850",
            "estimated_final": "0.5",
            "observed_at": "2026-10-01T14:59:00Z",
        }

    def test_a_null_card_estimate_is_returned_as_null(self, client: TestClient) -> None:
        send(client, CARD | {"estimated_final": None})
        [card] = client.get("/api/rates").json()["rates"]
        assert card["estimated_final"] is None

    def test_needs_no_token(self, client: TestClient) -> None:
        assert client.get("/api/rates").status_code == 200


class TestHealth:
    def test_is_ok_when_the_database_answers(self, client: TestClient) -> None:
        response = client.get("/api/health")
        assert (response.status_code, response.json()) == (200, {"status": "ok"})


class TestTheAppRole:
    def test_cannot_delete_or_change_the_schema(self, client: TestClient, database: Any) -> None:
        engine = sa.create_engine(database.app_url)
        try:
            for statement in ("DELETE FROM rate_quote", "DROP TABLE rate_quote"):
                with engine.begin() as connection, pytest.raises(sa.exc.ProgrammingError):
                    connection.execute(sa.text(statement))
        finally:
            engine.dispose()
