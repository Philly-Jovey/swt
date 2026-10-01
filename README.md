# Creation Stewards Website

## Run locally

This website must run through the Node server; do not open the HTML files directly with `file://`.

1. Install Node.js 20 or newer.
2. From this folder, run `npm install`.
3. Copy `.env.example` to `.env` and set a unique `SESSION_SECRET` with at least 32 characters. Keep `.env` private and do not commit it.
4. In PowerShell, create the first administrator account. Use a unique password of at least 12 characters:

```powershell
$env:ADMIN_EMAIL = 'admin@example.org'
$env:ADMIN_NAME = 'Site Administrator'
$env:ADMIN_PASSWORD = 'use-a-unique-password-of-at-least-12-characters'
npm run create-admin
Remove-Item Env:ADMIN_EMAIL, Env:ADMIN_NAME, Env:ADMIN_PASSWORD
```

5. Start the website with `npm start` and open `http://localhost:3000`.

The SQLite database and server-side sessions are written under `data/`. Back up that directory securely. Admin accounts are not created with a default password; the first account is explicitly bootstrapped from the environment.

## Roles

- **Administrator:** full dashboard access, public page headline/intro editing, program update publishing/editing/deletion, user creation/role changes/deactivation, and reports.
- **Editor:** edit public page headlines/intros and publish, edit, and delete program updates.
- **Reporter:** view and export donation reports.

The browser hides unavailable tools for convenience, while the API enforces permissions on the server. Passwords are hashed with bcrypt, login attempts are rate limited, and sessions use HttpOnly, SameSite cookies.

## Production

Deploy to a Node.js host that provides HTTPS and persistent disk storage. Set `NODE_ENV=production`, `SESSION_SECRET`, `APP_ORIGIN` to the exact public HTTPS origin, and `DATABASE_PATH` to the persistent volume. Set `TRUST_PROXY=1` only when the deployment terminates TLS at a trusted reverse proxy. SQLite session and data storage is intended for a single server instance; use a shared database/session store before scaling to multiple instances.

## Current data integrations

Edited headlines and introductory copy for Home, About, Program, Contact, and Donate are stored in SQLite and rendered on the public pages. Program updates are stored in SQLite and appear on the homepage and program page. Other page body copy and layout remain in the HTML files. The report screen reads verified records from the donations table, which starts empty. Donation checkout/payment verification and payment-provider webhooks are not part of this website yet, so reports will remain empty until a payment provider integration writes confirmed donations to the database.
