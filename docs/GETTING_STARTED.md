# Getting Started

This document is the practical runbook for a fresh checkout.

## 1. Requirements

Install:

- Node.js 20 LTS or newer
- npm 10 or newer
- A desktop/server PC on your private home network


## 2. Install

From the project directory:

```bash
npm install
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
npm install
Copy-Item .env.example .env
```

## 3. Configure `.env`

At minimum, set `BASE_URL` to the address that phones on your LAN can reach:

```dotenv
PORT=8080
HOST=0.0.0.0
BASE_URL=http://YOUR-PC-NAME:8080
DATABASE_PATH=data/riftbound.db
CATALOG_API_URL=https://api.rifthunt.com/bulk/cards
CATALOG_SYNC_ON_BOOT=true
CATALOG_MAX_AGE_HOURS=24
```


## 4. Start in development

```bash
npm run dev
```

Open:

- Desktop: `http://localhost:5173`
- LAN/mobile: `http://YOUR-PC-NAME:5173`

The Vite development server proxies `/api` requests to the Express server on port 8080.

### Enable HTTPS for phone camera access

Browsers require a secure context for camera access. On Windows, install [mkcert](https://github.com/FiloSottile/mkcert) and include the PC name or LAN IP that you will use in the browser URL. A reserved LAN IP is useful if you choose the IP address.

```powershell
mkdir certs
mkcert -install
mkcert -key-file certs/lan-key.pem -cert-file certs/lan-cert.pem YOUR-PC-NAME 192.168.1.25 localhost 127.0.0.1
```

Set these paths in `.env` (use absolute paths if needed):

```dotenv
HTTPS_KEY_PATH=certs/lan-key.pem
HTTPS_CERT_PATH=certs/lan-cert.pem
```

For development QR labels, also set `BASE_URL=https://YOUR-PC-NAME:5173` (or the matching LAN IP URL).

Run `mkcert -CAROOT` to locate mkcert's root certificate directory. Transfer only `rootCA.pem` from that directory to the phone; never copy or share `rootCA-key.pem`. Install the CA certificate on the phone and enable trust for it. On iPhone/iPad, also enable full trust under **Settings → General → About → Certificate Trust Settings**. On Android, install it as a CA certificate in the device's security settings.

Restart `npm run dev`, then open `https://YOUR-PC-NAME:5173` or `https://192.168.1.25:5173` on the phone. The name/IP in the URL must match one of the names used when generating the certificate. The phone and PC must be on the same network, and the firewall must allow port 5173.

For a production build served directly by Express, the same certificate paths enable HTTPS on port 8080. Set `BASE_URL=https://YOUR-PC-NAME:8080` (or the matching LAN IP URL) for links/QR labels, then run `npm run build` and `npm start`. Keep certificate files private and out of source control.

## 5. Start in production

```bash
npm run build
npm start
```

Then open:

```text
http://YOUR-PC-NAME:8080
```

If the phone cannot connect, allow Node.js/port 8080 through the desktop firewall for the private/home network only.

## 6. First catalog sync

The server automatically attempts a sync at boot when the catalog is empty or older than `CATALOG_MAX_AGE_HOURS`.

You can also run:

```bash
npm run sync
```

Or use **Dashboard → Sync now**.


## 7. Using the supplied `cards.json`

The supplied JSON is an API-response fixture. It contains a top-level `cards` array and uses fields such as `riftboundId`, `name`, `set`, `setName`, `num`, `type`, `rarity`, `tcgId`, `imgUrl`, `alt`, `sig`, and `over`.

The project intentionally does **not** copy that file into the repository. If Rifthunt is unavailable, you can import a compatible raw JSON object through:

```http
POST /api/catalog/import
Content-Type: application/json
```

The request body may be the complete object with a `cards` array or a raw array.

## 8. Create storage locations

Go to **Containers** and create:

- `bulk` for ordinary storage boxes;
- `custom` for user-built decks;
- `premade` for premade decks that have a blueprint.

## 9. Add collection cards

Use **Collection Intake**. Each line is a printing ID, optionally followed by a quantity:

```text
ogn-001-298 x2
ogn-007a-298
```

Choose normal or foil before submitting.

For programmatic clients, the same operation is available at `POST /api/containers/:id/inventory/bulk`.

## 10. Mobile QR scanning

The application supports QR URLs in the form:

```text
<BASE_URL>/box/<container_id>
```


## 11. Backups

Stop the server or otherwise ensure no write is occurring, then copy:

```text
data/riftbound.db
```

Do not commit it to Git. `data/` is gitignored.

## 12. Troubleshooting

### Catalog is empty

Check `GET /api/catalog/status` or the dashboard. If the sync failed, inspect the returned `last_error`, then retry manually or use the offline import endpoint.

### Phone cannot reach the app

Check:

1. The server is listening on `0.0.0.0`.
2. The phone and PC are on the same LAN/Wi-Fi.
3. The PC firewall permits TCP 8080 on the private network.
4. `BASE_URL` uses the PC's LAN/FQDN address, not `localhost`.

### Camera scanner does not work

This is expected on ordinary HTTP in browsers that require secure contexts. Use the native phone camera, or put the application behind HTTPS if camera/PWA installation is required.
