import 'dotenv/config';
import mysql from 'mysql2/promise';

export function getDatabaseConfig() {
    const ssl = process.env.DB_SSL ?? 'false';
    if (!['true', 'false'].includes(ssl)) {
        throw new Error('DB_SSL must be true or false.');
    }
    const port = Number(process.env.DB_PORT ?? 3306);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('DB_PORT must be an integer between 1 and 65535.');
    }
    return {
        host: process.env.DB_HOST ?? '127.0.0.1',
        port,
        user: process.env.DB_USER ?? 'root',
        password: process.env.DB_PASSWORD ?? '',
        database: process.env.DB_NAME ?? 'filmlog',
        timezone: 'Z',
        connectTimeout: 5000,
        ...(ssl === 'true' ? { ssl: { rejectUnauthorized: true, minVersion: 'TLSv1.2' } } : {}),
    };
}

let rawPool;

function getPool() {
    // Wait until the first query so importing configuration opens no pool
    if (!rawPool) {
        const connectionLimit = Number(process.env.DB_CONNECTION_LIMIT ?? 10);
        if (!Number.isInteger(connectionLimit) || connectionLimit < 1) {
            throw new Error('DB_CONNECTION_LIMIT must be a positive integer.');
        }
        rawPool = mysql.createPool({
            ...getDatabaseConfig(), waitForConnections: true, connectionLimit,
        });
    }
    return rawPool;
}

async function getConnection() {
    const connection = await getPool().getConnection();
    try {
        await connection.query("SET time_zone = '+00:00'");
        return connection;
    } catch (error) {
        connection.destroy();
        throw error;
    }
}

async function run(method, args) {
    const connection = await getConnection();
    try { return await connection[method](...args); }
    finally { connection.release(); }
}

export const pool = {
    getConnection,
    execute: (...args) => run('execute', args),
    query: (...args) => run('query', args),
    end: () => rawPool ? rawPool.end() : Promise.resolve(),
};
