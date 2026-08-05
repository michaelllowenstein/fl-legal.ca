# fl-legal-api

Fastify + TypeScript REST API for the Fric, Lowenstein & Co. LLP website.

## Stack

| Layer        | Choice                              |
|--------------|-------------------------------------|
| Runtime      | Node.js 20+                         |
| Language     | TypeScript 5                        |
| Framework    | Fastify 4                           |
| Database     | Firebase Realtime Database          |
| Auth         | JWT (`jsonwebtoken`) + Firebase ID token verification |
| Passwords    | `bcrypt` (cost factor 12)           |
| Email        | Nodemailer (any SMTP)               |
| Validation   | Fastify JSON Schema (ajv)           |

---

## Quick Start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# Edit .env — every required variable has a comment explaining it

# 3. Add Firebase service account
# Download from Firebase Console → Project Settings → Service Accounts
# Save as firebase-service-account.json (it is gitignored)

# 4. Hash the editor (secretary) password
node -e "require('bcrypt').hash('your-password', 12).then(console.log)"
# Paste the output into EDITOR_PASSWORD_HASH in .env

# 5. Run dev server (hot-reload)
npm run dev

# 6. Build for production
npm run build
npm start
```

---

## API Reference

### Auth

| Method | Path                         | Body                          | Auth   | Returns        |
|--------|------------------------------|-------------------------------|--------|----------------|
| POST   | `/api/auth/editor`           | `{ password }`                | —      | `{ token }`    |
| POST   | `/api/auth/lawyer`           | `{ idToken }` (Firebase)      | —      | `{ token }`    |
| POST   | `/api/auth/lawyer/password`  | `{ username, password }`      | —      | `{ token }`    |

### Site Content

| Method | Path                   | Body                   | Auth         | Notes                            |
|--------|------------------------|------------------------|--------------|----------------------------------|
| GET    | `/api/content`         | —                      | public       | Returns full `/siteContent` tree |
| GET    | `/api/content/:section`| —                      | public       | e.g. `home`, `aboutUs`           |
| PATCH  | `/api/content`         | `{ key, value }`       | editor JWT   | `key` = slash path e.g. `home/heading` |

### Blog

| Method | Path              | Body                 | Auth       |
|--------|-------------------|----------------------|------------|
| GET    | `/api/blog`       | —                    | public     |
| GET    | `/api/blog/:id`   | —                    | public     |
| POST   | `/api/blog`       | post fields          | editor JWT |
| PATCH  | `/api/blog/:id`   | partial post fields  | editor JWT |
| DELETE | `/api/blog/:id`   | —                    | editor JWT |

### Inquiries (email)

| Method | Path                        | Body                                         | Notes                             |
|--------|-----------------------------|----------------------------------------------|-----------------------------------|
| POST   | `/api/inquiries`            | `{ name, email, phone?, message }`           | Normal appointment request        |
| POST   | `/api/inquiries/priority`   | `{ name, email, phone?, message, practiceArea? }` | Subject prefixed `★ PRIORITY` |

Both routes send a formatted HTML email to the firm inbox and an auto-confirmation to the client.
Rate-limited to **5 requests per IP per 10 minutes**.

### Calendar (lawyer JWT required)

| Method | Path                   | Body                                        |
|--------|------------------------|---------------------------------------------|
| GET    | `/api/calendar`        | —                                           |
| GET    | `/api/calendar/:id`    | —                                           |
| POST   | `/api/calendar`        | `{ title, date, time?, description? }`      |
| PATCH  | `/api/calendar/:id`    | partial fields                              |
| DELETE | `/api/calendar/:id`    | —                                           |

---

## Firebase RTDB Structure

```
/siteContent/
  home/
    heading:        "Experienced Legal Counsel in Calgary"
    intro:          "<p>Since 1982…</p>"
    bulletpoints/
      0: "Trusted by individuals…"
      1: "…"
  aboutUs/
    intro: "…"
    profiles/
      John Doe/
        name: "John Doe"
        bio:  "…"
  areasOfLaw/
    intro: "…"
    bulletpoints/ …
  pricing/
    intro: "…"
    bulletpoints/ …
    disclaimer: "…"
  faq/
    faqs/
      0/
        question: "…"
        answer:   "…"

/blog/
  <push-key>/
    title, date, author, excerpt, content, imageUrl, published, createdAt

/calendar/
  <push-key>/
    id, title, date, time, description, createdAt

/lawyers/
  <username>/
    uid, email, passwordHash

/audit/
  content/
    <push-key>/
      key, value, at
```

---

## Content Editing Flow (secretary)

1. Secretary right-clicks any editable text on the site
2. Angular context menu dialog appears → she selects **Edit**
3. Angular **password dialog** opens → she enters the editor password
4. Angular POSTs `{ password }` to `POST /api/auth/editor`
5. API validates against `EDITOR_PASSWORD_HASH` and returns a short-lived JWT
6. Angular opens the **inline-edit dialog** pre-filled with the current text
7. She edits and clicks **Save**
8. Angular PATCHes `{ key, value }` to `PATCH /api/content` with `Authorization: Bearer <token>`
9. API validates the token, writes the new value to Firebase, logs the change to `/audit/content`
10. Angular updates the DOM immediately (optimistic); the next full page load also reflects it

---

## Seeding Initial Content

On first deployment the `/siteContent` node will be empty, so the site falls back to the hardcoded `constants.ts` defaults.  To seed Firebase with the defaults, run:

```bash
node -e "
const admin = require('firebase-admin');
const sa = require('./firebase-service-account.json');
admin.initializeApp({ credential: admin.credential.cert(sa), databaseURL: process.env.FIREBASE_DATABASE_URL });
const seed = require('./seed.json');
admin.database().ref('/siteContent').set(seed).then(() => { console.log('done'); process.exit(); });
"
```

where `seed.json` is your initial content object matching the structure above.

# Firebase Integration & Logging Strategy

## Part 1 — Seeding Firebase from constants

### The data model problem

The constants file has three distinct shape categories that each need different treatment
before they can live in Firebase RTDB:

**Flat SiteContent** (`HOME`, `ABOUTUS`, `AREASOFLAW`)
Direct write. The only cleanup needed is trimming whitespace from template literals
and flattening the nested `body.content` into a top-level `intro` field so the
Angular services can read it with a single `dbGet('siteContent/home')` call.

**Profiles** (`PROFILES`)
The image paths contain `../../../../assets/...` which are project-relative Angular
paths that have no meaning in a database. The seed script strips these down to just
the filename (`fricv2.jpg`). The Angular component resolves the full path at render time
using a pipe or a helper: `'assets/site/headshots/' + profile.id + '/' + profile.image`.
This also means updating headshot filenames in Firebase doesn't require touching
Angular code.

**Pricing** (`PRICING`)
The most complex shape. Each section uses `||` as a line delimiter within a single
template literal string. This needs to be parsed into a proper `rows: string[]` array
before seeding so the client can render each line cleanly without any string-splitting
logic in the template. The seed script does this transform; the API GET route returns
already-parsed rows.

### Firebase RTDB layout after seeding

```
/profiles/
  bill/     { id, name, image, education, callToBar, workExperience, role, achievements[], community[] }
  howard/   { ... }
  anthony/  { ... }
  tami/     { ... }
  york/     { ... }
  marc/     { ... }
  bronwyn/  { ... }
  tracy/    { ... }

/nav/
  members/        [ { display, value, order } ... ]
  priceSections/  [ { display, value, order } ... ]

/siteContent/
  home/       { id, page, header, subheader, intro, bulletpoints[], footer }
  aboutUs/    { id, page, header, subheader, intro, bulletpoints[], footer }
  areasOfLaw/ { id, page, header, subheader, intro, bulletpoints[], footer }
  pricing/    { id, page, header, subheader, sections[{ id, label, rows[] }] }

/logs/
  api/    { YYYY-MM-DD/ { pushKey: FlLogEntry } }
  client/ { YYYY-MM-DD/ { pushKey: LogEntry   } }
```

### Running the seed

```bash
# Prerequisites
cp .env.example .env          # fill in FIREBASE_DATABASE_URL
cp firebase-service-account.json ./  # download from Firebase Console

# 1. Dry run — see exactly what will be written, nothing touches Firebase
npm run seed:dry

# 2. Seed everything
npm run seed

# 3. Verify it landed correctly
npm run verify

# 4. Seed only profiles (useful after adding a new lawyer)
npm run seed:profiles

# 5. Nuke and reseed (DANGER — destructive)
npm run seed:wipe
```

### Debugging the seed

**"Permission denied"** — Firebase RTDB security rules default to locked.
During development, temporarily set the rules to open in the Firebase Console:
```json
{ "rules": { ".read": true, ".write": true } }
```
Then tighten them before going to production (see security rules section below).

**"service account not found"** — download from Firebase Console →
Project Settings → Service Accounts → Generate new private key.

**Verify a specific path**:
```bash
npx ts-node scripts/verify.ts --path=siteContent/pricing
```

### Firebase RTDB security rules (production)

```json
{
  "rules": {
    "siteContent": {
      ".read":  true,
      ".write": "auth != null && auth.token.role === 'editor'"
    },
    "profiles": {
      ".read":  true,
      ".write": "auth != null && auth.token.role === 'editor'"
    },
    "nav": {
      ".read":  true,
      ".write": false
    },
    "calendar": {
      ".read":  "auth != null && auth.token.role === 'lawyer'",
      ".write": "auth != null && auth.token.role === 'lawyer'"
    },
    "logs": {
      ".read":  "auth != null && auth.token.role === 'editor'",
      ".write": true
    }
  }
}
```

---

## Part 2 — Logging layer design

### API side (Fastify + pino)

Fastify ships with `pino` built in. The `logger.plugin.ts` adds three things on top:

**Namespaced child loggers** via `req.flLog`:
```typescript
req.flLog.info('content', 'Section loaded', { section: 'home', ms: 12 });
req.flLog.error('firebase', 'Write failed', { path: '/siteContent/home', error: e.message });
```
The namespace shows up in every log line so you can `grep` for `[content]` or `[auth]`
in stdout to isolate a specific subsystem during debugging.

**Correlation IDs**: every request gets a `requestId` (from `X-Request-Id` header or
auto-generated UUID). All log lines for the same request share this ID so you can
reconstruct a full request trace from log output.

**Firebase drain**: `error` and `fatal` level entries are written to `/logs/api/{date}/`
in Firebase when not in dev mode. This means you can see server errors from the
Firebase Console or from the Angular admin panel without needing SSH access to the server.

Register the plugin in `api.ts`:
```typescript
await fastify.register(loggerPlugin);
// then in routes:
fastify.register(logRoutes, { prefix: '/api/logs' });
```

### Client side (Angular LoggerService)

The service is a singleton (`providedIn: 'root'`) injected wherever needed:

```typescript
// In any component or service:
private log = inject(LoggerService);

// Or create a scoped child for a whole file:
private log = inject(LoggerService).child('site-content');

this.log.debug('Section fetching', { section: 'home' });
this.log.error('Firebase read failed', { error: e.message });
```

**In-memory ring buffer**: the last 200 entries are held in a signal and queryable
at runtime without opening Network DevTools.

**DevTools API** (dev mode only, auto-initialised):
```javascript
// In browser console during development:
window.__flLog.dump()            // table of all buffered entries
window.__flLog.filter('error')   // filter by level
window.__flLog.filter('auth')    // filter by namespace
window.__flLog.breadcrumbs()     // recent event trail
window.__flLog.setLevel('trace') // change level without recompiling
```

**Firebase drain**: errors in production POST to `POST /api/logs/client` which writes
to `/logs/client/{date}/`. If the POST fails (e.g. the API is down) it fails silently —
the log drain must never cause additional errors.

**Global capture**: `window.onerror` and `unhandledrejection` are both caught and
routed through the logger automatically, so Angular runtime errors and uncaught promise
rejections show up in the same log stream as your intentional log calls.

### Adding the log level to environment.ts

```typescript
// src/environments/environment.ts
export const env = {
  production:   false,
  apiUrl:       'http://localhost:3000',
  logLevel:     'debug',   // trace | debug | info | warn | error
  // ... rest of config
};

// src/environments/environment.prod.ts
export const env = {
  production:   true,
  apiUrl:       'https://api.friclowenstein.com',
  logLevel:     'warn',    // only warnings and errors in production
  // ...
};
```

### Using the child logger pattern in page components

```typescript
@Component({ ... })
export class AboutUsComponent implements OnInit {
  private log = inject(LoggerService).child('about-us');

  async ngOnInit() {
    this.log.debug('Loading profiles from Firebase');
    try {
      const content = await this.contentService.getSection('aboutUs');
      this.log.info('Profiles loaded', { count: content?.profiles?.length });
    } catch (e: any) {
      this.log.error('Failed to load profiles', { message: e.message });
    }
  }
}
```

### Using the child logger in services

```typescript
@Injectable({ providedIn: 'root' })
export class SiteContentService {
  private log  = inject(LoggerService).child('site-content');
  private http = inject(HttpClient);

  async getSection(section: string) {
    this.log.debug('Fetching section', { section });
    try {
      const data = await firstValueFrom(this.http.get(`${env.apiUrl}/api/content/${section}`));
      this.log.info('Section fetched', { section, keys: Object.keys(data as object).length });
      return data;
    } catch (e: any) {
      this.log.error('Section fetch failed', { section, status: e.status, message: e.message });
      return null;
    }
  }
}
```
