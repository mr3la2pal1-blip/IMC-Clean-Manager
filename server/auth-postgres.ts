import crypto from 'node:crypto';
import type {NextFunction, Request, Response} from 'express';
import type {UserRole, WorkerStatus} from '../src/types.ts';
import {getPostgresSessionSecret, pgQuery} from './postgres.ts';

export const SESSION_COOKIE_NAME = 'imc_session';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const DOWNLOAD_TICKET_TTL_MS = 15 * 60 * 1000;

export interface AuthenticatedUserRow {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  phone: string | null;
  shift_name: string | null;
  worker_status: WorkerStatus;
  is_active: number;
  created_at: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUserRow;
}

interface TokenPayload {uid: string; role: UserRole; iat: number; exp: number;}
interface DownloadTicketPayload {uid: string; purpose: string; iat: number; exp: number;}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex, ...rest] = storedHash.split(':');
  if (!salt || !keyHex || rest.length) return false;
  const key = Buffer.from(keyHex, 'hex');
  const derived = crypto.scryptSync(password, salt, 64);
  return key.length === derived.length && crypto.timingSafeEqual(key, derived);
}

function sign(encoded: string, prefix = ''): string {
  return crypto.createHmac('sha256', getPostgresSessionSecret()).update(`${prefix}${encoded}`).digest('base64url');
}

export function signSessionToken(uid: string, role: UserRole): string {
  const now = Date.now();
  const payload: TokenPayload = {uid, role, iat: now, exp: now + TOKEN_TTL_MS};
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

function verifySignedPayload<T extends {uid: string; exp: number}>(
  token: string,
  prefix = '',
): T | null {
  const [encoded, signature, ...rest] = token.split('.');
  if (!encoded || !signature || rest.length) return null;
  const expected = sign(encoded, prefix);
  const actualBuf = Buffer.from(signature, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (actualBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(actualBuf, expectedBuf)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T;
    if (!parsed.uid || !parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function verifySessionToken(token: string): TokenPayload | null {
  return verifySignedPayload<TokenPayload>(token);
}

export function signDownloadTicket(uid: string, purpose: string): {ticket: string; expiresAt: string} {
  const exp = Date.now() + DOWNLOAD_TICKET_TTL_MS;
  const payload: DownloadTicketPayload = {uid, purpose, iat: Date.now(), exp};
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return {ticket: `${encoded}.${sign(encoded, 'ticket:')}`, expiresAt: new Date(exp).toISOString()};
}

export function verifyDownloadTicket(ticket: string, expectedPurpose: string): DownloadTicketPayload | null {
  const payload = verifySignedPayload<DownloadTicketPayload>(ticket, 'ticket:');
  return payload?.purpose === expectedPurpose ? payload : null;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) {
      try { result[key] = decodeURIComponent(value); } catch { /* ignore malformed cookie */ }
    }
  }
  return result;
}

export function extractTokenFromRequest(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }
  return parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME] ?? null;
}

export function setSessionCookie(res: Response, token: string, req: Request): void {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true, secure: Boolean(secure), sameSite: secure ? 'none' : 'lax',
    maxAge: TOKEN_TTL_MS, path: '/',
  });
}

export function clearSessionCookie(res: Response, req: Request): void {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true, secure: Boolean(secure), sameSite: secure ? 'none' : 'lax', path: '/',
  });
}

/** Async PostgreSQL auth middleware; route registration must use this module as a unit. */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractTokenFromRequest(req);
    if (!token) {
      res.status(401).json({error: 'يلزم تسجيل الدخول للوصول إلى هذا المورد.'});
      return;
    }
    const payload = verifySessionToken(token);
    if (!payload) {
      res.status(401).json({error: 'انتهت صلاحية الجلسة أو الرمز غير صالح.'});
      return;
    }
    const result = await pgQuery<AuthenticatedUserRow>(
      `SELECT id, name, username, role, phone, shift_name, worker_status, is_active, created_at
         FROM users WHERE id = $1 LIMIT 1`,
      [payload.uid],
    );
    const user = result.rows[0];
    if (!user || user.is_active !== 1) {
      res.status(401).json({error: 'الحساب غير نشط أو غير موجود.'});
      return;
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('PostgreSQL authentication failed:', error);
    res.status(503).json({error: 'تعذر التحقق من الحساب مؤقتاً. يرجى المحاولة لاحقاً.'});
  }
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({error: 'يلزم تسجيل الدخول.'});
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({error: 'ليس لديك صلاحية تنفيذ هذا الإجراء.'});
      return;
    }
    next();
  };
}
