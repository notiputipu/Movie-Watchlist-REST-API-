# FilmLog backend

FilmLog is a JavaScript REST API using Node.js 24, Express, MySQL, mysql2, and
Zod. It supports account registration/login, movie discovery, private watchlists,
viewing history, and Gemini recommendations grounded in the starter dataset.
There is no Prisma, TypeScript, build step, or dist directory.

## First run

1. Start a native MySQL server. This project was verified with the installed
   MySQL 8.0.46; setup and integration tests require MySQL 8.0.16 or newer and
   reject MariaDB. MySQL 8.4 can also be used, but was not the server tested here.
2. Open a terminal in `API` and run `npm.cmd ci`.
3. Copy `.env.example` to `.env` only if you do not already have a local file.
4. Fill in your MySQL credentials and generate a JWT secret of at least 32 bytes.
5. Initialize and seed the database, then start the API:

```powershell
npm.cmd run db:setup
npm.cmd run db:seed
npm.cmd run dev
```

The local `.env` created during implementation already has a generated JWT secret
and database settings. Keep it private and out of Git. `npm.cmd` avoids this
computer's PowerShell restriction on `npm.ps1`.

The default API address is `http://localhost:8000/api`. Try:

```powershell
Invoke-RestMethod http://localhost:8000/api/health
Invoke-RestMethod http://localhost:8000/api/movies
```

Stop the development server with `Ctrl+C`. `npm.cmd start` runs the same source
without automatic restart. The MySQL Windows service is independent of Node.

This computer's existing MySQL80 service now binds both the classic and X
listeners to `127.0.0.1`. Its original configuration was backed up before the
service restart. For another Windows installation, review the helper first:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Restrict-MySqlToLocalhost.ps1 -WhatIf
```

Run it without `-WhatIf` from an Administrator PowerShell to apply the change.
Use `-ServiceName` if your service has a different name. It preserves database
files and restores the previous configuration if restarting the service fails.

## Environment settings

| Setting | Purpose |
| --- | --- |
| `PORT` | HTTP port, default `8000` |
| `DB_HOST`, `DB_PORT` | MySQL address, defaults `127.0.0.1:3306` |
| `DB_USER`, `DB_PASSWORD` | Your local MySQL account |
| `DB_NAME` | Application database, default `filmlog` |
| `JWT_SECRET` | Required secret of at least 32 UTF-8 bytes |
| `CORS_ORIGINS` | Comma-separated exact frontend origins |
| `GEMINI_API_KEY` | Optional until you use recommendations |
| `GEMINI_MODEL` | Default `gemini-3.8-flash`; choose a model available to your key |
| `BROWSER_CHANNEL` | Optional installed Playwright browser: `chrome` or `msedge` |

To generate a fresh secret locally:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Paste the generated value into `.env`; do not use the empty template value.
`DB_CONNECTION_LIMIT` optionally changes the connection pool size (default 10).

CORS allows the API's own origin, so the frontend works on the same server.
Additional origins default to `http://localhost:3000,http://127.0.0.1:3000`. Add your actual
origin when using a separate frontend port such as VS Code Live Server's 5500.
Origins include scheme, hostname, and port, with no path or trailing slash.
Disallowed Origin headers receive 403. Requests without Origin remain usable
from command-line clients. CORS controls browser access; JWTs authorize users.

## Running the companion frontend

One server now serves the page and API. From the repository root:

```powershell
cd API
npm.cmd run dev
```

Open `http://localhost:8000`. Express serves only the public `frontend` folder;
API source and `.env` are not exposed. The default API base URL uses the page's
own origin plus `/api`, so it follows a changed server port automatically.
Existing API URL choices in browser Settings remain saved; update Settings if
one points at a different server. Python or a separate static server is optional.

The frontend has a scoped content security policy allowing its existing CDN
scripts, fonts, styles, and inline button handlers. API responses retain the
stricter policy. Unmatched `/api` URLs still return JSON 404 responses.

## How the code fits together

```text
request -> route -> validation/auth middleware -> controller -> MySQL -> response
```

- `src/app.js` configures Helmet, explicit CORS, JSON parsing, routes, the 404
  handler, and global errors. Health is registered directly in this file.
- `src/server.js` validates the JWT secret/port and starts listening.
- `routes/` groups auth, movies, watchlists, and viewing endpoints.
- `validators/` defines Zod schemas. Parsed values go in `res.locals.validated`;
  controllers use those values rather than trusting raw request data.
- `middleware/auth.js` verifies the Bearer token and loads the current account.
  Controllers use `req.user.id`, never a user ID supplied in the body.
- `controllers/` runs application logic and parameterized SQL. No separate
  service or repository layers are needed for this version.
- `database/` contains connection configuration, UTC pool acquisition, schema,
  dataset validation, seeding, and movie serialization.
- `integrations/gemini.js` handles the pinned Google GenAI SDK and model output.
- `response.js` and `errors.js` keep HTTP responses consistent.

JSON parsing makes a body readable; Zod checks its contents. Authentication
identifies the user. SQL placeholders keep input values separate from SQL syntax.

### Database folder

```text
database/
  connection.js
  setup.js
  seed.js
  dataset.js
  movie.js
  schema.sql
```

- `connection.js` reads database settings and manages reusable UTC connections.
- `setup.js` creates the database/tables and exports `applySchema` for tests.
- `seed.js` inserts/updates the 20 movies and exports `seedDatabase` for tests.
- `dataset.js` validates the source movies and defines their IDs and genre labels.
- `movie.js` converts MySQL rows into frontend-friendly movie objects.
- `schema.sql` defines tables, keys, and constraints.

Setup and seeding use Node.js 24's `import.meta.main`: their command sections
run only when launched directly. Tests can import the functions without running
those commands. The pool is created on its first query, so importing database
settings does not select a database or open connections.

## Database design

| Table | What it stores |
| --- | --- |
| `users` | Unique username/email, bcrypt password hash, creation date |
| `movies` | The 20 starter movies with fixed IDs and JSON genres/cast |
| `watchlists` | One entry per user/movie pair |
| `reviews` | Each viewing with its own rating, opinion, and timestamp |

Foreign keys link watchlists and reviews to their users and movies. IDs use
matching unsigned integer types; deleting a parent cascades to dependent records.
MySQL's CHECK constraint enforces ratings 1-5 even if code bypasses Zod.

Creation dates are DATETIME(3). Every acquired connection sets its MySQL session
to UTC, and mysql2 reads/writes dates with timezone Z. Responses use ISO UTC dates.
History sorts by creation date descending, then ID descending to break ties.

`db:setup` never drops existing application data. It refuses the old users-only
schema; choose a new DB_NAME instead of deleting existing tables. `db:seed` checks
20 unique IDs and transactionally upserts movie metadata. Repeating it preserves
accounts, watchlists, and viewing records. The original PostgreSQL-style seed.sql
is left unchanged and is not executed.

## API and response contract

Every application JSON response contains all three fields:

```json
{ "success": true, "data": {}, "error": null }
```

An error has `success: false`, `data: null`, and a readable `error` string.
Normal HEAD and CORS preflight responses follow HTTP's no-body behavior.

| Method/path | Request | Success |
| --- | --- | --- |
| `GET /api/health` | None | 200, HTTP server status |
| `POST /api/auth/register` | `username`, `email`, `password` | 201, `{ user }` |
| `POST /api/auth/login` | `email`, `password` | 200, `{ token, user }` |
| `GET /api/movies` | Optional `search`, `genre`, `shuffle` query | 200, movie array |
| `GET /api/movies/:id` | Positive integer ID | 200, movie |
| `GET /api/watchlist` | Bearer token | 200, entry array |
| `POST /api/watchlist` | Token and `{ movieId }` | 201, entry |
| `DELETE /api/watchlist/:movieId` | Token and movie ID | 200, null |
| `GET /api/watched` | Token; optional `page`, `limit` query | 200, viewing array |
| `POST /api/watched` | Token and `{ movieId, rating, review }` | 201, viewing |
| `POST /api/movies/recommend` | `{ prompt }` | 200, `{ movie_id, reasoning }` |

The practice `/users` endpoints were removed when authentication was added.
Payloads live inside `data`; the supplied frontend already handles this wrapper.

### Authentication

Usernames are trimmed and limited to 3-50 characters. Emails are validated,
trimmed, lowercased, and limited to 254 characters. Passwords require at least
8 characters and at most 72 UTF-8 bytes; they are not trimmed. Emoji passwords
are checked by byte length rather than character count.

Registration inserts directly and lets unique constraints settle races. Duplicate
usernames/emails return 422. Password hashes use asynchronous bcrypt with cost 12
and are never returned. Login failures use the same message for unknown emails
and incorrect passwords. JWTs expire after one day, use HS256, and carry the user
ID in sub. Protected requests verify the signature, algorithm, expiration, and
current account. There are no refresh tokens in this version.

### Movies, watchlists, and history

Movie responses include numeric rating, genres/cast arrays, and the starter's
snake_case poster_url. Search matches literal substrings of titles/directors;
percent, underscore, and backslash are escaped before LIKE matching. Genre
queries map case-insensitively to the dataset's canonical labels. Unknown genres
return an empty array. `shuffle=true` randomizes only the matching movies.

Watchlist entries contain `{ movie_id, created_at, movie }`. Duplicate additions
return 422. Deletion affects only the signed-in user's entry and returns 404 when
absent. Body fields such as user_id are discarded, not used for ownership.

Viewing entries contain `{ id, movie_id, rating, review, created_at, movie }`.
Ratings must be integers 1-5 and trimmed reviews must have 1-5000 characters.
Repeated viewings create separate records. History defaults to page 1, limit 50;
limit is capped at 100. Invalid pagination returns 422; pages beyond the end
return an empty array.

Saving a viewing inserts its review and removes that user's watchlist entry in
one transaction. Deleting zero watchlist rows is allowed. Failure rolls back both
changes; the dedicated connection is released in finally. The frontend reloads
both history and watchlist state before refreshing movie buttons.

### Gemini

Set GEMINI_API_KEY in `.env` to enable recommendations. Prompts are trimmed and
limited to 1-1000 characters. The API loads only the original 20 movie IDs from
MySQL and supplies their metadata to Gemini. Structured output restricts the ID,
Zod validates the result, and the controller checks dataset membership and current
database existence again. Extra database movies cannot become recommendations.

The SDK is pinned in package.json/package-lock.json. Requests have a 20-second
abort deadline, abort on caller disconnect, disable retries and automatic
continuation, and cap output at 1024 tokens. Aborting stops the local transport;
it does not guarantee that Google's service stops processing or billing.

A live smoke command is available after adding a key:

```powershell
npm.cmd run smoke:gemini
```

A live grounded request succeeded with `gemini-3.5-flash-lite`, returning
Inception (movie ID 1) from the seeded database. This is now the model configured
in this computer's local `.env`; the earlier `gemini-3.8-flash` calls reached the
20-second deadline. Provider error handling and cancellation are also covered by
actual-SDK tests against a controlled local HTTP server.

### Errors and browser handling

| Status | Meaning |
| --- | --- |
| 400 | Malformed JSON syntax |
| 401 | Missing, invalid, or expired authentication; invalid login |
| 403 | Disallowed browser Origin |
| 404 | Unknown route, movie, or user-owned entry |
| 413 | JSON exceeds the default 100 KB limit |
| 422 | Zod validation failure or duplicate unique value |
| 500 | Unexpected application/database error |
| 502 | Invalid or failed Gemini response |
| 503 | Gemini unconfigured/unavailable or incomplete seed data |
| 504 | Gemini request deadline exceeded |

Helmet sets API security headers; HSTS is disabled for local HTTP development.
Unexpected server errors are logged without returning stack traces to clients.
The frontend retains its existing localStorage JWT behavior and clears it on
logout. Dynamic text is inserted as DOM text nodes, and images use DOM properties
with HTTP(S) URL checks. The static template markup contains only trusted layout,
fixed choices, and validated numeric IDs. No hand-written HTML escaping is used.

## Verification

```powershell
npm.cmd test
npm.cmd run test:integration
npm.cmd run verify
npm.cmd run test:browser
npm.cmd run verify:all
```

`verify` runs fast tests plus real MySQL integration tests. `verify:all` also runs
the browser tests. MySQL must be running and the configured account must be able
to create/drop isolated test databases and create test-only triggers. Unavailable
MySQL fails the tests instead of skipping them. Application databases are not used
as fixtures or dropped by the test harness.

For browser tests, install Playwright Chromium once with
`npx.cmd playwright install chromium`. Alternatively set BROWSER_CHANNEL=chrome
or msedge to use an installed browser. This computer uses its installed Chrome;
the downloaded Chromium executable could not launch here.

Tests cover real constraints/JSON queries, concurrent duplicates, byte-limited
passwords, JWT rejection, ownership, wildcard escaping, UTC/tie ordering,
pagination, repeat viewings, rollback, connection reuse after repeated failures,
and persistence across API process restarts. Browser tests exercise the actual
companion frontend and hostile usernames, metadata, reviews, inspector entries,
and AI text, checking for execution or token exfiltration. Third-party styling,
icons, and image downloads are stubbed for deterministic functional tests; this
is not a screenshot/visual comparison suite.
