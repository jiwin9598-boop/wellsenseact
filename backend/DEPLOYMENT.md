# WellSense backend deployment (Vercel + Neon)

## Database

The backend uses PostgreSQL whenever `DATABASE_URL` is present. SQLite remains the default for local development and the existing in-memory test suite.

In Vercel, connect the Neon store to the WellSense project and make sure `DATABASE_URL` is available to the backend in Production (and Preview/Development if those environments are used). Do not commit database URLs or passwords.

The backend creates its required tables automatically at startup. It can bootstrap the first administrator when both `ADMIN_USER` and `ADMIN_PASS` are configured and the users table is empty.

Set these environment variables in Vercel before deploying:

- `DATABASE_URL`: Neon pooled connection string.
- `ADMIN_USER`: initial administrator username.
- `ADMIN_PASS`: strong initial administrator password.
- `APP_SECRET`: long, random secret used to encrypt TOTP secrets. Keep this stable; changing it prevents decryption of previously stored TOTP secrets.
- `COOKIE_SECURE=true`: enable Secure session cookies on HTTPS.
- `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`: recommended for persistent web-push configuration. If not supplied, the existing code generates in-memory keys, which are not stable across serverless instances.

Never paste secret values into source control or chat.

## Important migration note

This change makes the application use Neon for new database operations. It does not copy any existing records from a previous SQLite database. If the old deployment contains users, consoles, readings, alerts, or sessions that must be retained, export and migrate that data separately before switching production traffic.

The old SQLite file under a Vercel `/tmp` directory was ephemeral and should not be treated as persistent storage.

## Local development and tests

Without `DATABASE_URL`, the backend continues to use SQLite. The backend test suite explicitly initializes an in-memory SQLite database, so it does not require a Neon connection.
