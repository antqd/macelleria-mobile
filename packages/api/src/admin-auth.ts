import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { digest } from './orders.js';
import { InputError } from './storefront.js';

const derive = promisify(scrypt);
const duration = 12 * 60 * 60;
const cookieName = 'chiappetta_admin';
const credentialSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(250),
  password: z.string().min(1).max(256),
});

export async function hashPassword(password: string) {
  const salt = randomBytes(32);
  const hash = (await derive(password, salt, 64)) as Buffer;
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

async function validPassword(password: string, stored?: string) {
  const [salt, hash] = (stored ?? `${'0'.repeat(64)}:${'0'.repeat(128)}`).split(':');
  const candidate = (await derive(password, Buffer.from(salt, 'hex'), 64)) as Buffer;
  const target = Buffer.from(hash, 'hex');
  return candidate.length === target.length && timingSafeEqual(candidate, target) && Boolean(stored);
}

function sessionHash(request: FastifyRequest) {
  const token = request.headers.cookie?.match(/(?:^|;\s*)chiappetta_admin=([a-f0-9]{64})(?:;|$)/)?.[1];
  return token ? digest(token) : null;
}

export function registerAuth(app: FastifyInstance, db: PrismaClient) {
  const origin = process.env.ADMIN_ORIGIN;
  const sessionCookie = (token: string, maxAge: number) =>
    `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${origin?.startsWith('https:') ? '; Secure' : ''}`;

  function requireOrigin(request: FastifyRequest) {
    if (!origin || request.headers.origin !== origin) throw new InputError('Origine non autorizzata.', 403);
  }

  async function requireAdmin(request: FastifyRequest) {
    const tokenHash = sessionHash(request);
    const session = tokenHash && await db.adminSession.findUnique({ where: { tokenHash }, include: { admin: true } });
    if (!session || session.expiresAt < new Date() || !session.admin.active) throw new InputError('Accedi al pannello per continuare.', 401);
    if (request.method !== 'GET' && request.method !== 'HEAD') requireOrigin(request);
    return session.admin.id;
  }

  const loginAttempts = { max: 8, timeWindow: '15 minutes' };
  app.post('/admin/session', { config: { rateLimit: loginAttempts } }, async (request, reply) => {
    requireOrigin(request);
    const { email, password } = credentialSchema.parse(request.body);
    const user = await db.adminUser.findUnique({ where: { email } });
    if (!(await validPassword(password, user?.passwordHash)) || !user?.active) throw new InputError('Credenziali non valide.', 401);
    const token = randomBytes(32).toString('hex');
    await db.$transaction([
      db.adminSession.deleteMany({ where: { adminId: user.id, OR: [
        { tokenHash: sessionHash(request) ?? '' }, { expiresAt: { lt: new Date() } },
      ] } }),
      db.adminSession.create({ data: { tokenHash: digest(token), adminId: user.id, expiresAt: new Date(Date.now() + duration * 1000) } }),
    ]);
    reply.header('Set-Cookie', sessionCookie(token, duration));
    return { email };
  });

  app.get('/admin/session', async request => {
    const id = await requireAdmin(request);
    return db.adminUser.findUniqueOrThrow({ where: { id }, select: { email: true } });
  });

  app.delete('/admin/session', async (request, reply) => {
    requireOrigin(request);
    const tokenHash = sessionHash(request);
    if (tokenHash) await db.adminSession.deleteMany({ where: { tokenHash } });
    reply.header('Set-Cookie', sessionCookie('', 0));
    return { ok: true };
  });

  return requireAdmin;
}
