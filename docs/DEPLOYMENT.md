# Deployment

## LAN deployment

1. Install Node.js 20+.
2. Clone/copy the repository onto the always-on desktop.
3. Run `npm ci` to install the exact versions in the committed lockfile.
4. Copy `.env.example` to `.env`.
5. Set `BASE_URL` to the PC's LAN/FQDN URL.
6. Run `npm run build`.
7. Run `npm start`.
8. Allow TCP 8080 through the OS firewall for the private network.
9. Test the URL from another device on the same Wi-Fi.

## Network trust and API security

The application has no authentication or authorization. It assumes every device that can connect is trusted and can read or change collection data. Keep it on a trusted private LAN, restrict TCP 8080 to that network in the firewall, and do not expose or port-forward the API port directly to the public internet. HTTPS encrypts traffic but does not add authentication.


## Persistence

The only required user-data artifact is `data/riftbound.db`. Back it up separately and never commit it.

## No reverse proxy required

A reverse proxy is optional for private-network hosting. The app can be served directly from Express on port 8080; a proxy or TLS termination alone does not secure its unauthenticated API.

## HTTPS on a trusted home LAN

For direct Express hosting, create a certificate whose subject alternative name includes the hostname or LAN IP used by phones. A local CA such as mkcert can issue it. Set `HTTPS_KEY_PATH` and `HTTPS_CERT_PATH` in `.env`; Express then serves HTTPS on the configured `PORT`. Set `BASE_URL` to that HTTPS origin, and install/trust the local CA certificate on each phone. Never distribute the CA private key (`rootCA-key.pem`). See [Getting Started](GETTING_STARTED.md#enable-https-for-phone-camera-access) for the development-server setup and device trust steps.

Do not publish the application behind a public domain or proxy without first adding authentication and access controls. A publicly trusted certificate and reverse proxy provide TLS, not authorization. A self-signed certificate without installing its CA on the phone will still be rejected and will not enable camera access.
