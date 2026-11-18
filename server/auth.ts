import crypto from 'node:crypto';
import type {NextFunction, Request, Response} from 'express';
import type {UserRole, WorkerStatus} from '../src/types.ts';
import {db, getOrCreateSessionSecret} from './db.ts';

export const SESSION_COOKIE_NAME = 'imc_session';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

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

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

interface TokenPayload {
  uid: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export function signSessionToken(uid: string, role: UserRole): string {
  const secret = getOrCreateSessionSecret();
  const payload: TokenPayload = {
    uid,
    role,
    iat: Date.now(),
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;
  const secret = getOrCreateSessionSecret();
  const expectedSig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
    if (!parsed.uid || !parsed.exp || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

const DOWNLOAD_TICKET_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface DownloadTicketPayload {
  uid: string;
  purpose: string;
  iat: number;
  exp: number;
}

export function signDownloadTicket(uid: string, purpose: string): {ticket: string; expiresAt: string} {
  const secret = getOrCreateSessionSecret();
  const exp = Date.now() + DOWNLOAD_TICKET_TTL_MS;
  const payload: DownloadTicketPayload = {
    uid,
    purpose,
    iat: Date.now(),
    exp,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`ticket:${encoded}`).digest('base64url');
  return {
    ticket: `${encoded}.${sig}`,
    expiresAt: new Date(exp).toISOString(),
  };
}

export function verifyDownloadTicket(ticket: string, expectedPurpose: string): DownloadTicketPayload | null {
  const parts = ticket.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;
  const secret = getOrCreateSessionSecret();
  const expectedSig = crypto.createHmac('sha256', secret).update(`ticket:${encoded}`).digest('base64url');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as DownloadTicketPayload;
    if (!parsed.uid || parsed.purpose !== expectedPurpose || !parsed.exp || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      result[key] = decodeURIComponent(val);
    }
  }
  return result;
}

export function extractTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[SESSION_COOKIE_NAME]) {
    return cookies[SESSION_COOKIE_NAME];
  }
  return null;
}

export function setSessionCookie(res: Response, token: string, req: Request): void {
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: Boolean(isSecure),
    sameSite: isSecure ? 'none' : 'lax',
    maxAge: TOKEN_TTL_MS,
    path: '/',
  });
}

export function clearSessionCookie(res: Response, req: Request): void {
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: Boolean(isSecure),
    sameSite: isSecure ? 'none' : 'lax',
    path: '/',
  });
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
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
  const user = db
    .prepare(
      `SELECT id, name, username, role, phone, shift_name, worker_status, is_active, created_at
       FROM users WHERE id = ?`,
    )
    .get(payload.uid) as AuthenticatedUserRow | undefined;

  if (!user || user.is_active !== 1) {
    res.status(401).json({error: 'الحساب غير نشط أو غير موجود.'});
    return;
  }

  req.user = user;
  next();
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
