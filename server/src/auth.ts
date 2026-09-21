import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { pool } from './db.js';

export interface AuthUser {
  id: string;
  username: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
    sessionToken?: string;
  }
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;

// scrypt is built into Node — no native/bcrypt dependency needed in Docker.
export const hashPassword = (password: string): string => {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
};

export const verifyPassword = (password: string, stored: string): boolean => {
  const [scheme, salt, hash] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
};

export const validateCredentials = (
  username: unknown,
  password: unknown
): { username: string; password: string } | { error: string } => {
  if (typeof username !== 'string' || !USERNAME_PATTERN.test(username)) {
    return { error: 'Username must be 3-32 characters (letters, numbers, _ . -)' };
  }
  if (
    typeof password !== 'string' ||
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    return { error: `Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters` };
  }
  return { username, password };
};

const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export const createSession = async (userId: string): Promise<string> => {
  const token = randomBytes(32).toString('hex');
  await pool.query(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)',
    [hashToken(token), userId, Date.now(), Date.now() + SESSION_TTL_MS]
  );
  return token;
};

export const deleteSession = async (token: string): Promise<void> => {
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
};

// Only the SHA-256 of the token is stored — the raw token never touches the DB.
const findUserByToken = async (token: string): Promise<AuthUser | null> => {
  const { rows } = await pool.query<{ id: string; username: string }>(
    `SELECT u.id, u.username
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > $2`,
    [hashToken(token), Date.now()]
  );
  return rows[0] ?? null;
};

export const requireAuth = async (
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const user = token ? await findUserByToken(token) : null;
  if (!user) {
    await reply.code(401).send({ error: 'Unauthorized' });
    return;
  }
  req.user = user;
  req.sessionToken = token!;
};
