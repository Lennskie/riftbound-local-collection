# Contributing

## Principles

- Keep user collection data local.
- Do not add card data, card images, generated SQLite files, or card-derived assets to Git.
- Keep API routes under `/api/...`.
- Preserve the distinction between card definitions and printings.
- Keep inventory quantities keyed by finish.
- Preserve transactional transfers and catalog sync semantics.

## Development

```bash
npm install
cp .env.example .env
npm run dev
```

Before opening a PR:

```bash
npm run build
```

If you change the database model or API contract, update the relevant files in `docs/` and keep the README setup instructions current.
