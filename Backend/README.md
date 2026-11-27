# SwiftRide Backend

Node.js + Express + MongoDB backend with JWT auth, ride lifecycle, socket events, and maps integration.

## Setup

```bash
cd Backend
npm install
node server.js
```

## Environment Variables

```
PORT=3000
NODE_ENV=production
DB_CONNECT=your_mongodb_uri
# At least 32 random characters. In production the server refuses to start without it.
JWT_SECRET=your_long_random_secret
# Websites allowed to call the API (comma-separated). Required: without it the app can't reach the API.
CORS_ORIGINS=https://swiftride-red.vercel.app
# Maps need no key: free OpenStreetMap services (fair use). Point these at your
# own servers when traffic grows (all open source):
# PHOTON_URL=https://photon.komoot.io
# OSRM_URL=https://routing.openstreetmap.de/routed-car
# ROUTE_TRAFFIC_FACTOR=1.6
# Licence/vehicle checks. Only "test" exists until a DigiLocker/KYC provider is signed up.
VERIFICATION_PROVIDER=test
# Long random string; the team enters it on /admin/review. Admin routes are off without it.
ADMIN_KEY=your_admin_key
# Leave unset: a person approves every new captain. "true" lets a clear face match approve on its own
# (only once real licence and vehicle checks are connected).
# VERIFICATION_AUTO_APPROVE=true
# Optional: a Slack, Discord or Google Chat incoming-webhook URL. Each safety alert pings it
# (alert type and time only) so it reaches the team's phones.
# SAFETY_WEBHOOK_URL=https://hooks.slack.com/services/...
# The website's address, used for the link in that ping (defaults to the first CORS_ORIGINS entry).
# APP_URL=https://swiftride-red.vercel.app
```

The website reads its contact details for the Help, Terms and Privacy pages from its own settings (Vercel → Environment Variables). Until they're set, the pages show a highlighted "[To be added]":

```
VITE_COMPANY_NAME=Your company's legal name
VITE_COMPANY_ADDRESS=Registered address
VITE_SUPPORT_EMAIL=support@yourdomain
VITE_SUPPORT_PHONE=+91 ...
VITE_GRIEVANCE_OFFICER=Name of the grievance officer
VITE_GRIEVANCE_EMAIL=grievance@yourdomain
VITE_LEGAL_CITY=City whose courts handle disputes
```

## Maps (no Google, no billing)

- **Map tiles:** the app draws maps with MapLibre on OpenFreeMap tiles (OpenStreetMap data). It's free, needs no API key, and allows commercial use.
- **Search and addresses:** Photon (`services/geo.js`) handles search, current-location addresses and the nearest station. Searches are biased to the rider's position and limited to India. Typing "park street metro" also looks for stations named "Park Street", and shows those first.
- **Roads, distance and time:** OSRM. Free-flow times are multiplied by `ROUTE_TRAFFIC_FACTOR` (default 1.6) to allow for Indian city traffic. If routing is down, fares fall back to a straight-line estimate so booking never breaks.
- **Load on the free servers:** answers are cached and requests are spaced out, to respect the free services' fair-use rules. At scale, run Photon and OSRM yourself and set `PHOTON_URL` and `OSRM_URL`.

## Dispatch (`services/dispatch.js`)

- **How the search spreads:** captains' live locations are indexed in H3 hexagons (resolution 8, about 0.7 km²). A request first searches the ring around the pickup and widens ring by ring: about 0.9, 1.8, 2.8, 3.7 and 5.5 km for bikes and autos, up to about 8.3 km for cabs.
- **How offers go out:** each wave offers the ride to the best 3 captains at once, live over Socket.IO, with a 15-second accept window. A decline moves to the next captains immediately; an ignored offer times out. Only captains who were offered a ride can accept it. Requests close after 10 minutes with nobody.
- **Ranking:**
  - pickup time by road (one OSRM "table" request per wave for the 10 nearest eligible captains, so a captain across a river or a flyover doesn't count as "near"),
  - plus 3 minutes for each star of difference between the captain's and the rider's ratings (smoothed averages), so well-rated riders get well-rated captains,
  - plus penalties for low acceptance and dropped rides,
  - minus a small boost for captains who've waited longest.
- **Women's safety rules are hard filters:** women-only requests go only to confirmed women captains. If none is found for 90 seconds, the rider can open the ride to any verified captain. A confirmed woman captain on "women riders only" never gets other riders.
- **Background scheduler:** it runs due waves every 2 seconds and picks up open requests after a restart.

## Pickup ETA ("Ravi is 6 mins away")

- **One number, computed on the server:** the captain's offer card, the rider's chip and the captain's own banner all show the same ETA.
  - **At offer time:** the dispatcher gets each captain's road time to the pickup.
  - **On accept:** that exact ETA becomes the rider's first "X min away".
  - **While the captain drives in:** the server recalculates every 15 s or 100 m and pushes the same answer (`captain-eta`) to both apps.
- **The calculation:** OSRM's fastest road time × `ROUTE_TRAFFIC_FACTOR` (default 1.6), rounded to the nearest minute and never shown below 1 min. The rider sees "almost here" under 60 s, then "has arrived" once the captain taps arrived.
- **Pickup snapping:** a pickup is matched to up to 3 road points within 60 m (for example a flyover deck and the street below it), and the quickest one to reach is used. Without this, a pickup beside the Park Street flyover sent a captain 115 m away on a 2.5 km detour.
- **When the free router is slow or says "429 Too Many Requests":**
  - **Back-off:** the server leaves it alone for 30 s after a 429, or 10 s after a timeout.
  - **Smooth fallback:** during an approach, it scales the last real road time by how much closer the captain has come.
  - **Estimates are marked:** any estimated ETA is shown with "~".
  - **Caching:** road times are cached for 30 s.

## Pilot safety and contact

- **Every new captain is checked by a person.** The licence and vehicle checks only test number formats until a DigiLocker or KYC provider is connected. So even a clear face match waits at `/admin/review`, where the reviewer calls the captain, sees the original licence, RC, insurance, fitness, permit and police verification, and must tick all three checks before Approve works (the server refuses approval otherwise). Women-captain confirmations also go to a person.
- **Safety alerts reach the team.** SOS presses, silent alerts, unanswered or "I need help" check-ins, "I don't feel safe" and wrong-driver reports appear on the **Safety alerts** tab of `/admin/review`. It refreshes every 10 seconds, beeps and shows a pop-up for new alerts, and gives one-tap calls to the rider, their trusted contacts and the captain, plus the live trip link and map points. The team marks an alert "I'm on it", then resolves it with a note of what happened. With `SAFETY_WEBHOOK_URL` set, each alert also pings the team chat, without names, numbers or places. The rider app says plainly that alerts go to the SwiftRide team and that 112 is the fastest help, and it only says "sent" once the server has the alert.
- **Phone numbers:** asked at sign-up (10-digit Indian mobile, not yet verified by SMS). Rider and captain see each other's number only from accept until the ride ends; ride offers, history and share links never include it.
- **Keeping captains online:** while a captain is online or on a trip, the app keeps the phone screen on (Screen Wake Lock), shows a "keep SwiftRide open" reminder where the phone refuses, and says so when the app was in the background long enough to miss offers.
- **Legal pages:** `/terms`, `/privacy` and `/support` are drafts written from what the app does today, marked "Draft for legal review". Have a lawyer check them before public launch.

## Security

- **Logins:** tokens carry the account's role (rider or captain) and a version number. Logging out, changing a password or "log out on all devices" revokes them. Logged-out tokens are stored only as hashes. Logins never reveal whether an email has an account.
- **Passwords:** 8–72 characters, with a letter and a number, hashed with bcrypt (cost 12).
- **Requests:** security headers (helmet), CORS limited to `CORS_ORIGINS`, and rate limits. Logins and sign-ups allow 20 failures per 15 minutes; map and face-check calls are limited separately. Every input is validated, MongoDB operator injection (`$ne`, `$gt`…) is blocked, and errors never include internal details.
- **Live updates (Socket.IO):** a socket must prove who it is with its login token. Captains can only move themselves, at most one update every 2 seconds, and locations only reach the rider of their own active ride.
- **Rides:** each step (accept → arrive → start → end → pay) only works from the right previous step and for the right person, as a single atomic update. The ride PIN allows 5 tries. A rider has one active ride at a time, a captain holds one ride at a time, and unanswered requests expire after 10 minutes.
- **Abuse limits:** one report of each kind per ride. "Wrong driver" can only be reported at pickup. Ride Guarantee credit is capped at 3 times a week per rider, and every third ride a captain drops is a strike.

## Tests

`npm test` runs 77 tests against a throwaway in-memory MongoDB, covering security, the ride lifecycle, sockets, dispatch, the face engine, ratings, Ride Guarantee and the pilot checks (phone numbers, manual review, safety alerts). Map services are stubbed. GitHub Actions (`.github/workflows/ci.yml`) runs them, plus a dependency audit and the frontend lint and build, on every push.

## Captain verification

- **Once, after sign-up** (`POST /captains/verification`): licence number, date of birth, a licence photo, and live photos following a random challenge from `POST /captains/liveness-challenge` (straight, then two of turn left / turn right / look up / smile; single use, expires in 5 minutes). The licence and vehicle go through the verification provider (test-only for now; owner name isn't checked). The face engine (`services/faceEngine.js`, all MIT-licensed models running inside the server) then:
  - **decides with a ResNet face fingerprint** (face-api). On calibration photos the same person scored at most 0.556 apart and different people at least 0.574; at or below 0.50 is a match, 0.50–0.60 goes to review, above 0.60 is rejected;
  - **takes a second opinion** from Human's own fingerprint, and sends a match to review if it strongly disagrees;
  - **uses 48 stable face "dots" aligned in 3D as a red flag only**, because on their own they can't tell people apart;
  - **asks for a retake instead of guessing** when a photo is too unclear to fingerprint;
  - **checks liveness** from the mesh geometry: the right action, in the right order, by the same person, with no repeated photos, plus an anti-spoof score.

  The engine's answer is `verified`, `in_review` or `rejected` with reasons. A rejection stands; anything else waits for a person at `/admin/review` (see "Pilot safety and contact"), unless `VERIFICATION_AUTO_APPROVE=true`.
- **Every shift window** (`POST /captains/shift-selfie`): 6 AM–2 PM, 2 PM–10 PM, 10 PM–6 AM India time (`utils/shiftWindow.js`). The captain takes 2 live photos: straight, then one random action. They're matched against a gallery of the captain's last 5 verified selfies, so beards, glasses and ageing are handled, while staying close to the original verified face and the licence, so the gallery can't drift to someone else. Captains only get ride requests when verified and this window's check has matched.
- **Privacy:** the licence number is stored only as a keyed hash plus its last 4 digits. Photos are kept only until a reviewer decides. Face fingerprints are never sent to clients.
- **Thresholds** live in `config/faceThresholds.json`. Before launch, collect real licence and selfie pairs (with consent) in `calibration-data/<person>/`, which is git-ignored. Then run `npm run face:calibrate -- calibration-data --write`. It reports how well the engine separates people and rewrites the thresholds. It won't raise the auto-approve line above 0.50 until it has at least 20,000 different-person pairs.

## Data Models

### User
- `name.firstname`, `name.lastname`
- `email`, `phone`, `password`, `socketId`

### Captain
- `name.firstname`, `name.lastname`
- `email`, `phone`, `password`, `socketId`, `status`
- `vehicle.color`, `vehicle.model`, `vehicle.plate`, `vehicle.capacity`, `vehicle.vehicleType`
- `location` (GeoJSON Point)

### Ride
- `user`, `captain`, `origin`, `destination`
- `fare`, `status` (`requested`, `accepted`, `ongoing`, `completed`, `cancelled`)
- `otp` (hashed)
- `paymentStatus` (`pending`, `paid`)

## APIs

### Auth

Users:
- `POST /users/register`
- `POST /users/login`
- `GET /users/profile`
- `GET /users/logout`

Captains:
- `POST /captains/register`
- `POST /captains/login`
- `GET /captains/profile`
- `GET /captains/logout`

### Ride Flow

- `POST /rides/create` (user)
- `GET /rides/calculate-fare` (user)
- `POST /rides/confirm` (captain)
- `POST /rides/start-ride` (captain OTP)
- `POST /rides/end-ride` (captain)
- `POST /rides/complete-payment` (user)
- `GET /rides/:rideId` (user)

## Socket Events

- `join` (user/captain)
- `new-ride` (captain)
- `ride-confirmed` (user)
- `ride-started` (user)
- `ride-ended` (user)
- `payment-completed` (captain)
- `update-location-captain` (captain -> server)
- `captain-location` (server -> user)

## Algorithms and Logic

### Fare Calculation
Uses Google Distance Matrix API to compute distance and duration, then applies rate tables:

- Car: base 50, per km 18, per min 2
- Auto: base 30, per km 12, per min 1.5
- Moto: base 20, per km 8, per min 1

### Captain Matching
- Convert pickup to coordinates (Geocoding API)
- Query captains within radius using geo index
- Emit `new-ride` to each captain with socketId

### OTP Verification
- OTP is generated and bcrypt-hashed when ride is created
- Captain submits OTP to `/rides/start-ride`
- Server compares bcrypt hash and sets ride status to `ongoing`

### Live Tracking
- Captain emits `update-location-captain` with lat/lng and rideId
- Server stores location on captain and relays `captain-location` to the user

### End Ride + Payment
- Captain ends ride: status -> `completed`, emits `ride-ended`
- User completes payment: paymentStatus -> `paid`, emits `payment-completed`

3. `services/captain.services.js`
- Verifies required captain fields.
- Creates captain document.

4. `models/captain.models.js`
- Defines captain + vehicle schema.
- Provides `generateAuthToken()`, `comparePassword()`, and `hashPassword()` helpers.

## Base URL

If you run the backend locally with default settings:

- `http://localhost:3000`

## Endpoint Summary

| Method | Endpoint | Description |
|---|---|---|
| POST | `/users/register` | Register a new user and return user details with JWT token |
| POST | `/users/login` | Login an existing user and return user details with JWT token |
| GET | `/users/profile` | Get the currently authenticated user profile |
| GET | `/users/logout` | Logout the authenticated user and blacklist current token |

## Register User

### Endpoint

- **Method:** `POST`
- **Path:** `/users/register`
- **Full URL (local):** `http://localhost:3000/users/register`

### Request Headers

- `Content-Type: application/json`

### Request Body

```json
{
  "name": {
    "firstname": "Chetan",
    "lastname": "Sahney"
  },
  "email": "chetan@example.com",
  "phone": "98765 43210",
  "password": "mypassword123"
}
```

### Field Requirements and Validation

| Field | Type | Required | Validation |
|---|---|---|---|
| `name.firstname` | string | Yes | Minimum length: 3 |
| `name.lastname` | string | No | If provided, minimum length: 3 (schema-level) |
| `email` | string | Yes | Must be a valid email |
| `phone` | string | Yes | 10-digit Indian mobile starting 6–9; `+91`, a leading `0`, spaces and dashes are removed |
| `password` | string | Yes | 8–72 characters, with a letter and a number |

## Responses

### 201 Created (Success)

Returned when validation passes and user is created successfully.

```json
{
  "user": {
    "name": {
      "firstname": "Chetan",
      "lastname": "Sahney"
    },
    "email": "chetan@example.com",
    "socketID": null,
    "_id": "65f0abc1234567890abcde12",
    "__v": 0
  },
  "token": "<jwt_token_here>"
}
```

Notes:
- Password is hashed before saving.
- JWT token is generated with `JWT_SECRET` and expires in `1h`.

### 400 Bad Request (Validation Error)

Returned when request data fails route-level validation.

Example:

```json
{
  "errors": [
    {
      "type": "field",
      "msg": "firstname should be at least 3 characters long",
      "path": "name.firstname",
      "location": "body"
    }
  ]
}
```

Possible messages include:
- `firstname should be at least 3 characters long`
- `Please enter a valid email address`
- `Password should be at least 6 characters long`

### Other Failure Cases

In case of database or unexpected server errors, the current code does not define a custom JSON error response in this flow. You may receive Express/Mongoose default error behavior depending on the failure.

## Login User

### Endpoint

- **Method:** `POST`
- **Path:** `/users/login`
- **Full URL (local):** `http://localhost:3000/users/login`

### Request Headers

- `Content-Type: application/json`

### Request Body

```json
{
  "email": "chetan@example.com",
  "password": "mypassword123"
}
```

### Field Requirements and Validation

| Field | Type | Required | Validation |
|---|---|---|---|
| `email` | string | Yes | Must be a valid email |
| `password` | string | Yes | Minimum length: 6 |

### Responses

#### 200 OK (Success)

Returned when email exists and password matches.

```json
{
  "user": {
    "name": {
      "firstname": "Chetan",
      "lastname": "Sahney"
    },
    "email": "chetan@example.com",
    "password": "$2b$10$<hashed_password>",
    "socketID": null,
    "_id": "65f0abc1234567890abcde12",
    "__v": 0
  },
  "token": "<jwt_token_here>"
}
```

Note:
- Current implementation selects `+password` and returns `user` directly, so the hashed password is included in login response.

#### 400 Bad Request (Validation Error)

Returned when request data fails route-level validation.

Example:

```json
{
  "errors": [
    {
      "type": "field",
      "msg": "Not a valid email address",
      "path": "email",
      "location": "body"
    }
  ]
}
```

Possible messages include:
- `Not a valid email address`
- `Password should be at least 6 characters long`

#### 401 Unauthorized (Invalid Credentials)

Returned when email is not found or password is incorrect.

```json
{
  "error": "Invalid email or password"
}
```

## Get User Profile

### Endpoint

- **Method:** `GET`
- **Path:** `/users/profile`
- **Full URL (local):** `http://localhost:3000/users/profile`

### Authentication

This is a protected route.

Send token in either of these ways:
- Cookie: `token=<jwt_token>`
- Header: `Authorization: Bearer <jwt_token>`

### Request Body

No request body is required.

### Responses

#### 200 OK (Success)

Returned when token is valid and not blacklisted.

```json
{
  "_id": "65f0abc1234567890abcde12",
  "name": {
    "firstname": "Chetan",
    "lastname": "Sahney"
  },
  "email": "chetan@example.com",
  "socketID": null,
  "__v": 0
}
```

#### 401 Unauthorized

Returned when token is missing, invalid, expired, or blacklisted.

```json
{
  "message": "unAuthprised"
}
```

## Logout User

### Endpoint

- **Method:** `GET`
- **Path:** `/users/logout`
- **Full URL (local):** `http://localhost:3000/users/logout`

### Authentication

This is a protected route.

Send token in either of these ways:
- Cookie: `token=<jwt_token>`
- Header: `Authorization: Bearer <jwt_token>`

### Request Body

No request body is required.

### Responses

#### 200 OK (Success)

Returned when logout is successful.

```json
{
  "message": "Logged out successfully"
}
```

What happens on logout:
- `token` cookie is cleared.
- Current token is stored in `blacklistTokens` collection.
- Blacklisted token becomes unusable for protected routes.

#### 401 Unauthorized

Returned when token is missing, invalid, expired, or blacklisted.

```json
{
  "message": "unAuthprised"
}
```

## End-to-End Flow (How It Works)

1. `routes/users.routes.js`
- Validates request body using `express-validator`.
- Calls `userController.register` for `/register`.
- Calls `userController.login` for `/login`.
- Protects `/profile` and `/logout` using `authMiddleware.authUser`.

2. `controllers/user.controllers.js`
- Register flow reads validation result, hashes password using `userModel.hashPassword(password)`, calls `userService.createUser(...)`, generates JWT using `user.generateAuthToken()`, and returns `201` with `{ user, token }`.
- Login flow reads validation result, finds the user by email with password selected, compares password using `user.comparePassword(password)`, generates JWT using `user.generateAuthToken()`, and returns `200` with `{ user, token }`.
- Profile flow returns `req.user` as the authenticated user.
- Logout flow clears auth cookie, blacklists the current token, and returns success message.

3. `services/user.services.js`
- Checks required fields: `firstname`, `email`, `password`.
- Creates user document using `userModel.create(...)`.

4. `models/user.models.js`
- Defines schema for `name`, `email`, `password`, `socketID`.
- Defines helpers:
  - `generateAuthToken()`
  - `comparePassword(password)`
  - `hashPassword(password)`

5. `middleware/auth.middleware.js`
- Reads token from cookie or Bearer header.
- Rejects blacklisted tokens.
- Verifies JWT and attaches user to `req.user`.

6. `models/blacklistTokens.model.js`
- Stores logged-out tokens so they cannot be reused.

## Example cURL Requests

```bash
curl -X POST http://localhost:3000/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": {
      "firstname": "Chetan",
      "lastname": "Sahney"
    },
    "email": "chetan@example.com",
    "password": "mypassword123"
  }'
```

```bash
curl -X POST http://localhost:3000/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "chetan@example.com",
    "password": "mypassword123"
  }'
```

```bash
curl -X GET http://localhost:3000/users/profile \
  -H "Authorization: Bearer <jwt_token_here>"
```

```bash
curl -X GET http://localhost:3000/users/logout \
  -H "Authorization: Bearer <jwt_token_here>"
```

## Quick Checklist Before Testing

- `DB_CONNECT` is set in `.env`
- `JWT_SECRET` is set in `.env`
- MongoDB is running
- Backend server is running (`node server.js` or `npx nodemon server.js`)
