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
- Every fee comes prefilled with a researched value, its source and the date it was checked, and
  can be edited. A fee the person edits is marked as their own.
- The amount and the fees the person set are remembered in the browser (`localStorage`).
  "Restablecer valores de referencia" puts every fee back to its researched value.
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

The build uses relative paths, so `frontend/dist/` can be served from any path by any static file
server.

### The backend

```sh
cd backend
uv sync
uv run pytest
uv run mypy
uv run ruff check . && uv run ruff format --check .
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
