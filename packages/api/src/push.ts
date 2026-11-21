import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';

export function startPushWorker(db: PrismaClient, log: FastifyBaseLogger, accessToken: string) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const now = new Date();
      const batch = await db.pushMessage.findMany({
        where: { deliveredAt: null, attempts: { lt: 6 }, nextAttempt: { lte: now } },
        orderBy: { nextAttempt: 'asc' }, take: 30,
      });
      for (const message of batch) {
        const order = await db.order.findUnique({ where: { id: message.orderId }, select: { pushToken: true, number: true } });
        if (!order?.pushToken) {
          await db.pushMessage.updateMany({ where: { id: message.id, attempts: message.attempts, deliveredAt: null },
            data: { nextAttempt: new Date(Date.now() + 60_000), ...(Date.now() - message.createdAt.getTime() > 600_000 ? { deliveredAt: now } : {}) } });
          continue;
        }
        const claimed = await db.pushMessage.updateMany({
          where: { id: message.id, attempts: message.attempts, deliveredAt: null, nextAttempt: { lte: now } },
          data: { attempts: { increment: 1 }, nextAttempt: new Date(Date.now() + 60_000 * 2 ** message.attempts) },
        });
        if (!claimed.count) continue;
        try {
          const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST', signal: AbortSignal.timeout(8000),
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: order.pushToken, title: 'Macelleria Chiappetta', body: message.body,
              data: { orderId: message.orderId },
            }),
          });
          if (!response.ok) throw new Error('Invio push respinto.');
          const result = await response.json() as { data?: { status: string; details?: { error?: string } } };
          const invalid = result.data?.details?.error === 'DeviceNotRegistered';
          if (result.data?.status !== 'ok' && !invalid) throw new Error('Ticket push respinto.');
          if (invalid) await db.order.updateMany({ where: { id: message.orderId, pushToken: order.pushToken }, data: { pushToken: null } });
          await db.pushMessage.update({ where: { id: message.id }, data: { deliveredAt: new Date() } });
        } catch {
          log.warn({ messageId: message.id }, 'Invio push da riprovare');
        }
      }
    } catch {
      log.error('Coda notifiche temporaneamente non disponibile');
    } finally {
      running = false;
    }
  }, 5000).unref();
  return () => clearInterval(timer);
}
