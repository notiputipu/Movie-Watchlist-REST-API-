import 'dotenv/config';
import { app } from './app.js';
import { getJwtSecret } from './middleware/auth.js';
getJwtSecret();
const port = Number(process.env.PORT ?? 8000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
}
const server = app.listen(port, () => {
    console.log(`FilmLog API is running at http://localhost:${port}`);
});
server.on('error', (error) => {
    console.error('Failed to start FilmLog API:', error.message);
    process.exitCode = 1;
});
