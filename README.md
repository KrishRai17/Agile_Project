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
   git clone https://github.com/iamcrush7/AgileProject.git
   cd AgileProject   # or ECP-main if you downloaded the zip
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
| `HOPON_DEMO_PASSWORD` | No | Overrides the demo accounts' password. |
| `HOPON_PERSIST_FILE` | No | Path of a JSON file where offers and requests are saved so they survive restarts (e.g. `.data/hopon-store.json`). |

> **Storage note:** rides live in server memory (optionally snapshotted to `HOPON_PERSIST_FILE`). That is fine for a single-server pilot, but serverless hosts and multi-instance deployments need a real database; rate limiting is also per-process.

---

## 🔌 API Overview

All endpoints except `/api/auth/login` and `/api/auth/logout` require a signed-in session.

| Endpoint | Who | Purpose |
|---|---|---|
| `POST /api/auth/login` | anyone | Sign in (rate limited); sets the session cookie |
| `POST /api/auth/logout` | anyone | Clears the session cookie |
| `GET /api/auth/me` | signed in | Current user from the session |
| `GET /api/geocode?q=` | signed in | Place search (proxy, cached, rate limited) |
| `GET /api/geocode/reverse?lat=&lng=` | signed in | Reverse geocoding (proxy, cached, rate limited) |
| `GET /api/route?points=lng,lat;lng,lat` | signed in | Road route (OSRM proxy with fallback) |
| `GET /api/rides/offers` | signed in | Active ride offers |
| `POST /api/rides/offers` | **drivers** | Post a ride offer |
| `GET/POST/PATCH /api/rides/requests` | signed in | Your own requests / driver inbox; create or cancel a request |
| `PATCH /api/rides/requests/respond` | **drivers** | Accept or decline a request |
| `GET /api/rides/location?driverId=` | that driver, or a passenger they accepted | Driver's live location |
| `POST /api/rides/location` | **drivers** | Update your own live location |

---

## 📁 Project Architecture

```
ECP-main/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/route.ts    # Credential check, rate limiting, signed session cookie
│   │   │   ├── logout/route.ts   # Clears the httpOnly session cookie
│   │   │   └── me/route.ts       # Current user from the session
│   │   ├── geocode/route.ts      # Nominatim proxy: auth, validation, rate limit, bounded cache
│   │   ├── geocode/reverse/route.ts  # Reverse geocoding proxy with campus gate naming
│   │   ├── rides/
│   │   │   ├── offers/route.ts   # List / post ride offers (drivers only to post)
│   │   │   ├── requests/route.ts # Create, list and cancel ride requests
│   │   │   ├── requests/respond/route.ts  # Driver accepts / declines
│   │   │   └── location/route.ts # Driver live location (access controlled)
│   │   └── route/route.ts        # OSRM road geometry & fallback waypoint generator
│   ├── home/
│   │   └── page.tsx              # Main dashboard: left panel, map, campus rides
│   ├── login/
│   │   └── page.tsx              # University student sign-in portal
│   ├── globals.css               # Design system, MapLibre styles & animations
│   ├── layout.tsx                # Root layout with ToastProvider
│   └── page.tsx                  # Root router with auth verification
├── components/
│   ├── HopOnNavbar.tsx           # Campus navigation & user profile dropdown
│   ├── GetRidePanel.tsx          # Find ride, offer seats, and fare selector
│   ├── MapLibreMap.tsx           # Vector map, safe DOM popups, vehicle rendering
│   ├── MapWrapper.tsx            # Client-side dynamic loader for MapLibre
│   ├── LoginForm.tsx             # Accessible sign-in form
│   ├── ActivityModal.tsx         # Trip history modal with student receipts
│   ├── ToastContext.tsx          # Campus toast notification system
│   └── UpcomingRide.tsx          # Booked carpool summary card
├── lib/
│   ├── auth.ts                   # Client user cache, logout() and syncSession()
│   ├── session.ts                # HMAC-signed session tokens (server only)
│   ├── accounts.ts               # Demo account directory + password check (server only)
│   ├── apiAuth.ts                # requireUser(), JSON parsing, 429 helper for routes
│   ├── rateLimit.ts              # Fixed-window rate limiter (bounded memory)
│   ├── limiters.ts               # Shared limiter instances for the API routes
│   ├── ttlCache.ts               # Size-bounded cache with expiry
│   ├── validate.ts               # Input validation helpers
│   ├── campus.ts                 # KJU coordinates, gates and distance helpers
│   ├── rideStore.ts              # Offers, requests, live locations (+ pruning, optional persistence)
│   ├── routeUtils.ts             # Curved fallback route geometry
│   ├── mapData.ts                # Bengaluru locations, vehicle anchors & formulas
│   ├── mockData.ts               # Student activity data & campus quick actions
│   ├── useGeolocation.ts         # Browser GPS geolocation hook
│   └── useNominatimSearch.ts     # Client search hook querying /api/geocode
└── tests/
    ├── core.test.mjs             # Haversine, pricing, bearing
    ├── rideStore.test.mjs        # Seats, open requests, access rules, pruning
    ├── security.test.mjs         # Sessions, accounts, rate limiting, cache, validation
    ├── persist.test.mjs          # Snapshot / restore across a simulated restart
    └── support/load-ts.mjs       # Loads the real TypeScript sources for tests
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
