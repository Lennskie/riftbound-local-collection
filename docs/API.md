# API


## Cards

### `GET /api/cards`

Query: `q`, `set`, `limit`, `offset`.

Returns local active printings and available set filters.

### `GET /api/search?q=...`

Searches definitions and printing names and includes inventory location rows.

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

```json
{"requirements":[{"definition_key":"baron nashor","required_quantity":1}]}
```

## Catalog

- `GET /api/catalog/status`
- `POST /api/catalog/sync`
- `POST /api/catalog/import`

The sync endpoint starts a server-side Rifthunt fetch. Import accepts either a raw card array or an object containing `cards`.

### `GET /api/config`

Returns the configured `BASE_URL` for QR generation.
