# Contributing

These are the conventions for code and reviews in this repo. They are settled; a PR that changes
one should say so in its description.

The app is built in three stages:

1. A calculator that runs in the browser (`frontend/`). Everything is entered by hand, except the
   fee defaults, which ship with the page. There is no backend.
2. Scheduled jobs that fetch fee defaults and the MEP rate.
3. Storing those values so the frontend can preload them.

Stage 1 is in progress. In `backend/` so far `domain/`, `application/`, the YAML config and its
loader in `infrastructure/` exist. They stay for stages 2 and 3; the rules below for the API and
Postgres apply when those parts are added. Until the calculator in `frontend/src/calculator/`
matches it, the Python calculation (`domain/`) is its parity reference; after that, whatever
stages 2 and 3 do not need is removed in a separate PR.

## Before a PR

From `backend/`:

```sh
uv run pytest
uv run mypy
uv run ruff check . && uv run ruff format --check .
```

From `frontend/`:

```sh
npm run check   # typecheck, lint, format check and tests
npm run build
```

All of them must pass; CI runs the same commands.

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

## Frontend

- `frontend/` is Vite, React and TypeScript with `strict`, `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`. No `any`, no non-null assertions (`!`), no casts to silence the
  compiler.
- Lint is ESLint with typescript-eslint `strict-type-checked` (type-aware), `jsx-a11y` (strict)
  and the React hooks rules; a `switch` over a union must be exhaustive. Prettier formats: ESLint
  has no formatting rules.
- The calculation (`src/calculator/`) is plain TypeScript with no React, so it can be tested on
  its own. Components render and collect input; they do not compute. In the calculation every
  condition is an explicit boolean (`strict-boolean-expressions`).
- The calculator bundles its own copy of the fee defaults and routes (`src/calculator/data/`).
  `tests/config-parity.test.ts` keeps it identical to `backend/config/fees.yaml` and
  `routes.yaml`: change both together.
- Test the calculation with unit tests and the screen with Testing Library, through what the
  person sees and does (labels, roles, text), not component internals.
- The page must work on a phone: mobile-first layout, real `<label>`s, keyboard and screen-reader
  friendly, and inputs that open the numeric keyboard.

## Money

- Use `Decimal` everywhere in Python and a decimal type (big.js) in TypeScript, never floats.
  JSON is parsed with `parse_float=Decimal`, and the API sends amounts as decimal strings.
- In Python all rounding lives in `domain/money.py`; in TypeScript it lives in one module that
  mirrors it. Amounts credited to the user (each conversion and each step output) round **down**
  to the minor unit, and fees round **up**. Nothing else rounds.
- The TypeScript calculation lands on the same cent as the Python domain. `money.ts` uses its own
  big.js constructor: `+`, `-` and `*` are exact, and division keeps 30 decimal places rounding
  half-even (Python keeps 34 significant digits). Its tests reproduce the domain's hand-checked
  cases, a table of results computed with the domain, and a division case.
- Intermediate arithmetic goes through the `Money` operators or `money.mul`/`money.div`, which use
  a fixed decimal context (34 significant digits). Never multiply bare `Decimal`s in the domain.
- `Money` is signed on purpose, because `fx_loss` is negative when a route beats the reference.
  Where only `>= 0` makes sense, the type that owns the value calls `Money.require_non_negative`
  in its `__post_init__`.

## Language

- Code, comments, commits, PR descriptions and the README are in English.
- Text shown on screen is in Spanish: fee labels and notes, route names, step labels and warnings
  in the YAML config, and the frontend copy. The API returns error codes, not sentences, and the
  frontend writes the message. Override problems in `application/overrides.py` are still English
  text; they become codes (`unknown_fee`, `no_minimum`, `negative`, `above_cap` with the cap as
  data) with the API.

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

- The researched defaults live in `backend/config/fees.yaml`, versioned in git; in stage 1 the
  frontend bundles them. Where the values fetched in stage 2 are stored is decided in that stage.
- Every fee in `fees.yaml` has `source_url`, `verified_at` and
  `status: verified | pending | user_defined`. These are metadata for the app, not fields of the
  domain types.
- Never invent a value. An unconfirmed value is `pending` and the app shows it as an estimate. A
  value no source can give is `user_defined`: the user sets it, its default is the neutral value
  (0), `source_url` points at the reference price it applies to, and `verified_at` is when that
  reference was checked.
- For an "up to X" fee, X is the default, the fee is `pending` and it sets `upper_bound: true`;
  only pending fees can.
- Users can edit every fee. Edited values are validated before they are used: the id must exist,
  and the value must be finite, non-negative and at most the caps (`application/limits.py` in
  Python, the same caps in the calculator).
- Every route is always shown, whatever the fees; none is hidden or filtered out. A route with an
  empty field is not computed and says what is missing: an empty field is never read as 0.
- Routes are data (ordered steps with their fees and rates), not special-case code. The backend
  declares them in `backend/config/routes.yaml`; in stage 1 the calculator declares them in one
  TypeScript data module.

## Deploy

- Stage 1 ships the static files that `npm run build` writes to `frontend/dist/`, with relative
  paths so they work from any path. How and where they are served is decided later, together with
  the deploy workflow of the infrastructure repo.

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
