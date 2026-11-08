import { randomBytes } from 'node:crypto';
import mysql from 'mysql2/promise';
import { getDatabaseConfig } from '../../src/database/connection.js';

export async function createTestDatabase() {
    let connection;
    try {
        connection = await mysql.createConnection({ ...getDatabaseConfig(), database: undefined });
    } catch (error) {
        throw new Error('MySQL integration tests require a running server and valid DB_* settings in API/.env.', { cause: error });
    }
    const name = `filmlog_test_${randomBytes(8).toString('hex')}`;
    let created = false;
    try {
        const [[{ version }]] = await connection.query('SELECT VERSION() AS version');
        const [major, minor, patch] = version.split('.').map(Number);
        if (/mariadb/i.test(version) || major < 8 || (major === 8 && minor === 0 && patch < 16)) {
            throw new Error(`Tests require MySQL 8.0.16 or newer; found ${version}.`);
        }
        await connection.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [name]);
        created = true;
        await connection.query('USE ??', [name]);
        await connection.query("SET time_zone = '+00:00'");
        return {
            name, connection, version,
            async dispose() {
                try {
                    if (created && /^filmlog_test_[a-f0-9]{16}$/.test(name)) {
                        await connection.query('DROP DATABASE ??', [name]);
                        created = false;
                    }
                } finally {
                    await connection.end();
                }
            },
        };
    } catch (error) {
        try {
            if (created) await connection.query('DROP DATABASE ??', [name]);
        } finally {
            await connection.end();
        }
        throw error;
    }
}
