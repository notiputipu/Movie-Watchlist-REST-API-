import { z } from 'zod';

const email = z.string().trim().max(254).email().toLowerCase();
const password = z.string().min(8).refine(
    (value) => Buffer.byteLength(value, 'utf8') <= 72,
    'Password must not exceed 72 UTF-8 bytes',
);
export const registerSchema = z.object({
    username: z.string().trim().min(3).max(50), email, password,
});
export const loginSchema = z.object({ email, password });
