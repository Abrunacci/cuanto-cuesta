# Contributing

These are the conventions for code and reviews in this repo. They are settled; a PR that changes
one should say so in its description.

The app is built in small steps that each work end to end:

1. A calculator that runs in the browser (`frontend/`). Everything is entered by hand, except the
   fee defaults, which ship with the page.
2. The day's prices are fetched by a separate data pipeline (another repository), which sends
   them to this backend's `POST /api/ingest`; the backend keeps the current one per rate and
   serves them at `GET /api/rates`. This repository owns that contract (`backend/README.md`).
3. The calculator preloads those prices, marking the ones that may be old.

All three are done. The calculation lives only in `frontend/src/calculator/`. The fees stay
hand-researched in `backend/config/fees.yaml` with the frontend's copy; the backend does not
serve them.

## Before a PR

From `backend/`, with PostgreSQL running and the variables of `.env` in the shell (README,
"Running it locally"), so the integration tests run instead of being skipped:

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

- `domain/`: money, percentages, fees and quotes (with how a newly observed quote relates to the
  current one). It uses the standard library only (an import test enforces this) and does no I/O.
- `application/`: use cases and catalogs: the fee catalog and its caps, the rate catalog, and
  ingesting and reading quotes. It defines `Protocol`s only for things that vary at runtime
  (`QuoteStore`).
- `infrastructure/`: implements those protocols (`SqlQuoteStore`, over Postgres), loads
  `fees.yaml` and `rates.yaml` into their catalogs, and reads settings from the environment.
- `api/`: FastAPI. It translates HTTP (`wire.py`: the contract's JSON in and out) and is the
  composition root: `create_app` and its `lifespan` are the only code outside `infrastructure/`
  that imports it.

Dependencies point inwards: `application → domain` and `infrastructure → application, domain`;
`api` may import all three, and nothing imports `api` (a test enforces both). There are no
module-level instances or singletons: the DB engine and the rate catalog live in the FastAPI
`lifespan` and are injected with `Depends`, and uvicorn builds the app with `--factory`.

## Postgres

- SQLAlchemy Core with psycopg 3, no ORM. `infrastructure/db.py` describes the tables; Alembic
  migrations in `backend/migrations/` create them. Write each migration by hand and keep it
  working with the previous release: infra runs it before switching containers, and a release
  that fails its health check is rolled back while the schema stays migrated. Add before
  removing.
- Two roles, as infra creates them: the owner (`MIGRATION_DATABASE_URL`) runs the migrations,
  and the app connects as a role that owns nothing (`DATABASE_URL`, named in `APP_DB_USER`).
  The first migration grants that role `SELECT, INSERT, UPDATE` on every table, present and
  future; nothing grants it `DELETE` or schema changes. With a single role, `DATABASE_URL` runs
  the migrations too.
- A request is one transaction. Ingests take a transaction-level advisory lock, so each one
  compares with what the previous one stored.
- Local and CI run the production version, `postgres:17.11-trixie`.

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
- The calculator bundles its own copy of the fee defaults (`src/calculator/data/fees.ts`, with
  their Spanish labels and notes in `src/i18n/es.ts`). `tests/config-parity.test.ts` keeps it
  identical to `backend/config/fees.yaml`: change both together. The routes are defined only in
  `src/calculator/data/routes.ts`.
- Test the calculation with unit tests and the screen with Testing Library, through what the
  person sees and does (labels, roles, text), not component internals.
- The page must work on a phone: mobile-first layout, real `<label>`s, keyboard and screen-reader
  friendly, and inputs that open the numeric keyboard.

## Money

- Use `Decimal` everywhere in Python and a decimal type (big.js) in TypeScript, never floats.
  JSON is parsed with `parse_float=Decimal`, and the API sends amounts as decimal strings.
- All rounding of calculated amounts lives in the calculator's `src/calculator/money.ts`. Amounts
  credited to the user (each conversion and each step output) round **down** to the minor unit,
  and fees round **up**. Only display code rounds anything else. The backend only holds and
  validates amounts; it does no arithmetic.
- The TypeScript calculation was checked to land on the same cent as the Python domain it
  replaced, for the inputs it accepts: positive prices up to 1,000,000 with up to 8 decimals, and
  amounts in whole cents up to 10 million, checked once in `src/calculator/inputs.ts`. `money.ts`
  uses its own big.js constructor and only `money()` builds a `Money`: `+`, `-` and `*` are
  exact, and division keeps 30 decimal places rounding half-even (Python kept 34 significant
  digits). The calculator's tests keep the removed Python domain's hand-checked cases, a frozen
  table of results computed with it, and a division case.
- In the calculator, amounts are built only with `money()`, which keeps every division at its 30
  places; prices and percentages are parsed with `money.ts`'s `Decimal`, never from floats.
  `subtract` checks the currency. A product or quotient (`rates.ts`, `fees.ts`) is rounded
  right away with `roundedDown` or `roundedUp`.
- In Python `Money` is non-negative by construction: every amount the backend holds is a fee, so
  a negative one cannot be built. In the calculator `Money` does not check the sign, but no amount
  it reports is negative: fees refuse a negative value when they are built (`fees.ts`), a step
  whose fees exceed its amount is set to zero and marked as exhausted, the gaps between routes
  are taken from the best one, and `feeCost` takes the real result from the fee-free one, which
  is never smaller.

## Language

- Code, comments, commits, PR descriptions and the README are in English.
- The page is in Spanish by default and in English too. Every text shown on screen lives in one
  file per language, `frontend/src/i18n/es.ts` and `en.ts`, both with the `Texts` shape of
  `texts.ts`, so the build fails when a language misses a text. Routes, steps, prices and fees are
  data with ids; their names, labels, notes and warnings are in those files, by id, and
  `i18n.test.ts` checks both name every one. No i18n library: `textsFor(language)` picks the file
  and components read it with `useTexts()`.
- Add a text to `texts.ts` and to both languages in the same change. A text that depends on values
  is a function that takes them already formatted (`t.numbers` formats numbers and money in the
  page's language). Proper names (Payoneer, Binance, Bitso, ARQ, MEP) and the product's name stay
  as they are; the content is about Argentina in both languages.
- Fee labels and notes in `fees.yaml` are in Spanish, as `es.ts` shows them. The API returns error
  codes, not sentences, and the frontend writes the message.

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

- The researched defaults live in `backend/config/fees.yaml`, versioned in git, and the frontend
  bundles them. They are researched by hand; the backend does not ingest or serve them.
- Every fee in `fees.yaml` has `source_url`, `verified_at` and
  `status: verified | pending | user_defined`. These are metadata for the app, not fields of the
  domain types.
- Never invent a value. An unconfirmed value is `pending` and the app shows it as an estimate. A
  value no source can give is `user_defined`: the user sets it, its default is the neutral value
  (0), `source_url` points at the reference price it applies to, and `verified_at` is when that
  reference was checked.
- For an "up to X" fee, X is the default, the fee is `pending` and it sets `upper_bound: true`;
  only pending fees can.
- A value observed on the operation's own screen, before confirming it (for example Binance's
  final payment screen), is `verified`: `source_url` is the provider's page on that fee,
  `verified_at` is the date of the observation, and the note says what was seen and with which
  amounts. An observation has a date: when a newer one contradicts it, the value is reviewed.
- Users can edit every fee. Edited values are validated before they are used: the value must be
  finite, non-negative and at most the caps (`src/calculator/limits.ts`; the defaults are checked
  against the same caps in `application/limits.py`).
- Every route is always shown, whatever the fees; none is hidden or filtered out. A route with an
  empty field is not computed and says what is missing: an empty field is never read as 0.
- Routes are data (ordered steps with their fees and rates), not special-case code, declared in
  one TypeScript data module (`src/calculator/data/routes.ts`). A route whose data is wrong is
  shown as not computable, and the others are still compared.

## Rates

- The five rates the calculator asks for live in `backend/config/rates.yaml`: each key's currency
  pair, the range its price can plausibly be in, how far it may jump between readings
  (`max_jump`) and whether it carries `estimated_final`. The
  backend rejects an ingested price outside that range; the calculator warns about a typed one
  with the same ranges (`src/form/plausible.ts`), and `tests/config-parity.test.ts` keeps the two
  equal.
- The backend never computes with a quote: it validates it, compares it with the current one to
  hold a jump until later readings confirm it (`backend/README.md`, "Jumps"), and stores it. The API returns quotes as
  decimal strings with their `observed_at`; deciding whether one is fresh is the calculator's.

## Deploy

- `.github/workflows/deploy.yml` runs after CI passes on `main`: it publishes the backend image
  (`backend/Dockerfile`) to GHCR, deploys it by digest, then ships the static files that
  `npm run build` writes to `frontend/dist/` to https://cuanto-cuesta.abrunacci.dev (see README →
  Deploying). The site is served from the root of its own subdomain, so asset paths are absolute
  (`base: "/"`).
- The image runs one uvicorn process on port 8000, as a non-root user; infra's proxy sends
  `/api/*` to it, except `/api/ingest`, which is only reachable on the internal network.

## Tests

- New behaviour ships with tests.
- Domain tests are unit tests with fixed inputs and hand-checked expected values. When the
  arithmetic is not obvious, show it in a comment.
- Cover the edges of the change: zero, bounds, rounding and invalid input.
- Integration tests (`backend/tests/integration`) run the API against a real Postgres, in a
  database of their own, migrated as the owner and used as the app's role, so a missing grant
  fails there. They skip locally without the database variables and fail in CI.
- Test behaviour, not implementation. A test that would still pass with the code wrong is a bug.

## Git

- Use one branch and one PR per change (`feat/…`, `fix/…`, `refactor/…`, `chore/…`), branched
  from `main`.
- Keep commits small, with an imperative subject that says what changed.
- Review your own diff against `main` (`git diff main...HEAD`) before opening a PR.
- Commits have a single author and no `Co-Authored-By` trailers.
  CI enforces it with the **Check commit metadata** step (an action from the infra repository,
  pinned to a commit): every commit of a pull request must be authored by the maintainer, with no
  co-author or attribution line. Commits made with GitHub's "Update branch" button pass too.
