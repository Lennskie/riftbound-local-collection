# Architecture

The application is intentionally a small local web system:

```text
Phone / Desktop browser
        |
        | HTTP on private LAN
        v
Express server :8080
   |        |
   |        +--> Rifthunt bulk API (read-only catalog sync)
   |
   +--> better-sqlite3 --> data/riftbound.db
```


## Boundaries

- User collection data never leaves the local machine.
- Catalog metadata is downloaded from Rifthunt and stored in SQLite.
- Card artwork is referenced by URL and is not downloaded into the repository or database as a blob.
- All application endpoints use `/api/...`; there is no admin API namespace.
- QR labels contain a box URL, not card data.

## Runtime modes

Development runs Vite on 5173 and Express on 8080. Vite proxies `/api` to Express.

Production runs the built Vite application from Express on port 8080.

## Transactional operations

Catalog replacement and inventory transfers use SQLite transactions. Catalog replacement only deactivates old printings after the new bulk feed has been successfully ingested.
