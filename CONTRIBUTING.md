# Contributing

These are the conventions for code and reviews in this repo. They are settled; a PR that changes
one should say so in its description.

Only `backend/src/cuanto_cuesta/domain/` exists so far. The other layers, the YAML config,
Alembic, the frontend and the Dockerfile come in later parts, and the rules below apply to each
one when it is added.

## Before a PR

From `backend/`:

```sh
uv run pytest
uv run mypy
uv run ruff check . && uv run ruff format --check .
```

All four checks must pass.

## Architecture

Layers under `backend/src/cuanto_cuesta/`:

- `domain/`: money, fees, rates, routes and the calculation. It uses the standard library only
  (an import test enforces this) and does no I/O.
- `application/`: use cases, the fee catalog and override validation. It defines `Protocol`s only
  for things that vary at runtime (`QuoteProvider`, `QuoteRepository`).
- `infrastructure/`: implements those protocols (HTTP quote providers, Postgres). It also loads the
  YAML config into the fee catalog and domain routes, and reads settings.
- `api/`: FastAPI. It translates HTTP and is the composition root: its `lifespan` and dependency
  wiring are the only code outside `infrastructure/` that imports it.

Dependencies point inwards: `application → domain` and `infrastructure → application, domain`;
`api` may import all three, and nothing imports `api`. There are no module-level instances or
singletons: the DB engine and the HTTP client live in the FastAPI `lifespan` and are injected
with `Depends`.

## Money

- Use `Decimal` everywhere, never `float`. JSON is parsed with `parse_float=Decimal`, and the API
  sends amounts as decimal strings.
- All rounding lives in `domain/money.py`. Amounts credited to the user (each conversion and each
  step output) round **down** to the minor unit, and fees round **up**. Nothing else rounds.
- Intermediate arithmetic goes through the `Money` operators or `money.mul`/`money.div`, which use
  a fixed decimal context (34 significant digits). Never multiply bare `Decimal`s in the domain.
- `Money` is signed on purpose, because `fx_loss` is negative when a route beats the reference.
  Where only `>= 0` makes sense, the type that owns the value calls `Money.require_non_negative`
  in its `__post_init__`.

## Types

- Make invalid states unrepresentable. Use separate types in a union (`FixedFee | PercentFee`),
  not a `kind` field or a flag checked at runtime. A `kind` discriminator is fine on the wire (a
  pydantic discriminated union) as long as it maps to separate types.
- Value rules live in small value types (`Money`, `Percentage`). They are validated once, in
  `__post_init__`, and callers do not repeat them.
- Branch on a union or an enum with `match`. mypy runs with `exhaustive-match`, so a missed case
  is a type error. Do not add a catch-all `case _` to silence it.
- `mypy --strict` and ruff must pass. A `type: ignore` or `noqa` always names the error code. It
  also needs a comment unless the reason is evident, e.g. a test that passes a wrong type on
  purpose.

## Fees

- Defaults live in `backend/config/fees.yaml`, versioned in git, never in the database.
- Every fee in `fees.yaml` has `source_url`, `verified_at` and `status: verified | pending`. These
  are metadata for the app, not fields of the domain types.
- Never invent a value. An unconfirmed value is `pending` and the app shows it as an estimate.
- For an "up to X" fee, X is the default and the fee sets `upper_bound: true`.
- Users can edit every fee. The application layer validates overrides before they reach the
  domain: the id must exist, the value must be non-negative, and it must be at most the caps in
  `application/limits.py`.
- Every route is always computed and shown, whatever the fees; none is hidden or filtered out.
- Routes are data in `backend/config/routes.yaml`. Adding a route must not need code.

## Deploy

- There is one production image, and FastAPI also serves the frontend build.
- Migrations run `alembic upgrade head`, as `docker compose run --rm migrate`.
- The image exposes `GET /health`.

## Tests

- New behaviour ships with tests.
- Domain tests are unit tests with fixed inputs and hand-checked expected values. When the
  arithmetic is not obvious, show it in a comment.
- Cover the edges of the change: zero, bounds, rounding and invalid input.
- Test quote providers against recorded responses in `backend/tests/providers/fixtures`, never
  against the network. Integration tests run against a real Postgres in Docker.
- Test behaviour, not implementation. A test that would still pass with the code wrong is a bug.

## Git

- Use one branch and one PR per change (`feat/…`, `fix/…`, `refactor/…`, `chore/…`), branched
  from `main`.
- Keep commits small, with an imperative subject that says what changed.
- Review your own diff against `main` (`git diff main...HEAD`) before opening a PR.
- Commits have a single author and no `Co-Authored-By` trailers.
