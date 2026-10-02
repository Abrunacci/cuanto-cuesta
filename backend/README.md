# cuanto-cuesta backend

The researched fee defaults (`config/fees.yaml`), the rates the calculator asks for
(`config/rates.yaml`), and an API that stores the day's prices. See `CONTRIBUTING.md` at the repo
root for the architecture and conventions, and the root `README.md` for running it.

Each rate has one current quote. A newer observation replaces it; an older one is ignored. There
is no history: data-pipeline keeps its own log of what it fetched.

## API

Three routes, all under `/api`. Amounts are decimal strings and errors are codes, never
sentences.

### `GET /api/health`

`200 {"status": "ok"}` when the app is up and can reach its database, `503
{"status": "unavailable"}` otherwise. The deploy rolls back a release that does not answer 200.

### `GET /api/rates`

Public, no token. The current quote of every rate that has one, in the calculator's order; a
rate with no quote yet is left out. `estimated_final` appears only on the card rate.
`server_time` lets the calculator tell how old each quote is even if the person's clock is off.

```json
{
  "server_time": "2026-10-01T15:02:10Z",
  "rates": [
    {
      "key": "binance_card_usd_usdt",
      "base": "USD",
      "quote": "USDT",
      "price": "0.9850",
      "estimated_final": "0.9712",
      "source": "binance_web",
      "source_url": "https://www.binance.com/…",
      "observed_at": "2026-10-01T15:00:00Z"
    }
  ]
}
```

### `POST /api/ingest`

What data-pipeline calls, on the server's internal network only (the public proxy does not
expose it). `Authorization: Bearer <token>`: `INGEST_TOKEN`, or `INGEST_TOKEN_NEXT` while the
token is being rotated, compared in constant time.

```json
{
  "batch_id": "0b8e6a3c-5d1f-4c1e-9a77-2f0c8f3e1b20",
  "rates": [
    {
      "key": "bitso_usdt_ars",
      "base": "USDT",
      "quote": "ARS",
      "price": "1452.30",
      "source": "bitso_api",
      "source_url": "https://bitso.com/…",
      "observed_at": "2026-10-01T15:00:00Z"
    },
    {
      "key": "binance_card_usd_usdt",
      "base": "USD",
      "quote": "USDT",
      "price": "0.9850",
      "estimated_final": "0.9712",
      "source": "binance_web",
      "source_url": "https://www.binance.com/…",
      "observed_at": "2026-10-01T15:00:00Z"
    }
  ]
}
```

Each item:

| Field             | Rule                                                                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `key`             | One of the five keys in `config/rates.yaml`                                                                                                                                                                                    |
| `base`, `quote`   | The key's pair: `mep` USD/ARS, `binance_p2p_usdt_usd` USDT/USD, `bitso_usdt_ars` USDT/ARS, `arq_usd_ars` USD/ARS, `binance_card_usd_usdt` USD/USDT. Repeated on purpose, so an inverted price is rejected here and never shown |
| `price`           | A positive decimal string with up to 10 places (no sign, exponent or separators), within the key's range in `config/rates.yaml`                                                                                                |
| `estimated_final` | Card rate only, where it is required and may be `null`; same format and range as `price`. On any other key the item is rejected                                                                                                |
| `source`          | Short id of the source: `[a-z0-9_]`, up to 64 characters                                                                                                                                                                       |
| `source_url`      | An `https` URL, or `null` (optional)                                                                                                                                                                                           |
| `observed_at`     | RFC 3339 with a time zone. More than 5 minutes in the future is rejected                                                                                                                                                       |

Any other field rejects the item. The response is `200` whenever the envelope is valid, with one
result per item, in order:

```json
{
  "batch_id": "0b8e6a3c-…",
  "results": [
    { "index": 0, "key": "bitso_usdt_ars", "status": "stored" },
    {
      "index": 1,
      "key": "binance_card_usd_usdt",
      "status": "rejected",
      "error": "out_of_range"
    }
  ]
}
```

- `status`: `stored` (now the current quote), `unchanged` (same `observed_at` and values as the
  current one), `older` (observed before the current one; ignored), `rejected` (with `error`).
- `error`, the first check that fails, in this order: `invalid_item` (a missing or extra field, a
  wrong type, a bad `source`, `source_url` or `observed_at`, or the card rate without
  `estimated_final`), `unknown_key`, `currency_mismatch`, `unexpected_field` (`estimated_final`
  on another rate), `invalid_price`, `out_of_range`, `future_observed_at`, `conflict` (same
  `observed_at` as the current quote, different values).
- Items for the same key in one batch are taken in order.

The whole request is refused with `{"error": code}`: `401 unauthorized` without a valid token
(checked before the body is read), `413 too_large` over 64 KB, `400 malformed_json`, and `422
invalid_envelope` (no `batch_id` UUID or `rates` list, another field, or more than 20 items).
