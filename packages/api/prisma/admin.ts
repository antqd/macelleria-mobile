import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { hashPassword } from '../src/admin-auth.js';

const db = new PrismaClient();
try {
  const email = z.string().trim().toLowerCase().email().parse(process.env.ADMIN_BOOTSTRAP_EMAIL);
  const password = z.string().min(16).max(256).parse(process.env.ADMIN_BOOTSTRAP_PASSWORD);
  await db.adminUser.create({ data: { email, passwordHash: await hashPassword(password) } });
  console.log('Account amministratore creato.');
} finally {
  await db.$disconnect();
}
