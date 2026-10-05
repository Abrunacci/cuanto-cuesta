# cuanto-cuesta backend

The researched fee defaults (`config/fees.yaml`), the rates the calculator asks for
(`config/rates.yaml`), and an API that stores the day's prices. See `CONTRIBUTING.md` at the repo
root for the architecture and conventions, and the root `README.md` for running it.

Each rate has one current quote. A newer observation replaces it, unless it jumps too far (see
"Jumps"); an older one is ignored. There is no history: data-pipeline keeps its own log of what
it fetched.

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
`held` is `null`, or the latest reading that jumped too far from this quote and is waiting for
confirmation (its `price`, `estimated_final` on the card rate, and `observed_at`): the
calculator keeps the current price and says that the latest reading was very different.

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
      "observed_at": "2026-10-01T15:00:00Z",
      "held": null
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
  `observed_at` as the current quote, different values), `jump` (valid, but held: see "Jumps").
- Items for the same key in one batch are taken in order.

The whole request is refused with `{"error": code}`: `401 unauthorized` without a valid token
(checked before the body is read), `413 too_large` over 64 KB, `400 malformed_json`, and `422
invalid_envelope` (no `batch_id` UUID or `rates` list, another field, or more than 20 items).

### Jumps

data-pipeline does not check how much a price moved, so a broken source could send a number that
is plausible but wrong (1452.30 read as 14523). Each rate has a `max_jump` in
`config/rates.yaml`: 10 % for the peso rates, 5 % for the USDT/USD ones. A newer reading whose
price (or the card's estimate, when both readings have one) moves more than that from the
current quote is not shown:

1. It is held aside, next to the current quote, and answered `rejected` / `jump`. The current
   quote stays; `GET /api/rates` returns the held reading in `held`, so the calculator can warn.
2. Each later reading within `max_jump` of the held one confirms it; one sent again (not newer
   than the last that counted) counts once. On the second confirmation that reading becomes the
   current quote and is answered `stored`: a market that really moved keeps reading the new
   price.
3. A later reading within `max_jump` of the current quote is stored as usual and the held one is
   dropped: the source failed once. A reading far from both replaces the held one, which starts
   over.

Nothing waits for a person. Every step is logged on stderr (the server's journal) by the
`cuanto_cuesta.ingest` logger: `jump_held`, `jump_confirming` and `jump_discarded` lines, and a
`jump_confirmed` warning when a jump becomes the current quote. That last one is the line to
alert on: it is the only case where the calculator starts showing a price that moved that much.
