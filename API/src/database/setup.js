import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { getDatabaseConfig } from './connection.js';

export async function applySchema(connection) {
    const [[{ version }]] = await connection.query('SELECT VERSION() AS version');
    const tidbVersion = version.match(/TiDB-v(\d+)\.(\d+)\.(\d+)/i);
    const [major, minor, patch] = version.split('.').map(Number);
    if (/tidb/i.test(version)) {
        if (!tidbVersion || Number(tidbVersion[1]) < 7
            || (Number(tidbVersion[1]) === 7 && Number(tidbVersion[2]) < 2)) {
            throw new Error(`FilmLog requires TiDB 7.2 or newer with CHECK and foreign key support; found ${version}.`);
        }
        const [settings] = await connection.query("SHOW GLOBAL VARIABLES LIKE 'tidb_enable_check_constraint'");
        if (!['ON', '1'].includes(String(settings[0]?.Value).toUpperCase())) {
            throw new Error('Enable TiDB CHECK constraints in the TiDB SQL console with SET GLOBAL tidb_enable_check_constraint = ON, then rerun db:setup.');
        }
    } else if (/mariadb/i.test(version) || !Number.isInteger(major) || major < 8 || (major === 8 && minor === 0 && patch < 16)) {
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
    // TiDB's TABLE_CONSTRAINTS table does not expose MySQL's ENFORCED column.
    // Both servers show CHECK declarations and NOT ENFORCED in SHOW CREATE TABLE.
    const [[table]] = await connection.query('SHOW CREATE TABLE reviews');
    const ratingConstraint = table['Create Table'].match(
        /CONSTRAINT\s+`reviews_rating_check`\s+CHECK\b[^\r\n]*/i,
    );
    if (!ratingConstraint || /\bNOT\s+ENFORCED\b/i.test(ratingConstraint[0])) {
        throw new Error('The reviews rating CHECK constraint is missing or not enforced. Database setup is incomplete.');
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
