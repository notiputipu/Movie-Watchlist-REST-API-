import { pool } from '../database/connection.js';
import { toMovie } from '../database/movie.js';
import { HttpError } from '../errors.js';
import { sendSuccess } from '../response.js';

export async function listWatched(req, res) {
    const { page, limit } = res.locals.validated.query;
    const [rows] = await pool.query(`SELECT r.id AS review_id, r.movie_id, r.rating AS user_rating,
        r.review, r.created_at, m.* FROM reviews r JOIN movies m ON m.id = r.movie_id
        WHERE r.user_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`,
    [req.user.id, limit, (page - 1) * limit]);
    sendSuccess(res, rows.map((row) => ({
        id: row.review_id, movie_id: row.movie_id, rating: row.user_rating,
        review: row.review, created_at: row.created_at, movie: toMovie(row),
    })));
}

export async function addWatched(req, res) {
    const { movieId, rating, review } = res.locals.validated.body;
    const connection = await pool.getConnection();
    let entry;
    try {
        await connection.beginTransaction();
        const [[movie]] = await connection.execute('SELECT * FROM movies WHERE id = ?', [movieId]);
        if (!movie) throw new HttpError(404, 'movie not found');
        const [result] = await connection.execute(
            'INSERT INTO reviews (user_id, movie_id, rating, review) VALUES (?, ?, ?, ?)',
            [req.user.id, movieId, rating, review],
        );
        // viewing doesn't require an existing watchlist entry
        await connection.execute('DELETE FROM watchlists WHERE user_id = ? AND movie_id = ?', [req.user.id, movieId]);
        const [[saved]] = await connection.execute('SELECT created_at FROM reviews WHERE id = ?', [result.insertId]);
        entry = { id: result.insertId, movie_id: movieId, rating, review, created_at: saved.created_at, movie: toMovie(movie) };
        await connection.commit();
    } catch (error) {
        try { await connection.rollback(); }
        catch (rollbackError) {
            console.error('viewing rollback failed:', rollbackError);
            connection.destroy();
        }
        throw error;
    } finally {
        connection.release();
    }
    sendSuccess(res, entry, 201);
}
