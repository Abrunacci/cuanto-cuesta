# cuanto-cuesta

Compare how many Argentine pesos reach your bank when you move USD out of Payoneer, route by route:

- **Binance with a card + Bitso:** buy USDT on Binance with the Payoneer card, send them to Bitso
  over Polygon, sell them for pesos and withdraw to the bank. The price to type is the one on
  Binance's final payment screen.
- **Binance P2P + Bitso:** sell USD for USDT on Binance P2P, send the USDT to Bitso over Polygon,
  sell them for pesos and withdraw to the bank. Paying a P2P order with Payoneer can get the
  Binance account blocked, so this route is marked as risky.
- **ARQ (ex DolarApp):** withdraw from Payoneer to ARQ over ACH (credited as USDc), sell the USDc
  for pesos and withdraw to the bank.
- **Dólar MEP:** withdraw to an Argentine USD account, then buy AL30D and sell AL30 through a
  broker.

For each route the calculator shows the pesos that reach the bank, what the fees cost in pesos,
and how much more or less it leaves than the other routes. A risky route is never recommended:
the best route is the best one without risk, compared with the runner-up without risk, and every
other route is compared with it; a risky route that leaves more says how much more. When every
route computed is risky, none is recommended and they are compared with the one that leaves most.
The list starts with the best route and puts the risky routes after every route without risk, so
its first route is always the one recommended.
Each route needs only the prices it converts with, so the MEP price is needed only for the MEP
route. The screen is in Spanish, or in English when the browser is (or with `?lang=en`); an ES/EN
selector changes it and is remembered, and numbers are read and written in each language's format.

## Status

Online at <https://cuanto-cuesta.abrunacci.dev>.

A calculator that runs entirely in the browser; it never waits for the backend.

- The person types the amount. The day's prices come prefilled with the latest ones the backend
  has (`GET /api/rates`), and the person can change them. Under a price that may be old there is a
  warning with its age; under a fresh one, nothing. A price that arrives never replaces what the
  person typed, and if the backend does not answer the fields stay empty, as before.
- A reading that jumped too far from the current price is held by the backend until the next two
  readings confirm it. Meanwhile the field keeps the current price, with a warning that the
  latest reading was very different and is not used.
- Freshness: a crypto price is fresh for 30 minutes. The MEP is too during market hours (Monday
  to Friday, 10:45 to 17:00 in Buenos Aires, no holidays, as data-pipeline observed it); outside them, the value read at
  the last close stands until the market opens. Ages use the backend's clock (`server_time`).
- The card price is never prefilled: while its field is empty, its route is computed with the
  estimated final price (`estimated_final`) and marked "Precio estimado".
- Every fee comes prefilled and can be edited. Most start at a researched value (some are
  estimates or upper bounds), with its source and the date it was checked. The P2P premium starts
  at 0, because only the person knows what they pay over the P2P price. A fee the person edits is
  marked as their own and can go back to its reference value.
- The amount and the fees the person set are remembered in the browser (`localStorage`).
  "Restablecer valores de referencia" puts every fee back to its reference value.
- Money never goes through floating point: amounts are decimals (`big.js`). Fees round up and
  what is credited rounds down, to the cent.

The Python backend in `backend/` holds the researched fee data (`backend/config/fees.yaml`) and
an API (FastAPI and PostgreSQL) that stores the day's prices: a separate data pipeline sends them
to `POST /api/ingest`, and `GET /api/rates` returns the current one for each rate, which the
calculator prefills. The calculation itself lives only in the frontend. The API contract is in [backend/README.md](backend/README.md).

## Running it locally

You need Node (see `frontend/.nvmrc`) and, for the backend, [uv](https://docs.astral.sh/uv/).

### The calculator

```sh
cd frontend
npm install
npm run dev       # http://localhost:5173
```

The dev server forwards `/api` to the backend on `localhost:8000`. Without the backend running,
the price fields simply start empty.

Other commands, from `frontend/`:

```sh
npm test          # the tests, once
npm run check     # typecheck, lint, format check and tests
npm run build     # static files in frontend/dist/
npm run preview   # serves the build at http://localhost:4173
```

The build uses absolute paths from the site root (`base: "/"` in `frontend/vite.config.ts`),
because the site is served from the root of its own subdomain: see [Deploying](#deploying).

### The backend

You also need Docker, for PostgreSQL (`compose.yaml` runs only the database, the same version as
production). The first time, from the repository root:

```sh
cp .env.example .env      # local passwords and ingest token; change them
docker compose up -d --wait
```

Then, from `backend/`, with the variables of `.env` in the shell:

```sh
cd backend
uv sync
set -a; . ../.env; set +a
uv run alembic upgrade head     # as the owner (MIGRATION_DATABASE_URL)
uv run uvicorn cuanto_cuesta.api.app:create_app --factory --reload   # http://localhost:8000
```

The checks, which CI also runs. With the variables of `.env` in the shell, the integration tests
run against the local PostgreSQL in a database of their own (`cuanto_cuesta_test`); without them
they are skipped:

```sh
uv run pytest
uv run mypy
uv run ruff check . && uv run ruff format --check .
```

To send prices by hand, the way the data pipeline does (in production `/api/ingest` is only
reachable on the server's internal network, so this is how to try it):

```sh
curl -s http://localhost:8000/api/ingest \
  -H "Authorization: Bearer $INGEST_TOKEN" -H 'Content-Type: application/json' \
  -d '{"batch_id": "'"$(python3 -c 'import uuid; print(uuid.uuid4())')"'",
       "rates": [{"key": "mep", "base": "USD", "quote": "ARS", "price": "1540.50",
                  "source": "manual", "source_url": null,
                  "observed_at": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}]}'
curl -s http://localhost:8000/api/rates
```

## Deploying

The [Deploy workflow](.github/workflows/deploy.yml) publishes the backend image to
`ghcr.io/abrunacci/cuanto-cuesta-backend` and deploys it, then the site, to
<https://cuanto-cuesta.abrunacci.dev>. The server side (the restricted deploy key, `deploy.sh`
and `deploy-backend`, releases and rollback) lives in the infra repository: see "Deploying a
project" and "Deploying a backend" in its `ansible/README.md`.

**Before the workflow first reaches `main`**, the repository needs the `production` environment
exactly as that section describes: required reviewers, deployments from `main` only, and the
`DEPLOY_SSH_KEY` and `DEPLOY_KNOWN_HOSTS` secrets. A job that names a missing environment makes
GitHub create it without any protection.

1. **CI passes on `main`** (a merged pull request) and the workflow starts, for the commit CI
   tested. It can also be started by hand: **Actions → Deploy → Run workflow**, on `main`, to
   redeploy `main` without a merge.
2. **Build the site** runs `npm run build` (CI already ran every check on that commit), and
   **Publish the backend image** builds `backend/Dockerfile` and pushes it, tagged with the commit,
   and every version stays in GHCR. If either fails, nothing is deployed.
3. **Deploy to production** waits for approval: the `production` environment requires a reviewer.
   The run shows **Review deployments**; approve it there, or reject it to skip this deploy. Only
   `main` can use the environment and its secrets. Deploys run one at a time, and a run waiting
   for approval holds the queue: reject the ones you will not approve. The build is kept for 7
   days, so an approval can come later than the push; within those days, **Re-run failed jobs**
   can retry just the deploy.
4. **The backend** is deployed by digest, only while the repository variable `DEPLOY_BACKEND` is
   `true` (**Settings → Secrets and variables → Actions → Variables**); until infra runs the
   backend, leave it unset and the site deploys alone. The server dumps the database, runs
   `alembic upgrade head` as the database owner, switches the container and puts the previous one
   back if `/api/health` does not answer; a failed backend deploy stops the job before the site.
5. **The site** goes to the server over SSH, checking the server's host key against the pinned
   `known_hosts` line. The server checks the archive and switches to the new release atomically;
   if it rejects the upload, the job fails and what was published stays published.
6. **The published site is checked**: the job fails unless the site serves exactly this build's
   files: its `index.html` and the assets it loads. With the backend deployed, it also checks that
   `/api/health` answers and that `/api/ingest` does not answer from the public proxy.

The backend reads `DATABASE_URL` and `INGEST_TOKEN` (and `INGEST_TOKEN_NEXT` while rotating the
token); the migrations read `MIGRATION_DATABASE_URL` and `APP_DB_USER`. Infra generates them all
on the server; none of them is in this repository.

Each release on the server is named after its UTC time and commit
(`20260925T141500Z-3f9c2ab1d4e0`), and the job's log shows it
(`Deployed cuanto-cuesta release …`).

### Going back

- **Redeploy an earlier commit from GitHub.** Open that commit's run under **Actions → Deploy**,
  choose **Re-run all jobs**, and approve the deploy. It rebuilds that commit and publishes it as
  a new release. Migrations are never undone: an earlier backend runs on the migrated schema.
  GitHub keeps runs re-runnable for 30 days; for an older commit, revert to it in a pull request
  instead.
- **Switch back on the server, without rebuilding.** The server keeps the last releases, and the
  admin can publish an earlier one with `site-rollback`, instantly and without a CI run. See the
  deploy notes in the
  [infra repository's README](https://github.com/Abrunacci/infra/blob/main/ansible/README.md#design-notes).
  The backend's equivalent is `backend-rollback`, also for the admin. The next deploy publishes
  its own release as usual, so fix `main` (or reject that deploy) before the next push if the
  problem is in the code.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
