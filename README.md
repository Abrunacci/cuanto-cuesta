# cuanto-cuesta

Compare how many Argentine pesos you keep when moving USD from Payoneer to an Argentine bank account, route by route.

Work in progress.

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
