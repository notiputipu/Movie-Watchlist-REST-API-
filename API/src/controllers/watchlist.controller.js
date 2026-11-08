import { pool } from '../database/connection.js';
import { toMovie } from '../database/movie.js';
import { sendError, sendSuccess } from '../response.js';

export async function listWatchlist(req, res) {
    const [rows] = await pool.execute(`SELECT w.movie_id, w.created_at, m.*
        FROM watchlists w JOIN movies m ON m.id = w.movie_id
        WHERE w.user_id = ? ORDER BY w.created_at DESC, w.movie_id DESC`, [req.user.id]);
    sendSuccess(res, rows.map((row) => ({ movie_id: row.movie_id, created_at: row.created_at, movie: toMovie(row) })));
}

export async function addWatchlist(req, res) {
    const { movieId } = res.locals.validated.body;
    const [[movie]] = await pool.execute('SELECT * FROM movies WHERE id = ?', [movieId]);
    if (!movie) {
        sendError(res, 404, 'movie not found');
        return;
    }
    // Uniqueness is checked by MySQL, including simultaneous requests
    await pool.execute('INSERT INTO watchlists (user_id, movie_id) VALUES (?, ?)', [req.user.id, movieId]);
    const [[entry]] = await pool.execute('SELECT created_at FROM watchlists WHERE user_id = ? AND movie_id = ?', [req.user.id, movieId]);
    sendSuccess(res, { movie_id: movieId, created_at: entry.created_at, movie: toMovie(movie) }, 201);
}

export async function removeWatchlist(req, res) {
    const { movieId } = res.locals.validated.params;
    const [result] = await pool.execute('DELETE FROM watchlists WHERE user_id = ? AND movie_id = ?', [req.user.id, movieId]);
    if (!result.affectedRows) {
        sendError(res, 404, 'watchlist not found');
        return;
    }
    sendSuccess(res, null);
}
