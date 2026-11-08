import { pool } from '../src/database/connection.js';
import { seededIds } from '../src/database/dataset.js';
import { toMovie } from '../src/database/movie.js';
import { generateRecommendation } from '../src/integrations/gemini.js';

try {
    if (!process.env.GEMINI_API_KEY) throw new Error('Set GEMINI_API_KEY in API/.env before running the live smoke test.');
    const [rows] = await pool.execute(`SELECT * FROM movies WHERE id IN (${seededIds.map(() => '?').join(', ')})`, seededIds);
    if (rows.length !== 20) throw new Error('Run db:setup and db:seed first.');
    const result = await generateRecommendation({ prompt: 'mind-bending sci-fi thriller', candidates: rows.map(toMovie), signal: AbortSignal.timeout(20000) });
    if (!seededIds.includes(result.movie_id)) throw new Error('Gemini selected an out-of-dataset ID.');
    console.log(JSON.stringify(result, null, 2));
} catch (error) {
    console.error('Live Gemini smoke test failed:', error.message);
    process.exitCode = 1;
} finally { await pool.end(); }
