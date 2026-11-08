# FilmLog

A movie watchlist and review platform built with JavaScript, Express, and MySQL.
The REST API and companion frontend run together at **http://localhost:8000**.
Gemini recommends movies only from the provided 20-movie dataset.

## Features

- Register and log in with bcrypt-hashed passwords and JWT authentication.
- Browse movie details, search titles/directors, filter genres, and shuffle results.
- Manage a private watchlist.
- Record repeat viewings with 1-5 star ratings and written reviews.
- Automatically remove a movie from your watchlist when you log it as watched.
- Ask Gemini for a recommendation grounded in the seeded database.
- Receive consistent JSON responses validated with Zod.

## Stack and requirements

- Node.js 24 (a recent release supporting `import.meta.main`) and npm.
- MySQL 8.0.16 or newer; development was verified with MySQL 8.0.46.
- Express 5, mysql2, Zod, bcryptjs, jsonwebtoken, Helmet, and the Google GenAI SDK.
- Internet access for the frontend's CDN assets and live Gemini calls.
- A Gemini API key if you want AI recommendations. Other features work without it.

The database setup rejects MariaDB, including the database bundled with XAMPP.
Source files are plain `.js`; there is no TypeScript compilation or `dist` folder.

## Quick start

The commands below use Windows PowerShell. Use `npm` instead of `npm.cmd` on
other platforms, `npm.cmd` also avoids PowerShell restrictions on `npm.ps1`.

### 1. Install dependencies

Open a terminal in the project root, then:

```powershell
cd API
npm.cmd ci
```

### 2. Configure local settings

On a fresh checkout, copy the template:

```powershell
Copy-Item .env.example .env
```

Keep an existing `.env` instead of overwriting it. Edit `API/.env` with your
own MySQL host, port, username, password, and database name. The account needs
permission to create the database and its tables during setup.

Generate a JWT secret locally:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Paste the generated value into `JWT_SECRET`. It must contain at least 32 bytes.
Set `GEMINI_API_KEY` if using AI. `GEMINI_MODEL` selects the model: the template
and code fallback are `gemini-3.8-flash`; a live grounded request previously
succeeded with `gemini-3.5-flash-lite`, which you can set explicitly in `.env`.

### 3. Initialize the database

Start MySQL, then run from `API`:

```powershell
npm.cmd run db:setup
npm.cmd run db:seed
```

Setup creates the four tables. Seeding inserts or updates the 20 movies from
`data/movies.json` while preserving account, watchlist, and review records.
If setup detects the incompatible earlier users-only schema, choose a fresh
`DB_NAME`; it will not automatically replace existing tables.

### 4. Start the application

```powershell
npm.cmd run dev
```

Open **http://localhost:8000**. Express serves the frontend and the `/api` routes;
Python and a second frontend server are not required. Keep one API process running.
Use `Ctrl+C` to stop it. Restart after changing `.env` to load new settings.

## Project structure

```text
movie_watchlist/
  API/
    src/
      app.js
      server.js
      controllers/
      routes/
      middleware/
      validators/
      integrations/
      database/
        connection.js
        setup.js
        seed.js
        dataset.js
        movie.js
        schema.sql
    scripts/
    .env.example
    package.json
    package-lock.json
    README.md
  frontend/
    index.html
    app.js
    README.md
  data/
    movies.json
    seed.sql
  .gitignore
  README.md
```

The simplified request flow is:

```text
request -> route -> validation/auth middleware -> controller -> MySQL -> JSON
```

The database has `users`, `movies`, `watchlists`, and `reviews` tables. Foreign
keys enforce relationships; a composite watchlist key prevents duplicates, and
a database CHECK constraint enforces review ratings. Viewing timestamps use UTC
with millisecond precision. Movie ratings are separate from users' review ratings.

`data/seed.sql` is an unchanged starter artifact containing PostgreSQL syntax.
The application uses the JSON dataset and JavaScript seeder instead.

## REST API

The base URL is `http://localhost:8000/api`. Protected routes require
`Authorization: Bearer <token>` from login.

| Method and path | Input | Protected | Success |
| --- | --- | --- | --- |
| `GET /api/health` | None | No | 200 |
| `POST /api/auth/register` | `username`, `email`, `password` | No | 201 |
| `POST /api/auth/login` | `email`, `password` | No | 200 |
| `GET /api/movies` | Optional `search`, `genre`, `shuffle` query | No | 200 |
| `GET /api/movies/:id` | Movie ID | No | 200 |
| `GET /api/watchlist` | None | Yes | 200 |
| `POST /api/watchlist` | `movieId` | Yes | 201 |
| `DELETE /api/watchlist/:movieId` | Movie ID | Yes | 200 |
| `GET /api/watched` | Optional `page`, `limit` query | Yes | 200 |
| `POST /api/watched` | `movieId`, `rating`, `review` | Yes | 201 |
| `POST /api/movies/recommend` | `prompt` | No | 200 |

History defaults to page 1 and limit 50, capped at 100. The former practice
`/users` CRUD routes are no longer part of the application.

All application JSON responses use the same wrapper. For example, health returns:

```json
{
  "success": true,
  "data": { "status": "ok", "service": "filmlog-api" },
  "error": null
}
```

Errors use `success: false`, `data: null`, and an error string. Validation and
duplicates return 422; authentication failures return 401; missing resources
return 404. Full payloads and error codes are in the [backend guide](API/README.md).

## Commands and manual checks

Run these inside `API`:

| Command | Purpose |
| --- | --- |
| `npm.cmd run dev` | Start the app and restart on JavaScript changes |
| `npm.cmd start` | Start the app without watch mode |
| `npm.cmd run db:setup` | Create the database and tables |
| `npm.cmd run db:seed` | Insert/update the starter movies |
| `npm.cmd run smoke:gemini` | Make a live grounded recommendation request |

In another terminal, check the API:

```powershell
Invoke-RestMethod http://localhost:8000/api/health
Invoke-RestMethod 'http://localhost:8000/api/movies?genre=Sci-Fi&search=Inception'
```

For the UI, register, log in, add a movie to Watchlist, then log a viewing. Confirm
it appears in Watched & Reviews and disappears from your watchlist. Use AI
Assistant to see a live recommendation after configuring a Gemini key.

Local `.env`, installed `node_modules`, and log files are ignored by Git. Commit
`.env.example` with empty secrets and `package-lock.json` for reproducible setup.

See the [backend guide](API/README.md) for implementation details and the
[frontend guide](frontend/README.md) for UI instructions. The dataset and companion
UI originated from the GDGoC FilmLog backend recruitment starter pack.
