# Deployment

## LAN deployment

1. Install Node.js 20+.
2. Clone/copy the repository onto the always-on desktop.
3. Run `npm install`.
4. Copy `.env.example` to `.env`.
5. Set `BASE_URL` to the PC's LAN/FQDN URL.
6. Run `npm run build`.
7. Run `npm start`.
8. Allow TCP 8080 through the OS firewall for the private network.
9. Test the URL from another device on the same Wi-Fi.


## Persistence

The only required user-data artifact is `data/riftbound.db`. Back it up separately and never commit it.

## No reverse proxy required

A reverse proxy is optional. The app can be served directly from Express on port 8080.

## HTTPS on a trusted home LAN

For direct Express hosting, create a certificate whose subject alternative name includes the hostname or LAN IP used by phones. A local CA such as mkcert can issue it. Set `HTTPS_KEY_PATH` and `HTTPS_CERT_PATH` in `.env`; Express then serves HTTPS on the configured `PORT`. Set `BASE_URL` to that HTTPS origin, and install/trust the local CA certificate on each phone. Never distribute the CA private key (`rootCA-key.pem`). See [Getting Started](GETTING_STARTED.md#enable-https-for-phone-camera-access) for the development-server setup and device trust steps.

For a public domain, terminate TLS with a publicly trusted certificate at a reverse proxy such as Caddy, and proxy requests to Express over the private machine network. A self-signed certificate without installing its CA on the phone will still be rejected and will not enable camera access.
