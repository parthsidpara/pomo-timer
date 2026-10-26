# Worklog

A private, single-user work-session tracker. Start a timer with an optional
label and tag, pause or resume it, and stop it whenever you want. A separate
analysis view shows daily and weekly patterns. There are no planned durations,
goals, ratings, notes, or completed flags. A session with no label is shown as
“Untitled session.”

The same log is available to Claude through a remote MCP server:

- Start, pause, resume, and stop sessions.
- Read the current session.
- List sessions in a date range.
- Summarize active minutes by IST day and tag.

The web app and MCP server share one session service, so the "one running
session" rule and active-time arithmetic behave identically from both places.

## Stack

- Next.js 16 (App Router, TypeScript) on Vercel Hobby
- Cloud Firestore on the Firebase Spark plan
- Firebase Auth with Google sign-in
- Firebase Admin SDK for server writes and auth verification
- `mcp-handler` 2.x for a stateless Streamable HTTP MCP endpoint
- Vitest for the shared logic tests

No Cloud Functions are used.

## Architecture

```
Browser
  ├─ reads sessions directly from Firestore (owner-only security rules)
  ├─ live onSnapshot subscription
  └─ POST /api/sessions/* with a Firebase ID token
                              │
                              ▼
                       SessionService
                              │
Claude ── /api/mcp ───────────┤
  (static bearer token)       ▼
                    Firestore Admin transaction
                    + meta/runtime active pointer
```

The browser never counts a timer locally. It computes elapsed active time from
the stored Firestore timestamps and re-renders once per second. Closing the tab
does not affect the session.

Web writes go through Next route handlers rather than direct browser writes so
they can call the same transactional `SessionService` as MCP. The Firestore
security rules still allow the owner to read and write `sessions` as requested,
but the app and MCP are the supported write paths.

### Key files

```
app/(app)/layout.tsx                  persistent auth shell + navigation
app/(app)/page.tsx                    timer and recent ledger
app/(app)/analysis/page.tsx           analysis route
app/api/mcp/route.ts                  stateless MCP endpoint
app/api/sessions/[action]/route.ts    web writes: start/pause/resume/stop
components/app-nav.tsx                desktop links + mobile bottom navigation
components/worklog-shell.tsx          auth, live sessions, sign-out gate
components/analysis-page.tsx          analysis query + live updates
components/bar-chart.tsx              accessible CSS bar chart
lib/session-service.ts                shared state transitions + summaries
lib/firestore-store.ts                Admin SDK transactions and queries
lib/analysis.ts                       daily/weekly buckets and statistics
firestore.rules                       owner-only security rules
lib/mcp-tools.ts                      seven MCP tools
lib/mcp-auth.ts                       constant-time bearer token check
lib/ist-dates.ts                      IST parsing and display helpers
tests/                                timer, analysis, auth, and date tests
public/sw.js                          pass-through PWA service worker
```

## Data model

```
sessions/{uuid}
  id              string          UUID, also the document ID
  start           timestamp       UTC
  end             timestamp|null  null while running
  paused_seconds  number          accumulated completed pauses
  paused_at       timestamp|null  set only while currently paused
  label           string          optional; empty string when omitted
  tag             string|null     optional
```

There is also one internal document:

```
meta/runtime
  active_session_id  string|null
```

It exists only to make the single-active-session rule atomic. Every
start/pause/resume/stop runs in a Firestore transaction that reads this
document, so two simultaneous starts cannot both succeed. Client rules deny
access to `meta`; only the Admin SDK uses it.

### Active time

```
active seconds = (end ?? now) - start - paused_seconds
                 - ((end ?? now) - paused_at)   // only while paused
```

While paused, the wall-clock span and the current pause grow at the same rate,
so active time stays fixed. Stopping while paused commits the final pause.
Early stops and long sessions are normal and are visible in the actual active
duration.

Everything is stored in UTC. The app and MCP responses display and group times
in **Asia/Kolkata (IST, UTC+05:30)**.

## Setup

### Prerequisites

- Node.js **22.12 or newer** (use Node 22.x on Vercel)
- A Firebase project on the **Spark** plan
- A Vercel Hobby account
- A Claude plan/client that supports custom remote MCP connectors with request
  headers

Dependency pins matter here:

- The Firebase web SDK is pinned to `12.x` because the 13.x line requires Node
  24.12+, while this project targets Node 22.
- `firebase-admin` is pinned to **13.10.0**. Version 14 pulls
  `jwks-rsa@4` → `jose@6`, which is ESM-only and crashes Next's external module
  loader on Vercel's Node 22 runtime with `ERR_REQUIRE_ESM`. Version 13.10 uses
  the CommonJS-compatible `jose@4`. Don't upgrade it without testing a Vercel
  deployment, not just a local build.

Keep those pins in mind before upgrading dependencies.

### 1. Create the Firebase project

1. Create a project in the [Firebase console](https://console.firebase.google.com/).
2. Add a **Web app** to the project.
3. Create a **Cloud Firestore** database in production mode. Choose a region
   close to you; this cannot be changed later. No custom indexes are required.
4. Go to **Authentication → Sign-in method**, enable **Google**, and choose a
   support email.
5. Open **Project settings → General → Your apps → Web app** and copy the API
   key, auth domain, project ID, and app ID.

The four `NEXT_PUBLIC_FIREBASE_*` values are public browser configuration, not
secrets.

### 2. Find your owner UID and set the rules

The app allows exactly one Firebase Auth UID.

1. Fill the four web config values in `.env.local` and start the app (see
   [Local development](#local-development)).
2. Sign in with Google. Before rules are configured, the app shows a
   **"This ledger is private"** screen containing the signed-in UID. You can
   also find it under **Authentication → Users** in the Firebase console.
3. Replace `REPLACE_WITH_OWNER_UID` in `firestore.rules` with that UID.
4. Set `OWNER_UID` to the same UID in `.env.local` and Vercel.
5. Deploy the rules.

Rules are in [`firestore.rules`](./firestore.rules). The essential part:

```javascript
function isOwner() {
  return request.auth != null
    && request.auth.uid == 'YOUR_OWNER_UID';
}

match /sessions/{sessionId} {
  allow read, write: if isOwner();
}

match /meta/{documentId} {
  allow read, write: if false;
}

match /{document=**} {
  allow read, write: if false;
}
```

Deploy with the Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
firebase use --add          # select your project
firebase deploy --only firestore:rules
```

Or paste the rules into **Firestore → Rules** in the console.

Any other Google account that completes sign-in can get a Firebase Auth user,
but it cannot read or write any Firestore data, and every web/MCP write is also
checked against `OWNER_UID`. The web app shows that account a private-ledger
screen with a sign-out option.

If you want to stop other Google accounts from completing sign-in at the
provider level, set the Google Cloud **OAuth consent screen** to *Testing* and
add only your address as a test user (or use an Internal app in Google
Workspace). Testing mode can require more frequent re-authentication. Blocking
functions are a Cloud Functions feature, so they are intentionally not used on
the Spark plan.

### 3. Create a service account

In **Firebase console → Project settings → Service accounts**, choose
**Generate new private key**. Store the JSON outside the repository.

Encode it for the server environment:

```bash
# macOS / Linux
base64 -w0 service-account.json
# macOS alternative
base64 -i service-account.json | tr -d '\n'
# PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account.json"))
```

Put the result in `FIREBASE_SERVICE_ACCOUNT_BASE64`. It is server-only
configuration; never prefix it with `NEXT_PUBLIC_`.

### 4. Environment variables

Copy `.env.example` to `.env.local` and fill it in:

| Variable | Public? | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | yes | Firebase web app config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | yes | Firebase web app config |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | yes | Firebase web app config |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | yes | Firebase web app config |
| `OWNER_UID` | no | The only UID allowed to use the API |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | no | Admin SDK credentials |
| `MCP_BEARER_TOKEN` | no | Static token for `/api/mcp` (header or `?key=` fallback) |
| `MCP_ALLOWED_ORIGINS` | no | Extra origins for the MCP Origin check (CORS is not enabled) |

Generate the MCP token with:

```bash
openssl rand -hex 32
```

`NEXT_PUBLIC_*` values are baked into the client build. Rebuild or redeploy
after changing them.

### 5. Local development

```bash
npm install
cp .env.example .env.local
# fill in .env.local
npm run dev
```

Open `http://localhost:3000`.

For local sign-in, `localhost` must be listed under **Authentication → Settings
→ Authorized domains**. It normally is by default.

Useful checks:

```bash
npm test
npx tsc --noEmit
npm run build
```

## Deploy to Vercel

1. Push the repository to GitHub/GitLab and import it in Vercel.
2. Set the project's Node.js version to **22.x**.
3. Add all variables from `.env.example` for the Production environment
   (and Preview if you use it).
4. Deploy. Next.js is detected automatically; the default build command and
   output work.
5. Add the deployed domain to **Firebase Authentication → Settings →
   Authorized domains** (for example `worklog.vercel.app` or your custom
   domain).
6. If you change any `NEXT_PUBLIC_*` value, redeploy so the browser bundle gets
   the new value.

All API routes declare `maxDuration = 10` to stay within the Hobby default.
Firestore operations are small and the MCP endpoint is stateless; no Redis or
background workers are used.

### Vercel firewall and deployment protection

The default Vercel WAF/DDoS protections do not block ordinary HTTPS calls to
this endpoint. Two settings can block Anthropic:

- **Deployment Protection**: do not enable *All Deployments* protection for the
  production domain. Use Standard Protection/unprotected production, and test
  the connector URL from a private browser window. If Vercel shows a login page
  instead of the MCP endpoint, Anthropic will see that page too.
- **Custom firewall deny rules**: firewall rules are opt-in. If you have a
  custom rule restricting inbound traffic, allow Anthropic's published outbound
  range. At the time of writing that is IPv4 `160.79.104.0/21`. Re-check
  [Anthropic's IP address page](https://platform.claude.com/docs/en/api/ip-addresses)
  before relying on it.

A quick public reachability check:

```bash
curl -i -X POST https://YOUR_DOMAIN/api/mcp \
  -H 'Content-Type: application/json' \
  -d '{}'
```

You should get the app's `401 {"error":"Unauthorized."}`, not a Vercel login or
a network error.

## Add the MCP server to Claude

1. Set `MCP_BEARER_TOKEN` in Vercel and redeploy.
2. In Claude, open **Customize → Connectors → Add custom connector** (wording
   may vary slightly by client).
3. Name it `Worklog`.
4. Remote MCP server URL:

   ```
   https://YOUR_DOMAIN/api/mcp
   ```

5. Authentication: choose **No sign in**. This server does not use OAuth.
6. Send the token using whichever option your Claude client supports:

   **Preferred — request header:**

   ```
   Authorization: Bearer YOUR_MCP_BEARER_TOKEN
   ```

   If your Claude build has a **Request headers** section, use that and keep
   the URL as `https://YOUR_DOMAIN/api/mcp`.

   **Fallback — token in the URL:**

   ```text
   https://YOUR_DOMAIN/api/mcp?key=YOUR_MCP_BEARER_TOKEN
   ```

   Use this only when the client has no request-header field. The token becomes
   part of the capability URL and can appear in Vercel/Cloudflare request logs.
   Never share that URL. Leave the request headers empty in this mode.

7. Add the connector, then enable it for a conversation from the tools/connector
   menu.

The token is sent on every request. Treat it as full access to your worklog:
anyone with the token can start, pause, stop, and read sessions. If it leaks,
change `MCP_BEARER_TOKEN`, redeploy, and update the request header or connector
URL in Claude.

Anthropic connects from its cloud infrastructure, not from your browser. The
endpoint must therefore be publicly reachable. The static token is the access
control; no OAuth metadata endpoints are implemented.

### Test the endpoint locally

Unauthenticated requests are rejected:

```bash
curl -i -X POST http://localhost:3000/api/mcp \
  -H 'Content-Type: application/json' \
  -d '{}'
# HTTP 401, {"error":"Unauthorized."}
```

A valid initialize request reaches the MCP handler. Use either the header:

```bash
curl -i -X POST http://localhost:3000/api/mcp \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'
```

or the URL fallback:

```bash
curl -i -X POST 'http://localhost:3000/api/mcp?key=YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'
```

The handler also serves the current 2026-07-28 stateless MCP protocol and older
Streamable HTTP clients through its compatibility path. GET/DELETE session
operations are not used; the endpoint is stateless.

## MCP tools

| Tool | Behavior |
| --- | --- |
| `start_session(label?, tag?)` | Starts a session with an optional label and tag. Returns a clear error if one is already running. |
| `pause_session()` | Pauses the running/paused session. Errors if already paused. |
| `resume_session()` | Resumes a paused session. Errors if not paused. |
| `stop_session()` | Stops the session and returns start, end, active minutes, paused minutes, label, and tag. |
| `current_session()` | Returns the running/paused session with its active time, or `null`. |
| `list_sessions(from, to, tag?, min_minutes?)` | Lists sessions whose start is in the inclusive range. |
| `summary(from, to)` | Returns active minutes by IST day and tag, count, total, and average session length. |

Timestamps in tool output are ISO 8601 with the `+05:30` offset. Active and
paused minutes are rounded to one decimal place. `active_seconds` is also
included where useful.

### Date and grouping rules

- `from` and `to` are required ISO values.
- A date-only value like `2026-10-01` means the entire IST day:
  `00:00:00.000` through `23:59:59.999` in Asia/Kolkata. The `to` day is
  included.
- A datetime without an offset, such as `2026-10-01T09:30:00`, is interpreted
  as IST.
- A datetime with `Z` or an explicit offset is treated as that exact instant.
- Sessions are selected by **start time** inside the range.
- Summary days and tags are grouped by the session's **start date** in IST.
  A session crossing midnight belongs entirely to its start day.
- A running session is included in `summary` with its active time so far.
  Average length therefore includes any running session.
- Untagged sessions are grouped under `(untagged)`. Tag filtering is exact and
  case-sensitive.
- `min_minutes` filters on active minutes, excluding pauses.
- `list_sessions` returns newest first and guards the query at 1,000 sessions.

The timer page's history shows the latest 50 sessions.

## Analysis

The **Analysis** tab (`/analysis`) uses completed sessions only; the running
session stays on the timer screen so averages are stable.

- **Daily** — active time for the last 7 days in IST, including today.
- **Weekly** — active time for the last 8 Monday–Sunday weeks.
- **Summary** — total active time, session count, average session length, and
  longest session over the last 8 weeks.
- **By tag** — active time per tag over the same period, including untagged
  sessions.

Charts group a session by its start day or week. Pauses are excluded from all
durations. The analysis page runs its own live Firestore query for the
8-week window (up to 1,000 sessions), so it is not limited to the 50 sessions
shown in the timer history.

On mobile, a fixed bottom navigation bar switches between **Timer** and
**Analysis**, with safe-area padding and an active-tab indicator. Desktop uses
compact navigation in the top bar.

## PWA

The app includes a web manifest, 192/512/maskable icons, an Apple touch icon,
and a minimal service worker. Use the browser's **Install** or **Add to Home
Screen** command; the installed app opens standalone.

The service worker is intentionally pass-through and caches nothing. There is
no offline mode: Firestore and the API remain the source of truth.

The interface follows the operating system's color scheme by default. The
top-bar theme button switches between light and dark, and saves that choice in
local storage.

## Security notes

- Firestore rules allow the owner UID only; every other path is denied. The
  internal `meta/runtime` lock is inaccessible to browser clients.
- Web API routes verify a Firebase ID token with the Admin SDK and compare the
  UID to `OWNER_UID`. Other signed-in Google accounts receive `403`.
- MCP requests require `Authorization: Bearer <MCP_BEARER_TOKEN>` or, for
  clients without a request-header UI, the `key` query parameter. The token is
  compared in constant time and must be set in the environment. If it is not
  set, the endpoint fails closed. Prefer the header; a query token appears in
  request logs and makes the connector URL itself a secret.
- The MCP endpoint accepts an `Origin` header only from the app's own origin,
  Claude's web origins, or entries in `MCP_ALLOWED_ORIGINS`. Server-to-server
  Anthropic requests normally have no `Origin` header. CORS is intentionally
  not enabled; this is a server-to-server connector.
- The service account JSON is used only by server code. Do not expose it to the
  browser and do not commit it.
- Firebase web API keys are public configuration; security is enforced by Auth
  and rules.
- The static MCP token is simpler than OAuth by design, but it is a bearer
  credential. Rotate it if it is ever shared or logged.

## Tests

```bash
npm test
```

The 36 tests cover:

- Active time while running, paused, resumed, and stopped while paused.
- Pause accumulation and final pause commits.
- Date-only and datetime parsing in IST, explicit offsets, invalid/reversed
  ranges.
- Inclusive date-range filtering, tag filtering, and `min_minutes`.
- Summary totals, per-day grouping, per-tag grouping, and averages.
- Start/pause/resume/stop transitions, starting while another session is
  running, and starting an untitled session.
- MCP header authentication and the `?key=` fallback, including missing/wrong
  credentials, missing server configuration, and disallowed origins.
- Shared Firestore document mapping used by both the browser and Admin SDK,
  including untitled sessions and documents without a start timestamp.
- Analysis day/week bucketing in IST, zero-filled daily and weekly series,
  completed-only summaries, averages, and tag totals.
- Two concurrent starts: exactly one succeeds (the in-memory test store
  serializes transactions like Firestore).

There is no automated emulator test for Firestore/Auth because the project is
meant to run against your Firebase project. The production build and API/MCP
smoke tests are run separately.

## Troubleshooting

**"This ledger is private" immediately after signing in**
`firestore.rules` is still using the placeholder or a different UID. The screen
shows the signed-in UID; use that exact value in both `firestore.rules` and
`OWNER_UID`, deploy the rules, and restart/redeploy.

**Web actions return 401 or 403**
401 means your Firebase ID token is missing or expired; sign in again. 403 means
`OWNER_UID` does not match the signed-in UID. MCP does not use these routes.

**`auth/unauthorized-domain`**
Add the current origin (`localhost:3000`, the Vercel domain, your custom domain)
under Authentication → Settings → Authorized domains in Firebase.

**"Firebase is not configured"**
The `NEXT_PUBLIC_FIREBASE_*` values were missing when the app was built. Set
them and rebuild/redeploy; changing only a runtime secret will not fix them.

**Claude cannot connect / 401**
Check that the connector URL ends in `/api/mcp`, that Authentication is "No sign
in", and that either the request header is exactly
`Authorization: Bearer <token>` or the URL contains the matching `?key=<token>`.
Confirm `MCP_BEARER_TOKEN` is present in the Vercel Production environment and
redeploy. If the token was ever posted in a screenshot or log, rotate it.

**Claude sees a Vercel login page**
Deployment Protection is gating the production URL. Disable All Deployments
protection (or use a public production domain) and test the URL with `curl`.

**MCP tool returns a generic server error**
Check Vercel function logs. The most common causes are a missing/invalid
`FIREBASE_SERVICE_ACCOUNT_BASE64` or a Firestore rules/permission problem. MCP
uses the Admin SDK, so its Firestore access bypasses client rules; web reads do
not.

**A session seems missing**
Sessions are selected by start time. A session that started before `from` is
outside the range even if it ended inside it. The web app only shows the latest
50 sessions.

## Free-plan limits and intentional omissions

- No Cloud Functions, scheduled jobs, or background workers.
- One owner, one login provider, one running session.
- No goals, planned durations, ratings, notes, completed flags, editing, or
  deletion UI.
- No offline cache. The PWA is installable but requires a connection.
- Serverless routes target the Vercel Hobby 10-second default.
