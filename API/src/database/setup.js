import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { getDatabaseConfig } from './connection.js';

export async function applySchema(connection) {
    const [[{ version }]] = await connection.query('SELECT VERSION() AS version');
    const [major, minor, patch] = version.split('.').map(Number);
    if (/mariadb/i.test(version) || major < 8 || (major === 8 && minor === 0 && patch < 16)) {
        throw new Error(`FilmLog requires MySQL 8.0.16 or newer; found ${version}.`);
    }
    const [tables] = await connection.query("SHOW TABLES LIKE 'users'");
    if (tables.length) {
        const [columns] = await connection.query('SHOW COLUMNS FROM users');
        const names = new Set(columns.map((column) => column.Field));
        if (!['id', 'username', 'email', 'password_hash', 'created_at'].every((name) => names.has(name))) {
            throw new Error('Incompatible users-only schema. Choose a fresh DB_NAME in .env; existing tables were preserved.');
        }
    }
    const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
    for (const statement of sql.split(';').map((part) => part.trim()).filter(Boolean)) {
        await connection.query(statement);
    }
}

// Run the command directly, importing this file only exposes its functions
if (import.meta.main) {
    let connection;
    
    try {
        const databaseConfig = getDatabaseConfig();
        connection = await mysql.createConnection({ ...databaseConfig, database: undefined });
        
        await connection.query(
            'CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
            [databaseConfig.database],
        );
        await connection.query('USE ??', [databaseConfig.database]);
        await connection.query("SET time_zone = '+00:00'");
        await applySchema(connection);
        console.log(`FilmLog tables are ready in ${databaseConfig.database}.`);
    } catch (error) {
        console.error('Database setup failed:', error.message);
        process.exitCode = 1;
    } finally {
        if (connection) await connection.end();
    }
}
