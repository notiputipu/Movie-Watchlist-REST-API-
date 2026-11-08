import { pool } from '../database/connection.js';
import { toMovie } from '../database/movie.js';
import { genreLabels } from '../database/dataset.js';
import { sendError, sendSuccess } from '../response.js';

export async function listMovies(_req, res) {
    const { search, genre, shuffle } = res.locals.validated.query;
    const conditions = [];
    const values = [];
    if (search) {
        const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
        conditions.push('(title LIKE ? ESCAPE ? OR director LIKE ? ESCAPE ?)');
        values.push(pattern, '\\', pattern, '\\');
    }
    if (genre) {
        conditions.push('JSON_CONTAINS(genres, JSON_QUOTE(?))');
        values.push(genreLabels.get(genre.toLowerCase()) ?? genre.toLowerCase());
    }
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.execute(`SELECT * FROM movies${where} ORDER BY ${shuffle ? 'RAND()' : 'id'}`, values);
    sendSuccess(res, rows.map(toMovie));
}

export async function getMovie(_req, res) {
    const [[movie]] = await pool.execute('SELECT * FROM movies WHERE id = ?', [res.locals.validated.params.id]);
    if (!movie) {
        sendError(res, 404, 'Movie not found');
        return;
    }
    sendSuccess(res, toMovie(movie));
}
