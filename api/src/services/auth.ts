import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const SECRET: string = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
const EXPIRES_IN = '7d'; // session longue (ventes événementielles sur plusieurs jours)

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, SECRET) as JwtPayload;
}
