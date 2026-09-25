# cuanto-cuesta

Compare how many Argentine pesos reach your bank when you move USD out of Payoneer, route by route:

- **Binance P2P + Bitso:** sell USD for USDT on Binance P2P, send the USDT to Bitso over Polygon,
  sell them for pesos and withdraw to the bank.
- **ARQ (ex DolarApp):** withdraw from Payoneer to ARQ over ACH (credited as USDc), sell the USDc
  for pesos and withdraw to the bank.
- **Dólar MEP:** withdraw to an Argentine USD account, then buy AL30D and sell AL30 through a
  broker.

For each route the calculator shows the pesos that reach the bank, what the fees cost in pesos,
and the loss against the MEP dollar. The screen is in Spanish.

## Status

Stage 1: a calculator that runs entirely in the browser, with no backend.

- The person types the amount and the day's prices. Prices start empty on every visit, because an
  old price misleads.
- Every fee comes prefilled and can be edited. Most start at a researched value (some are
  estimates or upper bounds), with its source and the date it was checked. The P2P premium starts
  at 0, because only the person knows what they pay over the P2P price. A fee the person edits is
  marked as their own and can go back to its reference value.
- The amount and the fees the person set are remembered in the browser (`localStorage`).
  "Restablecer valores de referencia" puts every fee back to its reference value.
- Money never goes through floating point: amounts are decimals (`big.js`) with the same rounding
  as the Python domain.

The Python backend in `backend/` holds the fee data (`backend/config/fees.yaml`) and the domain
the calculator was checked against. An API comes in a later stage.

## Running it locally

You need Node (see `frontend/.nvmrc`) and, for the backend, [uv](https://docs.astral.sh/uv/).

### The calculator

```sh
cd frontend
npm install
npm run dev       # http://localhost:5173
```

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

```sh
cd backend
uv sync
uv run pytest
uv run mypy
uv run ruff check . && uv run ruff format --check .
```

## Deploying

The frontend is published to <https://cuanto-cuesta.abrunacci.dev> by the [Deploy workflow](.github/workflows/deploy.yml). The server side (the restricted deploy key, `deploy.sh`, releases and rollback) lives in the infra repository: see "Deploying a project" in its `ansible/README.md`.

**Before the workflow first reaches `main`**, the repository needs the `production` environment exactly as that section describes: required reviewers, deployments from `main` only, and the `DEPLOY_SSH_KEY` and `DEPLOY_KNOWN_HOSTS` secrets. A job that names a missing environment makes GitHub create it without any protection.

1. **A push to `main`** (a merged pull request) starts the workflow. It can also be started by hand: **Actions → Deploy → Run workflow**, on `main`.
2. **Check and build** runs the same frontend checks as CI (`npm run check`: typecheck, lint, format, tests) and `npm run build`. If anything fails, nothing is deployed.
3. **Deploy to production** waits for approval: the `production` environment requires a reviewer. The run shows **Review deployments**; approve it there, or reject it to skip this deploy. Only `main` can use the environment and its secrets. Deploys run one at a time, and a run waiting for approval holds the queue: reject the ones you will not approve. The build is kept for 7 days, so an approval can come later than the push; within those days, **Re-run failed jobs** can retry just the deploy.
4. **The deploy** sends `frontend/dist` to the server over SSH, checking the server's host key against the pinned `known_hosts` line. The server checks the archive and switches to the new release atomically; if it rejects the upload, the job fails and what was published stays published.
5. **The published site is checked**: the job fails unless the site serves exactly this build's files: its `index.html` and the assets it loads.

Each release on the server is named after its UTC time and commit (`20260925T141500Z-3f9c2ab1d4e0`), and the job's log shows it (`Deployed cuanto-cuesta release …`).

### Going back

- **Redeploy an earlier commit from GitHub.** Open that commit's run under **Actions → Deploy**, choose **Re-run all jobs**, and approve the deploy. It rebuilds that commit and publishes it as a new release. GitHub keeps runs re-runnable for 30 days; for an older commit, revert to it in a pull request instead.
- **Switch back on the server, without rebuilding.** The server keeps the last releases, and the admin can publish an earlier one with `site-rollback`, instantly and without a CI run. See the deploy notes in the [infra repository's README](https://github.com/Abrunacci/infra/blob/main/ansible/README.md#design-notes). The next deploy publishes its own release as usual, so fix `main` (or reject that deploy) before the next push if the problem is in the code.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
