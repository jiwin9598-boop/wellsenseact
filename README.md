# WellSense – Well Water Monitor for Kerala Households

> **DISCLAIMER:** WellSense is an early-warning tool designed to detect sudden changes and anomalies in well water parameters (such as runoff contamination, seasonal shifts, or equipment failure). It is **NOT** a certified drinking water testing laboratory and does **NOT** issue potability certificates. Always test your drinking water with an accredited laboratory if you suspect contamination.

WellSense provides continuous telemetry and early warning monitoring for household open wells and borewells across Kerala. Using automated baseline learning and exponential moving average (EMA) drift detection, WellSense alerts families to water quality disruptions following heavy monsoon rainfall or environmental disturbances before contaminated water enters household taps.

---

## Architecture Overview

```
+-----------------------------------------------------------+
|                   WellSense IoT Console                   |
| (Submersible Sensors: pH, Turbidity, TDS, Temp, Battery)   |
+-----------------------------------------------------------+
                              |
                              |  HTTP POST /api/ingest
                              |  Authorization: Bearer <API_KEY>
                              v
+-----------------------------------------------------------+
|                WellSense Backend (Node.js 22)             |
|                                                           |
|  - Ingestion Engine & Input Range Validation             |
|  - Detection Engine (48-Reading Baseline + EMA Drift)     |
|  - Rate-Limited Auth & Session Management (scrypt)        |
|  - Web Push & SSE Alert Dispatcher                        |
|  - SQLite Storage (PRAGMA foreign_keys = ON)              |
+-----------------------------------------------------------+
       |                                      ^
       | Static Files / REST / Push           | Local DB queries
       v                                      v
+--------------------------------+   +----------------------+
| WellSense PWA Frontend         |   | SQLite Database      |
| (React 18, Vite, Service Worker)|   | (/data/wellsense.db) |
| - Offline Shell & Cache        |   +----------------------+
| - Plain Language Insights      |
| - Standalone Mobile Homescreen |
+--------------------------------+
```

---

## Features

- **Early Warning Detection**: Establishes a 48-reading baseline (24 hours at 30-min intervals) and detects turbidity spikes, mineral changes, or pH shifts with a 6-hour alert cooldown.
- **Progressive Web App (PWA)**: Works offline, installs cleanly to Android and iOS homescreens, and provides push notification alerts.
- **Designed for Non-Technical Users**: All telemetry is summarized in plain language ("Water is clear", "Noticeable cloudiness detected") rather than overwhelming scientific jargon.
- **Accessible & Accessible First**: Complies with WCAG AA standards, supports `prefers-reduced-motion`, and ensures touch targets exceed 44px.
- **Secure by Default**: Zero hardcoded default credentials, scrypt password hashing with unique per-user salts, SHA-256 API key hashing, strict CSRF validation, and account lockout protection.

---

## Prerequisites

- **Node.js**: Version 22.x or later
- **npm**: Version 10.x or later
- **Docker** *(optional)*: For containerized testing and deployment

---

## Local Development Setup

### 1. Configure Environment Variables

Create your environment configuration or export the required variables in your terminal. **Never use default credentials.**

```bash
# Set required environment variables
export ADMIN_USER=your_admin_username
export ADMIN_PASS=your_secure_password_here  # minimum 10 characters
export APP_SECRET=$(openssl rand -base64 32)
export DB_FILE=./data/wellsense.db
export COOKIE_SECURE=false
export PORT=3000
```

> On Windows PowerShell:
> ```powershell
> $env:ADMIN_USER="your_admin_username"
> $env:ADMIN_PASS="your_secure_password_here"
> $env:APP_SECRET="generate_a_random_32_byte_secret_here"
> $env:DB_FILE="./data/wellsense.db"
> $env:COOKIE_SECURE="false"
> $env:PORT="3000"
> ```

### 2. Start the Backend

In your first terminal:

```bash
cd backend
npm install
npm start
```

The backend starts listening on `http://localhost:3000`. On first launch, the initial admin account is bootstrapped using the `ADMIN_USER` and `ADMIN_PASS` variables.

### 3. Start the Frontend

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

The Vite development server will open on `http://localhost:5173`, with requests proxied to the backend at `http://localhost:3000`.

---

## Docker Deployment

Build and run the production container locally:

```bash
# Build multi-stage image
docker build -t wellsense .

# Run container with persistent data volume
docker run -d \
  --name wellsense \
  -p 3000:3000 \
  -e ADMIN_USER=your_admin_username \
  -e ADMIN_PASS=your_secure_password_here \
  -e APP_SECRET=$(openssl rand -base64 32) \
  -e COOKIE_SECURE=false \
  -v wellsense_data:/data \
  wellsense
```

Access the application in your browser at `http://localhost:3000`.

---

## Cloud Deployment

### Deploying to Fly.io

1. **Install Fly CLI and Authenticate:**
   ```bash
   fly auth login
   ```

2. **Initialize Fly Application:**
   ```bash
   fly launch --no-deploy
   ```

3. **Create Persistent Storage Volume:**
   The `fly.toml` configuration requires a persistent volume named `wellsense_data` mounted at `/data` in the `bom` (Mumbai) region:
   ```bash
   fly volumes create wellsense_data --region bom --size 1
   ```

4. **Set Production Secrets:**
   ```bash
   fly secrets set \
     ADMIN_USER=your_admin_username \
     ADMIN_PASS=your_secure_password_here \
     APP_SECRET=$(openssl rand -base64 32) \
     COOKIE_SECURE=true
   ```

5. **Deploy Application:**
   ```bash
   fly deploy
   ```

### Deploying to Railway

1. **Create New Project**:
   - Go to [Railway Dashboard](https://railway.app/) and create a new project from your Git repository.
2. **Add a Persistent Volume**:
   - In service settings, create a Volume mounted at `/data`.
3. **Configure Environment Variables**:
   Add the following variables in the Railway dashboard:
   - `ADMIN_USER` = `your_admin_username`
   - `ADMIN_PASS` = `your_secure_password_here`
   - `APP_SECRET` = `<generated_32_byte_secret>`
   - `DB_FILE` = `/data/wellsense.db`
   - `COOKIE_SECURE` = `true`
   - `PORT` = `3000`
4. **Deploy**:
   Railway will automatically trigger a build using the `Dockerfile`.

---

## Mobile Phone Installation (PWA)

WellSense is engineered as an installable Progressive Web App with offline access and push notifications:

### Android (Chrome / Edge / Firefox)
1. Open your WellSense server URL in Google Chrome (e.g., `https://your-wellsense-domain.com`).
2. An **"Install App"** prompt banner will appear automatically at the bottom of the screen.
3. Tap **Install** or open the three-dot menu `⋮` and select **"Install app"** / **"Add to Home Screen"**.
4. The WellSense icon will appear directly on your home screen and app launcher.

### iOS (Apple Safari)
1. Open your WellSense server URL in Apple Safari.
2. Tap the **Share** button (the square icon with an upward arrow at the bottom of the screen).
3. Scroll down and tap **"Add to Home Screen"**.
4. Tap **Add** in the top right corner. WellSense will now run as a full-screen, standalone application.

---

## Console-to-Server Ingestion API

Telemetry is transmitted by the well monitoring device using standard HTTP/JSON requests:

### `POST /api/ingest`

- **Headers:**
  - `Content-Type: application/json`
  - `Authorization: Bearer <API_KEY>`

- **Request Body (JSON):**
  ```json
  {
    "ph": 7.21,
    "turb": 2.15,
    "tds": 182.4,
    "temp": 27.2,
    "battery": 94.5,
    "ts": 1731175200000
  }
  ```

| Field | Type | Description | Valid Range |
|---|---|---|---|
| `ph` | `number` | Water acidity / alkalinity level | 0.0 to 14.0 |
| `turb` | `number` | Turbidity in Nephelometric Turbidity Units (NTU) | 0.0 to 500.0 |
| `tds` | `number` | Total Dissolved Solids in parts per million (ppm) | 0.0 to 2000.0 |
| `temp` | `number` | Water temperature in degrees Celsius (°C) | -30.0 to 80.0 |
| `battery` | `number` | Sensor battery charge percentage | 0.0 to 100.0 |
| `ts` | `number` *(optional)* | Timestamp (epoch milliseconds). Defaults to current server time if omitted. Must be within the past 7 days. | `[now - 7d, now + 5m]` |

- **Responses:**
  - `201 Created`:
    ```json
    { "success": true }
    ```
  - `400 Bad Request`: Invalid sensor ranges, timestamp out of range, or invalid JSON.
  - `401 Unauthorized`: Missing or malformed `Authorization: Bearer <API_KEY>` header.
  - `403 Forbidden`: Unrecognized or revoked API key.

---

## Telemetry Simulator CLI Tool

The WellSense repository includes a built-in IoT console simulator for testing baseline detection and alarm workflows without physical hardware.

### Simulator Usage

```bash
node scripts/device-sim.js --url http://localhost:3000 --key <API_KEY> [--rain] [--fast]
```

### Options:
- `--key <API_KEY>`: *(Required)* The console API key generated in the WellSense dashboard.
- `--url <URL>`: Base URL of the WellSense backend (default: `http://localhost:3000`).
- `--fast`: Transmits all 60 readings sequentially without real-time delay.
- `--rain`: Simulates a sudden monsoon downpour by injecting a turbidity spike to **15.0 NTU** at reading #50.
- `--delay <ms>`: Delay between readings in milliseconds (default: 10ms with `--fast`, 500ms otherwise).

### Testing the Monsoon Alert Flow:
```bash
# 1. Obtain an API key from the web console under "Add Console"
# 2. Run simulator with rain event enabled in fast mode
node scripts/device-sim.js --url http://localhost:3000 --key your_console_api_key --rain --fast
```

The simulator will:
1. Send readings #1 to #48 with steady baseline parameters to complete the learning phase.
2. Send reading #49 in normal state.
3. Inject the rain turbidity spike (15.0 NTU) at reading #50, triggering **exactly one alert**.
4. Send readings #51 to #60 returning to normal, verifying the 6-hour alert cooldown logic.
5. Print an execution summary report upon completion.

---

## Environment Variables Reference

| Variable | Description | Required | Default |
|---|---|---|---|
| `ADMIN_USER` | Initial administrative username created on first launch | Yes (first run) | *None* |
| `ADMIN_PASS` | Password for initial admin user (min 10 characters) | Yes (first run) | *None* |
| `APP_SECRET` | Secret key used for cryptographic operations | Yes | *None* |
| `DB_FILE` | Absolute or relative path to SQLite database file | No | `/data/wellsense.db` |
| `PORT` | HTTP server listening port | No | `3000` |
| `COOKIE_SECURE` | Set to `true` in production to enforce HTTPS cookie flag | No | `false` |
| `TRUST_PROXY` | Set to `true` when deployed behind reverse proxies (Fly, Railway, Nginx) | No | `false` |

---

## Security Architecture

1. **Authentication & Password Hashing**:
   - Passwords are encrypted with `crypto.scryptSync` utilizing a unique 128-bit cryptographically random salt per user and 64-byte key length.
   - Timing-safe comparisons (`crypto.timingSafeEqual`) prevent side-channel timing attacks.
2. **Device Authentication**:
   - IoT consoles authenticate using 256-bit high-entropy API keys. Keys are hashed with SHA-256 before storage; plain keys are shown only once upon creation.
3. **Account Lockout & Brute-Force Mitigation**:
   - IP and username failed attempt tracking triggers a 15-minute lockout after 5 consecutive failures.
4. **Session Security & CSRF**:
   - Session tokens are stored in `HttpOnly`, `SameSite=Strict` cookies.
   - Sensitive mutation requests require the `x-wellsense-csrf` header verified against server session tokens.
5. **No Default Credentials**:
   - The application strictly refuses to boot if `ADMIN_USER` and `ADMIN_PASS` are omitted on a fresh database.

---

## Design System & Accessibility

- **Color Palette**:
  - Primary Teal: `#0b7a75` (Brand & water clarity)
  - Deep Navy: `#0c1a22` (High-contrast backgrounds & card containers)
  - Warning Amber: `#f59e0b` (Parameter warnings)
  - Alert Red: `#ef4444` (Severe deviation alerts)
- **WCAG AA Compliance**:
  - Interactive touch targets are sized at or above 44px by 44px.
  - High contrast ratios ensure readability in bright sunlight outdoors.
  - Supports `prefers-reduced-motion` media queries for animations.
  - Plain language summaries throughout all user-facing screens.

---

## License

WellSense is open-source software licensed under the [MIT License](LICENSE).
