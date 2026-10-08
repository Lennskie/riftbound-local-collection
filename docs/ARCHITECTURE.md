# Architecture

The application is intentionally a small local web system:

```text
Phone browser
   |  camera frames, OCR, fuzzy matching stay on phone
   |  IndexedDB: versioned scanner definitions + printings
   |  (artwork is requested from its existing CDN URLs)
   |
   | HTTPS/HTTP on the private LAN:
   | GET scanner version/index; POST inventory additions
   v
Express server :8080
   |        |
   |        +--> Rifthunt bulk API (server-side catalog sync only)
   |
   +--> better-sqlite3 --> data/riftbound.db
                              |
                              +--> authoritative catalog + inventory
```


## Boundaries

- User collection data never leaves the local machine.
- Catalog metadata is downloaded from Rifthunt and stored in SQLite.
- The scanner catalogue snapshot is served from SQLite to the phone and cached in phone-local IndexedDB. Camera images and OCR text never leave the phone; the phone never contacts the Rifthunt API.
- Tesseract worker code, WebAssembly core, and English language data are served from the app's own origin and cached by the PWA service worker.
- Card artwork is referenced by URL and is not downloaded into the repository or database as a blob.
- All application endpoints use `/api/...`; there is no admin API namespace.
- QR labels contain a box URL, not card data.
- Artwork requests may be cached by the PWA service worker; `/api/*` requests are not cached.

## Runtime modes

Development runs Vite on 5173 and Express on 8080. Vite proxies `/api` to Express.

Production runs the built Vite application from Express on port 8080.

## Transactional operations

Catalog replacement and inventory transfers use SQLite transactions. Catalog replacement only deactivates old printings after the new bulk feed has been successfully ingested.
