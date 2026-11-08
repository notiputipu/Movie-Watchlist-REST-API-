# FilmLog backend

FilmLog is a JavaScript REST API using Node.js 24, Express, MySQL, mysql2, and
Zod. It supports account registration/login, movie discovery, private watchlists,
viewing history, and Gemini recommendations grounded in the starter dataset.

## First run

1. Start a native MySQL server. This project was verified with the installed
   MySQL 8.0.46; setup requires MySQL 8.0.16 or newer and
   reject MariaDB. MySQL 8.4 can also be used, but was not the server tested here.
2. Open a terminal in `API` and run `npm.cmd ci`.
3. Copy `.env.example` to `.env` only if you do not already have a local file.
4. Fill in your MySQL credentials and generate a JWT secret of at least 32 bytes.
5. Initialize and seed the database, then start the API:

```powershell
npm run db:setup
npm run db:seed
npm run dev
```

Each checkout needs its own local `.env` with database credentials and a generated
JWT secret. Keep it private and out of Git. Use `npm.cmd` when PowerShell blocks
`npm.ps1`. Restart the server after changing `.env`.

The default API address is `http://localhost:8000/api`. Try:

```powershell
Invoke-RestMethod http://localhost:8000/api/health
Invoke-RestMethod http://localhost:8000/api/movies
```

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
| `BROWSER_CHANNEL` | Legacy test setting; unused while the test files are absent |

## Running the companion frontend

One server now serves the page and API. From the repository root:

```powershell
cd API
npm run dev
```

Open `http://localhost:8000`. Express serves only the public `frontend` folder,
API source and `.env` are not exposed. The default API base URL uses the page
own origin plus `/api`, so it follows a changed server port automatically.
Existing API URL choices in browser Settings remain saved; update Settings if
one points at a different server. 

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

## API and response contract

Every application JSON response contains all three fields:

```json
{ "success": true, "data": {}, "error": null }
```

An error has `success: false`, `data: null`, and an `error` string.
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

Duplicate usernames/emails return 422. Password hashes use asynchronous bcrypt with cost 12
and are never returned. Login failures use the same message for unknown emails
and incorrect passwords. JWTs expire after one day, use HS256, and carry the user
ID in sub. Protected requests verify the signature, algorithm, expiration, and
current account. There are no refresh tokens.

### Movies, watchlists, and history

Movie responses include numeric rating, genres/cast arrays, and the starter
snake_case poster_url. Search matches literal substrings of titles/directors,
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
one transaction. Deleting zero watchlist rows is allowed.

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

## Vercel with TiDB Cloud Starter

Use the Express preset, root directory `API`, Node.js 24.x, and no build command
or output directory. `src/app.js` exports the app for Vercel; `src/server.js`
continues to start the local server.

Enable **Include source files outside of the Root Directory in the Build Step**
in Vercel's project settings. The API reads `../data/movies.json` during startup;
that file must be included in the deployment. If runtime logs report ENOENT for
this file, check this setting and redeploy.

Set these variables in Vercel, using your own TiDB connection values:

```dotenv
DB_HOST=your-tidb-public-host
DB_PORT=4000
DB_USER=your-prefixed-tidb-username
DB_PASSWORD=your-private-password
DB_NAME=filmlog
DB_SSL=true
DB_CONNECTION_LIMIT=2
JWT_SECRET=your-random-secret-at-least-32-bytes
GEMINI_API_KEY=your-private-key
GEMINI_MODEL=your-supported-model
CORS_ORIGINS=https://your-frontend-domain.example
```

Use the port and complete username provided by TiDB. `DB_SSL=true` enables TLS
with certificate verification; leave it false for local MySQL without TLS.
Keep credentials out of Git and rotate passwords shared publicly. Changes to
Vercel environment variables require a new deployment to take effect.

Before using the hosted API, initialize TiDB from your computer. Save the cloud
connection settings privately in `API/.env`, then run `npm.cmd run db:setup` and
`npm.cmd run db:seed` from `API`. These are manual database initialization
commands, not Vercel build commands. Existing application records are preserved.

Setup recognizes TiDB 7.2+ and requires enabled CHECK constraints. If setup
reports they are disabled, enable them in your own TiDB instance's SQL console:

```sql
SET GLOBAL tidb_enable_check_constraint = ON;
```

Then rerun setup. It verifies that the review rating constraint is enforced;
do not bypass this check. Cloud compatibility and full CRUD flows still need
verification against your TiDB instance before relying on the deployment.

Check `/api/health` first, then `/api/movies` (20 seeded movies). Health only
checks HTTP availability, not database connectivity. For a function startup
failure, inspect Vercel runtime logs for the specific exception.

Vercel does not serve this project's `frontend` directory through Express static
middleware. Deploy that frontend separately and set its API URL to the backend's
`https://your-api-domain/api`; allow its exact origin in `CORS_ORIGINS`.


