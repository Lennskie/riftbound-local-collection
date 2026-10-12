# API


## Cards

### `GET /api/cards`

Query: `q`, `set`, `limit`, `offset`. `q` matches printing names, definition names, and `definition_key` values.

Returns local active printings and available set filters.

### `GET /api/search?q=...`

Searches definitions, printing names, and definition keys. Results include each inventory row's container, quantity, finish, and zone.

## Containers

- `GET /api/containers`
- `POST /api/containers` — `{name,type,description}`
- `GET /api/containers/:id`
- `POST /api/containers/:id/lock` — snapshots the current main deck as its expected list; supported for custom and premade decks.
- `POST /api/containers/:id/riftatlas/preview` — `{text}`; resolves card names and returns missing names and deck-limit violations without writing.
- `POST /api/containers/:id/riftatlas/import` — `{text}`; atomically replaces a premade container inventory and locks its imported main deck.
- `PUT /api/containers/:id` — `{name?,description?}`
- `DELETE /api/containers/:id` — use `?force=true` only when deliberately deleting a non-empty container.

## Inventory

### `PUT /api/containers/:id/inventory`

```json
{"printing_id":"ogn-001-298","finish":"normal","zone":"main","quantity":2}
```

### `POST /api/containers/:id/inventory/bulk`

```json
{"cards":[{"printing_id":"ogn-001-298","quantity":2,"finish":"normal","zone":"sideboard"}]}
```

`zone` defaults to `main` and can be `main` or `sideboard`. Custom and premade containers enforce deck limits server-side; bulk containers ignore deck limits. `GET /api/containers/:id` returns `deck_rules.summary` and `deck_rules.violations` for deck containers.

### `DELETE /api/containers/:id/inventory?printing_id=...&finish=normal&zone=main`

Removes the selected printing, finish, and zone inventory entry entirely. Use `PUT` with a lower quantity to remove only some copies; setting quantity to `0` also deletes the entry.

### `POST /api/transfer`

```json
{"from_container_id":"...","to_container_id":"...","printing_id":"ogn-001-298","finish":"normal","quantity":1}
```

Optional `from_zone` and `to_zone` fields can select `main` or `sideboard` independently; both default to `main`. The operation is atomic and refuses transfers larger than the source quantity or destination deck limits.

## Premade blueprints

`POST /api/blueprints/:container_id`

This is a low-level replacement endpoint for premade or custom deck containers. It requires existing `definition_key` values and positive integer quantities, but does not resolve deck-list text or enforce deck rules. For user-facing imports, use the Riftatlas preview/import endpoints, which validate card matches and deck limits before atomically replacing inventory.

```json
{"requirements":[{"definition_key":"baron nashor","required_quantity":1}]}
```

## Catalog

- `GET /api/catalog/status`
- `POST /api/catalog/sync`

The sync endpoint starts a server-side Rifthunt fetch.

## Scanner catalogue

The Cards-page scanner downloads a compact local catalogue snapshot. Both routes return `Cache-Control: no-store`.

### `GET /api/scanner/version`

Returns the current integer scanner catalogue version from `catalog_meta`; this version check does not build or query the full index.

```json
{"version":18}
```

### `GET /api/scanner/index`

Returns the version with active definitions and printings. Definitions are included only when they have an active printing. The index omits card text, flavour, artist, and provider-only IDs.

```json
{
  "version":18,
  "definitions":[
    {"definition_key":"teemo","card_name":"Teemo","type_line":"Champion Unit"}
  ],
  "printings":[
    {
      "printing_id":"ogn-121a-298",
      "definition_key":"teemo",
      "set_code":"OGN",
      "collector_num":121,
      "rarity":"Rare",
      "variant_label":null,
      "alternate_art":0,
      "overnumbered":0,
      "signature":0,
      "image_url":"https://example.invalid/card.webp"
    }
  ]
}
```

The phone stores this response in IndexedDB and checks the version before downloading it again. Camera frames and OCR text are processed on-device and are never sent to these endpoints or the remote catalog provider.

### `GET /api/config`

Returns the configured `BASE_URL` for QR generation.
