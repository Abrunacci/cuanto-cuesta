# Deploying

How cuanto-cuesta runs on the server and how it gets there: what the deploy workflow does, what
the server expects from the backend container, the variables it receives, and what to look at
when something fails.

The server side lives in the [infra repository](https://github.com/Abrunacci/infra). Its
[`ansible/README.md`](https://github.com/Abrunacci/infra/blob/main/ansible/README.md) has the
details: "Deploying a project", "Deploying a backend", "Backend secrets", "Backend status and
rollbacks", "Backend logs" and "Status page and alerts". What belongs to this repository (the
workflow, the Dockerfile, the app) is decided here; what belongs to the server is decided there.
Anything that needs the server to change, such as a new variable, is a pull request in infra first.

## What runs where

|                          |                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| URL                      | <https://cuanto-cuesta.abrunacci.dev>                                                            |
| Site                     | The static files of `frontend/dist/` (a Vite build), served by the server's Caddy                |
| Backend                  | The container `ghcr.io/abrunacci/cuanto-cuesta-backend`, on port 8000                            |
| Routed to the backend    | `/api/*`; everything else is the site                                                            |
| Not public               | `/api/ingest` and `/api/ingest/*` answer 404 from the internet, although they are under `/api/*` |
| Health                   | `GET /api/health`; any 2xx is healthy                                                            |
| Database                 | The server's shared PostgreSQL 17, database `cuanto_cuesta`                                      |
| Memory                   | 256 MB, no swap                                                                                  |
| Who calls it from inside | data-pipeline, at `http://cuanto-cuesta-backend:8000/api/ingest`                                 |
| Entry in infra           | `projects.yml`, project `cuanto-cuesta`                                                          |

## The deploy workflow

[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) publishes the backend image and
deploys it, then the site.

**Before the workflow first reaches `main`**, the repository needs the `production` environment
as infra's "Deploying a project" describes: required reviewers, deployments from `main` only, and
two secrets, `DEPLOY_SSH_KEY` (the project's private deploy key) and `DEPLOY_KNOWN_HOSTS` (the
server's `known_hosts` line). A job that names a missing environment makes GitHub create it
without any protection.

1. **CI passes on `main`** (a merged pull request) and the workflow starts through `workflow_run`,
   for the commit CI tested, not the tip of `main`: if another merge landed in between, what is
   deployed is still what passed CI. It never runs for a pull request. It can also be started by
   hand: **Actions → Deploy → Run workflow**, on `main`, to redeploy `main` without a merge.
2. **Build the site** runs `npm run build` (CI already ran every check on that commit), and
   **Publish the backend image** builds `backend/Dockerfile` and pushes it. If either fails,
   nothing is deployed.
3. **Deploy to production** waits for approval: the `production` environment requires a reviewer.
   The run shows **Review deployments**; approve it there, or reject it to skip this deploy. Only
   `main` can use the environment and its secrets. Deploys run one at a time, and a run waiting
   for approval holds the queue: reject the ones you will not approve. The build is kept for 7
   days, so an approval can come later than the push; within those days, **Re-run failed jobs**
   can retry just the deploy.
4. **The backend** is deployed by digest, only while the repository variable `DEPLOY_BACKEND` is
   `true` (**Settings → Secrets and variables → Actions → Variables**). A failed backend deploy
   stops the job before the site is touched.
5. **The site** is deployed next.
6. **The published site is checked**: the job fails unless the site serves exactly this build's
   files, its `index.html` and the assets it loads. With the backend deployed, it also checks that
   `/api/health` answers and that `/api/ingest` does not answer from the public proxy (a 401 there
   would mean the proxy exposes it).

Both deploys go over SSH to `deploy@server.abrunacci.dev` with the deploy key and these options:
`IdentitiesOnly=yes`, `StrictHostKeyChecking=yes` against the pinned `known_hosts` line (never
`no`), `BatchMode=yes` and `ConnectTimeout=15`. On the server that key has a forced command: it
can only deploy `cuanto-cuesta`, with no shell and no forwarding. The key decides the project; the
workflow only chooses the commit and the digest.

### The image in GHCR

The **Publish the backend image** job logs in to `ghcr.io` with `GITHUB_TOKEN` (it has
`packages: write`) and pushes one `linux/amd64` manifest, without provenance or SBOM, tagged
`:<commit sha>` and `:latest`. What the deploy sends is the `digest` output of the
`docker/build-push-action` step (`sha256:` and 64 hex characters), never a tag: a tag moves. The
deploy job refuses to start without a digest of that shape.

The package is public, and every version stays in GHCR. The server keeps the images of its last
releases locally and rolls back with them, but a rollback after a cleanup, or a rebuilt server,
has to pull them again, so none is ever deleted. The admin lists the ones the server keeps with
`sudo backend-rollback cuanto-cuesta --list`.

## What the server does

### Backend

```sh
ssh deploy@server.abrunacci.dev deploy-backend "$SHA" "sha256:<digest>" "$GITHUB_RUN_ID" </dev/null
```

The image repository comes from `projects.yml`; the workflow only sends the digest, and the
server pulls `ghcr.io/abrunacci/cuanto-cuesta-backend@<digest>`. Before switching:

1. It dumps the `cuanto_cuesta` database, keeping the last 3 dumps.
2. It runs `alembic upgrade head` in a throwaway container of the new image, on the database
   network only (no internet), with `MIGRATION_DATABASE_URL` and `APP_DB_USER` and none of the
   app's secrets. If it fails or takes longer than 10 minutes, the deploy stops there and the
   running release is not touched.

Then it recreates the container with the new image and asks for `/api/health` from Caddy's
container for up to 60 seconds. Without a 2xx, it goes back to the previous release by itself and
the job fails. On success the log shows `Deployed backend cuanto-cuesta release <id> (<digest>)`.

### Site

```sh
tar -C dist -cz . | ssh deploy@server.abrunacci.dev deploy "$SHA" "$GITHUB_RUN_ID"
```

The server checks and extracts the archive as an unprivileged user, and only then switches the
published site, atomically. If anything fails, what was published stays published. On success
the log shows `Deployed cuanto-cuesta release <id>`.

The archive may hold only regular files and directories, with `index.html` at the root and no
hidden files except `.well-known/` at the root (the workflow uploads hidden files on purpose, so
the server rejects them loudly instead of the artifact dropping them). Limits: 25 MB compressed,
100 MB extracted, 5000 entries, 20 levels deep, 2 minutes to upload. Any path that is not a file
is served as `index.html`; `/assets/*` is cached for a year as immutable (Vite puts a hash in
those names), and everything else is revalidated on each visit.

Each release on the server is named after its UTC time and commit, such as
`20261002T130232Z-5e0ba54153e1`.

## Variables

None is set in this repository: the server gives them to the container. The list of names lives
in infra's `projects.yml`.

| Name                     | Kind                      | Value                                                                          |
| ------------------------ | ------------------------- | ------------------------------------------------------------------------------ |
| `INGEST_TOKEN`           | Secret, generated         | Random, created on the server. The Bearer data-pipeline sends to `/api/ingest` |
| `DATABASE_URL`           | Reserved                  | `postgresql+psycopg://cuanto_cuesta_app:…@postgres:5432/cuanto_cuesta`         |
| `MIGRATION_DATABASE_URL` | Reserved, migrations only | The same database, as `cuanto_cuesta`, its owner                               |
| `APP_DB_USER`            | Reserved, migrations only | `cuanto_cuesta_app`                                                            |

- The app reads `DATABASE_URL` and `INGEST_TOKEN` once at startup and refuses to start if one is
  missing or the token is shorter than 32 characters, with a message that names the variable and
  never its value (`backend/src/cuanto_cuesta/infrastructure/settings.py`). It accepts
  `postgresql://` and `postgresql+psycopg://` URLs.
- The migrations read `MIGRATION_DATABASE_URL` (or `DATABASE_URL` when it is not set) and grant
  the role named in `APP_DB_USER` what the app needs (`backend/migrations/env.py`).
- Secrets live in a root-only file on the server and never go through either repository. A
  changed value reaches the container on the next deploy, or at once with
  `sudo backend-rollback cuanto-cuesta --restart`. The deploy refuses to start if a declared
  secret is missing or one is loaded that `projects.yml` does not declare.
- `INGEST_TOKEN` has one source, the server. data-pipeline gets a copy that only infra writes.
  `sudo project-secret cuanto-cuesta rotate INGEST_TOKEN` changes it, updates the copy and
  restarts both backends together; a delivery during that restart can fail (401 or connection
  refused) and data-pipeline retries.
- **A new variable goes in this order**: first the pull request in infra (merged, applied, and
  with its value loaded if it is set by hand), then the deploy of the image that reads it.

## What the server expects from the container

| The server                                                                                                 | How the app meets it                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runs it as uid/gid 10005, whatever the image says. Never root                                              | The image already runs as a non-root user                                                                                                                                     |
| Read-only file system except `/tmp` (a tmpfs, lost on restart)                                             | Nothing is written: bytecode is compiled in the build, `PYTHONDONTWRITEBYTECODE=1`, logs go to stderr                                                                         |
| No capabilities, `no-new-privileges`, at most 256 processes                                                | One uvicorn process                                                                                                                                                           |
| Listens on `0.0.0.0:8000`, no published ports                                                              | `uvicorn … --host 0.0.0.0 --port 8000`                                                                                                                                        |
| `/api/ingest` is 404 through Caddy, but reachable directly from data-pipeline's network                    | It always requires `Authorization: Bearer <INGEST_TOKEN>`, compared in constant time, and answers `401 {"error": "unauthorized"}` before reading the body                     |
| No body limit on the internal network (Caddy's 10 MB is public only)                                       | `/api/ingest` refuses bodies over 64 KB (`413 too_large`) and batches over 20 items                                                                                           |
| The app connects as `cuanto_cuesta_app`, which owns nothing; migrations run as `cuanto_cuesta`             | The migrations grant the app's role what it needs                                                                                                                             |
| Migrations stay backward compatible: a failed release rolls back the image, not the schema                 | Add first, remove in a later release                                                                                                                                          |
| `/api/health` answers 2xx within 60 seconds of starting                                                    | It runs `SELECT 1`: `200 {"status": "ok"}`, or `503` when the database is unreachable, so a release that cannot log in is rolled back. Startup only loads `config/rates.yaml` |
| SIGTERM with a minimal init as PID 1, 20 seconds of grace; Caddy holds requests up to 15 s during a deploy | uvicorn shuts down on SIGTERM                                                                                                                                                 |
| Logs to stdout/stderr, into the journal with the tag `backend.cuanto-cuesta`                               | uvicorn's and the app's own lines (`cuanto_cuesta.ingest`, including `jump_confirmed`) go to stderr                                                                           |
| No Docker healthcheck for public backends: a hung process is not restarted                                 | Gatus notices it (below)                                                                                                                                                      |

Caddy also adds `Strict-Transport-Security` and `X-Content-Type-Options`, removes `Server`, and
sets `Referrer-Policy` and `Content-Security-Policy: frame-ancestors 'none'` as defaults the
backend could replace (it does not). It always rewrites `X-Forwarded-For` with the visitor's IP;
requests from data-pipeline do not go through Caddy.

Infra backs up `cuanto_cuesta` every night, encrypted, and each deploy leaves a dump on the server.

## When something fails

### In the deploy job

The message appears as is in the job's log.

| Message                                                                                     | What happened                                     | What to do                                                                         |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `DEPLOY_SSH_KEY or DEPLOY_KNOWN_HOSTS is missing in the production environment.`            | A secret is missing                               | Add it to the `production` environment                                             |
| `The publish job gave no image digest (…)`                                                  | The publish job did not produce a digest          | Look at **Publish the backend image**                                              |
| `Permission denied (publickey)`                                                             | The key is not the `deploy_key` in `projects.yml` | Check the secret; a new key is a pull request in infra                             |
| `Host key verification failed`                                                              | `DEPLOY_KNOWN_HOSTS` does not match the server    | Regenerate it as infra's guide says                                                |
| `deploy-backend: the backend's secrets are not ready: …`                                    | A secret is missing, or one is not declared       | Admin: `sudo project-secret cuanto-cuesta list`                                    |
| `deploy-backend: cannot pull …: unauthorized`                                               | The server cannot pull the image                  | The package must stay public                                                       |
| `deploy-backend: the migrations failed (exit N); …`                                         | `alembic upgrade head` failed                     | Admin: `sudo journalctl -t backend-migrate`; the message names the dump            |
| `deploy-backend: release … not healthy within 60s (…); back to release …, which is healthy` | The new release did not answer `/api/health`      | Admin: `sudo journalctl -t backend.cuanto-cuesta` (the app's log never goes to CI) |
| `… which is NOT healthy either`                                                             | The previous release is not healthy either        | Urgent. Admin: `sudo backend-status cuanto-cuesta`                                 |
| `another deploy, rollback or secret change of cuanto-cuesta is running`                     | Two deploys at once, or a rotation in progress    | Re-run the deploy                                                                  |
| `deploy: rejected: …`                                                                       | The site's archive failed the server's checks     | The reason is in the message                                                       |
| `… is not served as built.` / `… serves something other than this build's index.html.`      | The published site is not this build              | Look at the site and at the server's `deploy` journal                              |
| `…api/ingest answers from the public proxy; …`                                              | The proxy exposes `/api/ingest`                   | A change in infra                                                                  |

### Outside the deploy

- Gatus checks `https://cuanto-cuesta.abrunacci.dev/` (200), `/api/health` (2xx) and the
  certificate every minute. After 3 failures in a row it emails the admin, and again when it
  recovers. Public page: <https://status.abrunacci.dev>, group "¿Cuánto cuesta?".
- If the backend is down, data-pipeline cannot deliver prices: that shows in data-pipeline's logs,
  not in Gatus.
- On the server, for the admin: `sudo backend-status cuanto-cuesta`,
  `sudo journalctl -t backend.cuanto-cuesta --since -1h`, `sudo journalctl -t deploy-backend`
  and `sudo journalctl -t deploy`.

## Going back

- **Redeploy an earlier commit from GitHub.** Open that commit's run under **Actions → Deploy**,
  choose **Re-run all jobs**, and approve the deploy. It rebuilds that commit and publishes it as
  a new release. Migrations are never undone: an earlier backend runs on the migrated schema.
  GitHub keeps runs re-runnable for 30 days; for an older commit, revert to it in a pull request
  instead.
- **Switch back on the server, without rebuilding.** The server keeps the last releases, and the
  admin can publish an earlier one instantly and without a CI run: `sudo backend-rollback
cuanto-cuesta` for the backend, `sudo site-rollback cuanto-cuesta` for the site. The next deploy
  publishes its own release as usual, so fix `main` (or reject that deploy) before the next push
  if the problem is in the code.
