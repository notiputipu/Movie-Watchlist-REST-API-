import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerSchema } from '../../src/validators/auth.validator.js';

test('password limit counts UTF-8 bytes without trimming or truncating', () => {
    const user = { username: 'learning', email: 'USER@example.com' };
    assert.equal(registerSchema.safeParse({ ...user, password: 'a'.repeat(72) }).success, true);
    assert.equal(registerSchema.safeParse({ ...user, password: 'a'.repeat(73) }).success, false);
    assert.equal(registerSchema.safeParse({ ...user, password: '😀'.repeat(18) }).success, true);
    assert.equal(registerSchema.safeParse({ ...user, password: '😀'.repeat(19) }).success, false);
    const parsed = registerSchema.parse({ ...user, password: '  password  ', ignored: true });
    assert.equal(parsed.password, '  password  ');
    assert.equal(parsed.email, 'user@example.com');
    assert.equal('ignored' in parsed, false);
});
