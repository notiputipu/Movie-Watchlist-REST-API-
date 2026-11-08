import { pool } from './connection.js';
import { seedMovies } from './dataset.js';

export async function seedDatabase(connection) {
    const columns = ['title', 'year', 'director', 'genres', 'rating', 'duration', 'synopsis', 'poster_url', 'cast_members'];
    const sql = `INSERT INTO movies (id, ${columns.join(', ')}) VALUES (${Array(10).fill('?').join(', ')})
        ON DUPLICATE KEY UPDATE ${columns.map((column) => `${column} = ?`).join(', ')}`;
    await connection.beginTransaction();
    try {
        for (const movie of seedMovies) {
            const values = [movie.title, movie.year, movie.director, JSON.stringify(movie.genres),
                movie.rating, movie.duration, movie.synopsis, movie.poster_url, JSON.stringify(movie.cast)];
            await connection.execute(sql, [movie.id, ...values, ...values]);
        }
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    }
}

// Run the command directl, importing this file only exposes its functions
if (import.meta.main) {
    let connection;
    try {
        connection = await pool.getConnection();
        await seedDatabase(connection);
        console.log('Seeded the 20 FilmLog movies.');
    } catch (error) {
        console.error('Movie seeding failed:', error.message);
        process.exitCode = 1;
    } finally {
        if (connection) connection.release();
        await pool.end();
    }
}
