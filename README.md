# Riftbound Local Collection & Deck Manager

A self-hosted React/Vite PWA with an Express + SQLite backend for tracking physical Riftbound cards across bulk boxes, custom decks, and premade decks.


## What is included

- Express + `better-sqlite3` backend with WAL mode and foreign keys.
- React + Vite + Tailwind frontend and PWA configuration.
- Rifthunt bulk catalog adapter with support for provider field-name variants.
- Card definition/printing separation and normal/foil inventory.
- Container CRUD, inventory updates, atomic transfers, premade blueprints, shortfall calculation.
- Catalog status, background boot sync, manual sync, and location-aware card search.
- Cards-page camera scanning with automatic on-device OCR, fuzzy matching, printing-art verification, and local catalogue caching.
- QR scanner UI with a secure-context warning for plain HTTP.
- PWA manifest with an installable icon and documentation in `docs/`.

## Quick start

See **[docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)** for the full setup guide. The shortest path is:

```bash
npm install
cp .env.example .env
# edit BASE_URL in .env
npm run dev
```

For a LAN deployment, use the host PC's LAN/FQDN address in `BASE_URL`, for example `http://mypc.example.local:8080`. The server binds to `0.0.0.0:8080` by default.

## Important catalog rule

`cards.json` was used as an API-response example while implementing the mapper. It is **not** copied into this project. The repository intentionally contains no card data, card images, generated database, or card-derived assets. The local database is created under `data/` at runtime.

## Production

```bash
npm install
cp .env.example .env
npm run build
npm start
```

The Express server serves the built frontend when `dist/` exists.

## Fan-project notice

Riftbound, its cards, names, artwork, and related intellectual property belong to their respective owners. This is an unofficial fan project. Rifthunt is an external catalog dependency; its availability and API shape are outside this project's control.
