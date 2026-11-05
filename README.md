# HopOn 🚗 — Student-Exclusive Campus Ride-Sharing

[![Next.js](https://img.shields.io/badge/Next.js-16.3-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2-61dafb?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![MapLibre GL](https://img.shields.io/badge/MapLibre_GL-6.13-3969a4?logo=maplibre)](https://maplibre.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**HopOn** is a modern, student-exclusive ride-sharing and carpooling web platform piloted for **Kristu Jayanti University (KJU), Bengaluru**. It connects verified university students heading in the same direction, making daily campus commutes safer, more affordable, and environmentally friendly.

---

## ✨ Key Features

### 🗺️ OpenFreeMap Vector Maps & Live Campus Drivers
- **MapLibre GL JS Integration:** High-performance, client-side vector map powered by OpenFreeMap Liberty style—no external API keys or vendor lock-in.
- **Interactive Pin Dropping:** Click anywhere on the map to place pins with an interactive popup selector to assign points as either **Pickup** or **Dropoff**.
- **Live Campus Patrol Fleet:** Real-time simulated campus vehicles (Cars, Scooties, and Motorcycles) patrolling the KJU / Hennur / Thanisandra / Manyata Tech Park commuter corridor with authentic compass bearing trigonometry (`0° = North`, `90° = East`) and realistic street turns.

### 🛣️ Real Road Routing & Dynamic Pricing
- **Server Route Proxy (`/api/route`):** Fetches real road geometries from OSRM with a bounded cache, input validation (max 10 valid points), per-user and global rate limits, and proper user-agent identification.
- **Graceful Curvature Fallback:** Generates high-fidelity curved road waypoint geometry if external network routing services are temporarily unreachable.
- **Dynamic Student Fares:** Live calculation of student fares (Bike, Scooty, Car) scaled to actual road distance:
  $$\text{Fare}_{\text{Bike}} = \max(₹30, 15 + 5 \times d)$$
  $$\text{Fare}_{\text{Scooty}} = \max(₹25, 12 + 4.5 \times d)$$
  $$\text{Fare}_{\text{Car}} = \max(₹70, 40 + 9 \times d)$$

### 🔍 Non-Intrusive Geocoding Search
- **Server Geocode Proxy (`/api/geocode`):** Protects Nominatim from being rate-limited by proxying requests server-side (sign-in required) with custom User-Agent headers, a bounded 10-minute cache, per-user and global rate limits, a 4-second upstream timeout, and Bengaluru bounding boxes.
- **Decoupled Search:** Typing into location inputs queries suggestions in a clean dropdown list without unexpectedly jumping or relocating pins on the active map until a suggestion is explicitly selected.

### 🛡️ Real Authentication & Security
- **Server-Side Authentication (`/api/auth/login`):** Validates credentials on the server (constant-time comparison) without leaking passwords into the client JavaScript bundle. Login attempts are rate limited per IP + email.
- **Signed Sessions:** A successful login sets an `httpOnly`, `SameSite=Lax` cookie holding an HMAC-signed token (see `lib/session.ts`). "Remember Me" makes it a 30-day cookie; otherwise it ends with the browser session. The signing secret comes from `SESSION_SECRET` (required in production).
- **Server-Derived Identity:** Every ride API reads who you are from the signed cookie, never from the request body. Drivers can't be impersonated, only drivers can post offers or respond to requests, and a driver's live location is visible only to that driver and passengers they accepted.
- **Real Logout:** `/api/auth/logout` clears the cookie on the server; the home page re-checks the session with `/api/auth/me` on load, so a forged `localStorage` entry doesn't grant access (the browser copy is just a UI cache).
- **Input Validation:** Seats, fares, coordinates, vehicle types and free-text fields are validated and length-capped on the server (`lib/validate.ts`).
- **HTML Injection Defense:** Popups and marker labels use native DOM construction (`document.createElement`, `textContent`, `setDOMContent`), guaranteeing immunity to XSS/HTML injection from third-party geocoding strings.

### ♿ Accessibility & Modern UI
- **Keyboard Navigation:** Ride options support keyboard focus (`tabIndex={0}`), `Enter`/`Space` selection, and ARIA state labels.
- **Open Ride Requests & Ride Offering:** Passengers pick a ride type, see a fare estimate, and send an open request; the first nearby student driver to accept it picks them up. Drivers post empty seats (cars up to 6, bikes and scooties 1), manage an inbox, and share live location with the passenger they accepted.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** >= 18.17 (Node.js 20+ recommended)
- **npm** >= 9.0

### Installation

1. Clone the repository and open the project folder (the one that contains `package.json`):
   ```bash
   git clone https://github.com/KrishRai17/ECP.git
   cd ECP   # or ECP-main if you downloaded the zip
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. (Optional locally, required in production) Create your environment file:
   ```bash
   cp .env.example .env.local
   ```
   Then set `SESSION_SECRET` (see [Configuration](#%EF%B8%8F-configuration)).

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔑 Demo Credentials

Use the pre-configured university demo credentials:

| Role | Email | Password |
|---|---|---|
| Passenger | `student@hopon.demo` | `hopon123` |
| Driver | `driver@hopon.demo` | `hopon123` |

Institution: Kristu Jayanti University, Bengaluru. You can also click **"Fill"** on the login page to populate these automatically. These are demo-only accounts; set `HOPON_DEMO_PASSWORD` to change the password for any shared deployment.

---

## ⚙️ Configuration

Copy `.env.example` to `.env.local`:

| Variable | Required | Purpose |
|---|---|---|
| `SESSION_SECRET` | **Yes in production** | 16+ character secret used to sign session cookies. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. A built-in fallback is used in development only. |
| `APP_URL` | **Yes in production** | Base URL of the deployed application (e.g., `https://hopon.kristujayanti.edu`) for email verification links. |
| `EMAIL_FROM` | No | Sender address when using Resend in production (e.g., `HopOn Campus <verify@kristujayanti.com>`). |
| `RESEND_API_KEY` | No | Resend API key for sending university email verification tokens. In production, either this or `EMAIL_WEBHOOK_URL` is required for email delivery. |
| `EMAIL_WEBHOOK_URL` | No | Alternative outbound webhook URL for university email verification delivery. |
| `HOPON_DB_FILE` | No | Path to the SQLite database file (defaults to `.data/hopon.sqlite`, or `:memory:` during unit tests). |
| `HOPON_DEMO_PASSWORD` | No | Overrides the demo accounts' password. |
| `HOPON_ENABLE_DEMO` | No | Set to `true` to allow demo accounts and seed offers when `NODE_ENV=production` (disabled by default in production). |
| `HOPON_ALLOW_DEMO_TOPUP` | No | Set to `true` (in non-production only) to allow simulated self-service wallet top-ups via `POST /api/wallet`. In production, top-ups require cashier confirmation. |
| `HOPON_CASHIER_SECRET` | **Yes for Cashier Ops** | 16+ character secret used by campus cashiers / administrators to confirm cash top-ups via `POST /api/wallet` and manually verify students via `POST /api/cashier/verify-student`. |
| `ADMIN_SECRET` | **Yes in production** | Secret required in production to query database health via `GET /api/db/status` (compared using timingSafeEqual). |
| `ALLOWED_EMAIL_DOMAINS` | No | Comma-separated university email domains allowed to register (defaults to `kristujayanti.com,kju.edu,kju.ac.in`, plus `hopon.demo` when demo accounts are enabled). Note: domains must be confirmed as real KJU domains. |
| `TRUST_PROXY` | No | Set to `true` only behind a trusted reverse proxy so rate limiters honour `X-Forwarded-For` / `X-Real-IP`. Startup warning is logged if unset in production. |
| `TRUSTED_PROXY_HOPS` | No | Number of trusted reverse proxy hops between client and HopOn (defaults to `1`). When `TRUST_PROXY=true`, client IP is resolved at `length - hops` in `X-Forwarded-For`. |
| `ALLOWED_DEV_ORIGINS` | No | Comma-separated additional LAN IPs or hostnames allowed by `next dev`. |
| `HOPON_PERSIST_FILE` | No (Legacy) | Legacy JSON snapshot path for offers and requests. Primary persistence uses SQLite (`HOPON_DB_FILE`); when set, `hydrate()` syncs legacy snapshot records into SQLite. |

> **Storage note:** HopOn persists users, wallets, wallet ledger audit trails, verification audit logs, ride offers, ride requests, live driver locations, trip history, in-ride chat messages, and 2-way ratings in **SQLite 3 (WAL mode)** via `better-sqlite3` (`lib/db.ts`). Rate limiting is per-process in memory (`lib/rateLimit.ts`).
>
> **Wallet Policy note:** Standalone `{ action: "pay" }` is disabled because ride fares are transferred atomically between passenger and driver wallets inside SQLite upon driver-confirmed ride completion. Wallet top-ups in production are strictly cashier-confirmed (`HOPON_CASHIER_SECRET`); student drivers cannot confirm unbacked cash top-ups. All balance adjustments write permanent audit rows to `wallet_ledger`. Demo self-service top-ups are disabled unless `HOPON_ALLOW_DEMO_TOPUP=true` in non-production.

---

## 🔌 API Overview

All endpoints except `/api/auth/login`, `/api/auth/register`, `/api/auth/verify`, `/api/auth/logout`, `POST /api/cashier/verify-student`, and `GET /api/rides/track` require a signed-in session.

| Endpoint | Who | Purpose |
|---|---|---|
| `POST /api/auth/login` | anyone | Sign in (`crypto.scrypt` password check with automatic legacy SHA-256 upgrade, per-email exponential backoff); sets session cookie with `ver` |
| `POST /api/auth/register` | anyone | Register a student passenger or driver on an approved university domain (separate registration rate limiter + global rate bucket for unknown IPs) |
| `POST /api/auth/verify` | anyone / signed in | Verify one-time email token (24h expiry) to set `student_id_verified=1`, or resend verification token (rate limited 3/hr, 503 on mail failure) |
| `POST /api/auth/logout` | anyone | Revokes session by incrementing user's `session_version` in DB and clears the session cookie |
| `POST /api/cashier/verify-student` | cashier | Manually verify student ID and grant welcome bonus using `HOPON_CASHIER_SECRET` (rate limited 20/15m with `verification_audit` logging) |
| `GET /verify?token=` | anyone | Client verification landing page with explicit confirmation button |
| `GET /api/auth/me` | signed in | Current user from the session |
| `GET /api/geocode?q=` | signed in | Place search (proxy, cached, rate limited) |
| `GET /api/geocode/reverse?lat=&lng=` | signed in | Reverse geocoding & road-curb snapping (proxy, cached, rate limited) |
| `GET /api/route?points=lng,lat;lng,lat` | signed in | Road route (OSRM proxy with fallback) |
| `GET /api/rides/offers` | signed in | Active ride offers |
| `POST /api/rides/offers` | **verified drivers** | Post a validated ride offer (requires email verification) |
| `GET/POST/PATCH /api/rides/requests` | signed in | Your own requests / driver inbox (whitelisted via `toDriverView` with ~0.01 grid coarse location and stripped dropoff notes); create, cancel, or complete a request |
| `PATCH /api/rides/requests/respond` | **verified drivers** | Accept (with passenger wallet coverage check), decline, mark arrival (`arrive`), verify pickup OTP (`verify_otp`, 5-try lockout), or complete (`complete`) a ride |
| `GET /api/rides/location?userId=` | that user, or counterparty in an active accepted ride | Live GPS location |
| `POST /api/rides/location` | signed in | Update your own live GPS location (tightened to 20/min for idle drivers) |
| `GET/POST/DELETE /api/rides/track` | `GET` public with token (IP rate limited, O(1) index, stays valid 10m post-completion); `POST`/`DELETE` passenger only | Generate/revoke a random 128-bit `shareToken`, or fetch minimal live tracking telemetry (`/track/[token]`) |
| `GET/POST /api/rides/messages` | ride participants | List or send in-ride chat messages & quick replies (rate limited) |
| `GET /api/rides/stream` | signed in | Targeted, debounced Server-Sent Events (SSE) stream for real-time ride & GPS updates (driver snapshots whitelisted via `toDriverView`) |
| `GET /api/rides/history` | signed in | Completed and cancelled trips from SQLite `trip_history` |
| `POST /api/rides/rate` | ride participants | Submit a 1–5 star rating for the counterparty of a completed ride (one per ride/rater) |
| `POST /api/wallet` | signed in / cashier | Cashier-confirmed (`HOPON_CASHIER_SECRET`, logs to `wallet_ledger`), or non-prod demo wallet top-up |
| `GET /api/db/status` | signed in | SQLite engine health and table row counts (secured with timing-safe `ADMIN_SECRET` in production) |

---

## 📁 Project Architecture

```
ECP-main/
├── proxy.ts                      # Next.js 16 Proxy: per-request CSP nonces & security headers
├── next.config.ts                # Next.js configuration, allowed dev origins & fallback static CSP
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/route.ts    # Credential check, progressive backoff, signed session cookie
│   │   │   ├── register/route.ts # Student registration & email verification token generation
│   │   │   ├── verify/route.ts   # One-time email ownership verification endpoint
│   │   │   ├── logout/route.ts   # Clears the httpOnly session cookie
│   │   │   └── me/route.ts       # Current user from the session
│   │   ├── db/
│   │   │   └── status/route.ts   # SQLite database health and table statistics
│   │   ├── geocode/
│   │   │   ├── route.ts          # Nominatim proxy: auth, validation, rate limit, bounded cache
│   │   │   └── reverse/route.ts  # Reverse geocoding proxy with campus gate naming
│   │   ├── rides/
│   │   │   ├── history/route.ts  # User trip history receipts
│   │   │   ├── location/route.ts # Driver live GPS location (access controlled & rate limited)
│   │   │   ├── messages/route.ts # In-ride chat messaging & quick replies
│   │   │   ├── offers/route.ts   # List / post ride offers (verified drivers only to post)
│   │   │   ├── rate/route.ts     # 2-way post-ride rating submission & validation
│   │   │   ├── requests/
│   │   │   │   ├── route.ts      # Create, list (whitelisted toDriverView) and cancel requests
│   │   │   │   └── respond/route.ts # Driver accept, arrive, verify_otp, complete
│   │   │   ├── stream/route.ts   # SSE real-time stream (toDriverView whitelisted snapshots)
│   │   │   └── track/route.ts    # IP rate-limited public tracking token generator/lookup
│   │   ├── route/route.ts        # OSRM road geometry & fallback waypoint generator
│   │   └── wallet/route.ts       # Cashier / driver / demo wallet top-up handling
│   ├── home/
│   │   └── page.tsx              # Main dashboard: left panel, map, campus rides
│   ├── login/
│   │   └── page.tsx              # University student sign-in portal
│   ├── register/
│   │   └── page.tsx              # Student registration portal (passenger / rider role)
│   ├── track/
│   │   └── [token]/page.tsx      # Public live ride telemetry tracking page
│   ├── globals.css               # Design system, MapLibre styles & animations
│   ├── layout.tsx                # Root layout with dynamic headers for CSP nonces
│   └── page.tsx                  # Root router with auth verification
├── components/
│   ├── ActivityModal.tsx         # Trip history modal with student receipts
│   ├── Footer.tsx                # Campus footer navigation
│   ├── GetRidePanel.tsx          # Find ride, offer seats, and agreed fare display
│   ├── HopOnNavbar.tsx           # Campus navigation & user profile dropdown
│   ├── LoginForm.tsx             # Accessible sign-in form
│   ├── MapLibreMap.tsx           # Vector map, safe DOM popups, vehicle rendering
│   ├── MapWrapper.tsx            # Client-side dynamic loader for MapLibre
│   ├── QuickActionCard.tsx       # Campus quick booking shortcut cards
│   ├── RatingModal.tsx           # 2-way post-ride rating & tag modal
│   ├── RideCompanionBar.tsx      # In-ride chat, UPI QR, share, and SOS quick action bar
│   ├── ToastContext.tsx          # Campus toast notification system
│   └── UpcomingRide.tsx          # Booked carpool summary card
├── lib/
│   ├── accounts.ts               # User accounts, scrypt auth, email verification, ratings, wallet
│   ├── apiAuth.ts                # requireUser(), clientIp, JSON parsing, 429 helper for routes
│   ├── auth.ts                   # Client user cache, logout() and syncSession()
│   ├── campus.ts                 # KJU coordinates, gates and distance helpers
│   ├── csp.ts                    # Content-Security-Policy generator with MapLibre & nonces
│   ├── db.ts                     # SQLite WAL engine (better-sqlite3) & migrations
│   ├── limiters.ts               # Shared rate limiter instances for API routes
│   ├── mapData.ts                # Bengaluru locations, vehicle anchors & formulas
│   ├── mockData.ts               # Student activity data & campus quick actions
│   ├── notifications.ts          # Browser notifications & sound alerts
│   ├── rateLimit.ts              # In-memory rate limiter & exponential backoff
│   ├── rideStore.ts              # Offers, requests, O(1) shareToken index, locations, pruning
│   ├── routeUtils.ts             # Curved fallback route geometry
│   ├── session.ts                # HMAC-signed session tokens (server only)
│   ├── ttlCache.ts               # Size-bounded cache with expiry
│   ├── useGeolocation.ts         # Browser GPS geolocation hook
│   ├── useNominatimSearch.ts     # Client search hook querying /api/geocode
│   └── validate.ts               # Input validation helpers
└── tests/
    ├── core.test.mjs             # Haversine, pricing, bearing
    ├── csp.test.mjs              # Nonce CSP, unsafe-eval removal & MapLibre policy
    ├── persist.test.mjs          # Snapshot / restore across a simulated restart
    ├── rideStore.test.mjs        # Seats, toDriverView, OTP, completion, retention
    ├── routes.test.mjs           # Route-level tests for stream, track, ratings, wallet, login
    ├── security.test.mjs         # Sessions, scrypt upgrades, email verification, rate limits
    └── support/load-ts.mjs       # Real TypeScript source & route module loader
```

---

## 🧪 Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts local Next.js development server with Turbopack |
| `npm run build` | Compiles optimized production bundle and runs static analysis |
| `npm run start` | Runs the compiled production server |
| `npm run lint` | Runs ESLint checks across the codebase |
| `npm test` | Runs the native Node.js automated unit test suite (`tests/*.test.mjs`) |

---

## 🤝 Contributing

Contributions, feature suggestions, and bug reports are welcome!
1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request
