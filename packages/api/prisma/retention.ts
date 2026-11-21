import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';

const days = z.coerce.number().int().min(1).max(36500).parse(process.env.RETENTION_CONTACT_DAYS);
const apply = process.argv.includes('--apply');
const cutoff = new Date(Date.now() - days * 86400000);
const db = new PrismaClient();
try {
  const where = {
    status: { in: ['COMPLETED', 'CANCELLED'] as ('COMPLETED' | 'CANCELLED')[] },
    updatedAt: { lt: cutoff },
    phone: { not: '' },
  };
  if (apply) {
    const result = await db.order.updateMany({
      where,
      data: { customerName: 'Cliente', phone: '', deliveryAddress: Prisma.DbNull, pushToken: null },
    });
    console.log(`Recapiti rimossi da ${result.count} ordini.`);
  } else {
    console.log(`Ordini candidati alla rimozione dei recapiti: ${await db.order.count({ where })}.`);
  }
} finally {
  await db.$disconnect();
}
