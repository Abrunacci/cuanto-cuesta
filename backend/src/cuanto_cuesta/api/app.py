"""The FastAPI app and its composition root.

``create_app`` reads the settings and wires everything; its ``lifespan`` owns the database
engine and the rate catalog, which reach the routes through ``Depends``. Uvicorn calls it as a
factory (``--factory``), so importing this module builds nothing.
"""

from __future__ import annotations

import hmac
import json
import logging
import os
from collections import Counter
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated

import sqlalchemy as sa
from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from cuanto_cuesta.api.wire import parse_envelope, parse_item, quote_json, timestamp_text
from cuanto_cuesta.application import (
    CONFIRMATIONS,
    ItemResult,
    JumpEvent,
    RateCatalog,
    Status,
    current_quotes,
    ingest,
)
from cuanto_cuesta.domain import Quote
from cuanto_cuesta.infrastructure.config import load_rate_catalog
from cuanto_cuesta.infrastructure.db import SqlQuoteStore, create_engine
from cuanto_cuesta.infrastructure.settings import Settings

MAX_BODY_BYTES = 64 * 1024

log = logging.getLogger("cuanto_cuesta.ingest")

type Clock = Callable[[], datetime]


class ApiError(Exception):
    """Ends the request with ``{"error": code}``: a code the caller can act on, not a sentence."""

    def __init__(self, status: int, code: str, headers: dict[str, str] | None = None) -> None:
        super().__init__(code)
        self.status = status
        self.code = code
        self.headers = headers


def create_app(settings: Settings | None = None, clock: Clock | None = None) -> FastAPI:
    _log_to_stderr()
    settings = settings or Settings.from_env(os.environ)
    now = clock or (lambda: datetime.now(UTC))

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.catalog = load_rate_catalog(settings.config_dir / "rates.yaml")
        app.state.engine = create_engine(settings.database_url)
        try:
            yield
        finally:
            app.state.engine.dispose()

    # No docs pages: the API has three routes, documented in the README and CONTRIBUTING.md.
    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = settings
    app.state.clock = now

    @app.exception_handler(ApiError)
    async def api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse({"error": exc.code}, status_code=exc.status, headers=exc.headers)

    app.add_api_route("/api/health", health, methods=["GET"])
    app.add_api_route("/api/rates", rates, methods=["GET"])
    app.add_api_route(
        "/api/ingest", ingest_rates, methods=["POST"], dependencies=[Depends(require_token)]
    )
    return app


# --- Dependencies ------------------------------------------------------------------------------


def _engine(request: Request) -> sa.Engine:
    engine: sa.Engine = request.app.state.engine
    return engine


def _catalog(request: Request) -> RateCatalog:
    catalog: RateCatalog = request.app.state.catalog
    return catalog


def _clock(request: Request) -> Clock:
    clock: Clock = request.app.state.clock
    return clock


Engine = Annotated[sa.Engine, Depends(_engine)]
Catalog = Annotated[RateCatalog, Depends(_catalog)]
Now = Annotated[Clock, Depends(_clock)]


def require_token(request: Request) -> None:
    """``Authorization: Bearer <token>``, with ``INGEST_TOKEN``."""
    settings: Settings = request.app.state.settings
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token_matches(token.strip(), settings.ingest_token):
        raise ApiError(401, "unauthorized", headers={"WWW-Authenticate": "Bearer"})


def token_matches(given: str, accepted: str) -> bool:
    """Compared in constant time, so how long the comparison takes says nothing about the token."""
    return hmac.compare_digest(given.encode(), accepted.encode())


# --- Routes ------------------------------------------------------------------------------------


def health(engine: Engine) -> JSONResponse:
    """Up, and able to reach its database: a deploy whose app cannot log in is rolled back."""
    try:
        with engine.connect() as connection:
            connection.execute(sa.text("SELECT 1"))
    except sa.exc.SQLAlchemyError:
        logging.getLogger("cuanto_cuesta.health").exception("database unreachable")
        return JSONResponse({"status": "unavailable"}, status_code=503)
    return JSONResponse({"status": "ok"})


def rates(engine: Engine, catalog: Catalog, now: Now) -> JSONResponse:
    """The current quote of every rate that has one, and the server's time, so the calculator
    can tell how old each one is even if the person's clock is off."""
    with engine.connect() as connection:
        quotes = current_quotes(catalog, SqlQuoteStore(connection))
    return JSONResponse(
        {
            "server_time": timestamp_text(now()),
            "rates": [quote_json(spec, quote, held) for spec, quote, held in quotes],
        },
        headers={"Cache-Control": "no-store"},
    )


async def ingest_rates(
    request: Request, engine: Engine, catalog: Catalog, now: Now
) -> JSONResponse:
    body = await _read_body(request)
    try:
        data = json.loads(body, parse_float=Decimal)
    except ValueError:  # malformed JSON, or bytes that are not UTF-8
        raise ApiError(400, "malformed_json") from None
    envelope = parse_envelope(data)
    if envelope is None:
        raise ApiError(422, "invalid_envelope")
    batch_id, raw_items = envelope
    items = [parse_item(raw) for raw in raw_items]

    def store() -> list[ItemResult]:
        with engine.begin() as connection:
            return ingest(catalog, SqlQuoteStore(connection), batch_id, items, now())

    results = await run_in_threadpool(store)
    _log(batch_id, results)
    return JSONResponse(
        {
            "batch_id": str(batch_id),
            "results": [
                {"index": r.index, "key": r.key, "status": r.status}
                | ({} if r.error is None else {"error": r.error})
                for r in results
            ],
        }
    )


async def _read_body(request: Request) -> bytes:
    """The body, refused as soon as it passes the limit, whatever Content-Length claims."""
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > MAX_BODY_BYTES:
        raise ApiError(413, "too_large")
    body = bytearray()
    async for chunk in request.stream():
        body += chunk
        if len(body) > MAX_BODY_BYTES:
            raise ApiError(413, "too_large")
    return bytes(body)


def _log_to_stderr() -> None:
    """The app's own messages (each ingest, each rejected item) on stderr next to uvicorn's,
    which is where the server's journal picks them up. Uvicorn only configures its own loggers."""
    app_log = logging.getLogger("cuanto_cuesta")
    if not app_log.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(levelname)s:     %(name)s: %(message)s"))
        app_log.addHandler(handler)
        app_log.setLevel(logging.INFO)


def _log(batch_id: object, results: list[ItemResult]) -> None:
    counts = Counter(r.status.value for r in results)
    log.info("batch %s: %s", batch_id, dict(counts))
    for r in results:
        if r.status is Status.REJECTED:
            log.warning("batch %s: item %d (%s) rejected: %s", batch_id, r.index, r.key, r.error)
        _log_jump(batch_id, r)


_JUMP_LINES = {
    JumpEvent.HELD: "jump_held: current {current}, got {observed}; held until {needed} agree",
    JumpEvent.CONFIRMING: "jump_confirming: current {current}, held {held}, got {observed}"
    " ({confirmations} of {needed})",
    JumpEvent.CONFIRMED: "jump_confirmed: {current} replaced by {observed} after {confirmations}"
    " readings agreed with {held}",
    JumpEvent.DISCARDED: "jump_discarded: held {held} dropped, got {observed} near {current}",
}


def _log_jump(batch_id: object, r: ItemResult) -> None:
    """What a reading did to a held jump. ``jump_confirmed`` is the line infra alerts on: a jump
    that the next readings confirmed and that the calculator now shows."""
    if r.jump is None:
        return
    jump = r.jump
    line = _JUMP_LINES[jump.event].format(
        current=_prices(jump.current),
        held=_prices(jump.held),
        observed=_prices(jump.observed),
        confirmations=jump.confirmations,
        needed=CONFIRMATIONS,
    )
    level = logging.INFO if jump.event is JumpEvent.DISCARDED else logging.WARNING
    log.log(level, "batch %s: item %d (%s) %s", batch_id, r.index, r.key, line)


def _prices(quote: Quote) -> str:
    """``1452.30``, or ``0.9850 (estimate 0.9712)`` on the card, where the estimate may jump."""
    if quote.estimated_final is None:
        return str(quote.price)
    return f"{quote.price} (estimate {quote.estimated_final})"
