CREATE TYPE "Fulfillment" AS ENUM ('PICKUP', 'DELIVERY');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'RECEIVED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

CREATE TABLE "Category" (
  "id" TEXT PRIMARY KEY, "slug" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '', "imageUrl" TEXT, "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "Product" (
  "id" TEXT PRIMARY KEY, "categoryId" TEXT NOT NULL REFERENCES "Category"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "name" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '', "imageUrl" TEXT,
  "pricePerKgCents" INTEGER NOT NULL CHECK ("pricePerKgCents" > 0),
  "maxGrams" INTEGER NOT NULL DEFAULT 10000 CHECK ("maxGrams" >= 500 AND mod("maxGrams", 500) = 0),
  "available" BOOLEAN NOT NULL DEFAULT true, "archived" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "Product_categoryId_archived_available_idx" ON "Product" ("categoryId", "archived", "available");
CREATE TABLE "Promotion" (
  "id" TEXT PRIMARY KEY, "productId" TEXT NOT NULL REFERENCES "Product"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "pricePerKgCents" INTEGER NOT NULL CHECK ("pricePerKgCents" > 0), "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CHECK ("endsAt" > "startsAt")
);
CREATE INDEX "Promotion_productId_active_startsAt_endsAt_idx" ON "Promotion" ("productId", "active", "startsAt", "endsAt");
CREATE TABLE "BusinessSettings" (
  "id" TEXT PRIMARY KEY DEFAULT 'business', "name" TEXT NOT NULL DEFAULT 'Macelleria Chiappetta',
  "address" TEXT, "phone" TEXT, "openingHours" TEXT, "pickupNotes" TEXT, "deliveryHours" TEXT, "privacyPolicyUrl" TEXT, "termsUrl" TEXT,
  "deliveryEnabled" BOOLEAN NOT NULL DEFAULT false, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "DeliveryZone" (
  "id" TEXT PRIMARY KEY, "postalCode" TEXT NOT NULL UNIQUE, "city" TEXT NOT NULL,
  "feeCents" INTEGER NOT NULL CHECK ("feeCents" >= 0),
  "minOrderCents" INTEGER NOT NULL DEFAULT 0 CHECK ("minOrderCents" >= 0), "active" BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE "Customer" (
  "id" TEXT PRIMARY KEY, "tokenHash" TEXT NOT NULL UNIQUE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "Order" (
  "id" TEXT PRIMARY KEY, "number" SERIAL NOT NULL UNIQUE, "idempotencyKey" TEXT NOT NULL UNIQUE,
  "requestHash" TEXT NOT NULL, "guestTokenHash" TEXT NOT NULL,
  "customerId" TEXT REFERENCES "Customer"("id") ON UPDATE CASCADE ON DELETE SET NULL, "pickupSnapshot" JSONB, "deliveryHours" TEXT,
  "paidAt" TIMESTAMP(3), "refundedAt" TIMESTAMP(3), "pushToken" TEXT,
  "cancellationRequested" BOOLEAN NOT NULL DEFAULT false, "stripeRefundId" TEXT UNIQUE,
  "customerName" TEXT NOT NULL, "phone" TEXT NOT NULL, "fulfillment" "Fulfillment" NOT NULL,
  "deliveryAddress" JSONB, "subtotalCents" INTEGER NOT NULL CHECK ("subtotalCents" >= 0),
  "deliveryFeeCents" INTEGER NOT NULL CHECK ("deliveryFeeCents" >= 0), "totalCents" INTEGER NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT', "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "stripePaymentId" TEXT UNIQUE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CHECK ("totalCents" = "subtotalCents" + "deliveryFeeCents")
);
CREATE INDEX "Order_customerId_createdAt_idx" ON "Order" ("customerId", "createdAt");
CREATE INDEX "Order_status_createdAt_idx" ON "Order" ("status", "createdAt");
CREATE INDEX "Order_paidAt_idx" ON "Order" ("paidAt");
CREATE INDEX "Order_refundedAt_idx" ON "Order" ("refundedAt");
CREATE TABLE "OrderItem" (
  "id" TEXT PRIMARY KEY, "orderId" TEXT NOT NULL REFERENCES "Order"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "productId" TEXT REFERENCES "Product"("id") ON UPDATE CASCADE ON DELETE SET NULL, "name" TEXT NOT NULL,
  "grams" INTEGER NOT NULL CHECK ("grams" >= 500 AND mod("grams", 500) = 0),
  "actualGrams" INTEGER CHECK ("actualGrams" IS NULL OR "actualGrams" > 0),
  "pricePerKgCents" INTEGER NOT NULL CHECK ("pricePerKgCents" > 0), "totalCents" INTEGER NOT NULL CHECK ("totalCents" > 0)
);
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem" ("orderId");
CREATE TABLE "StripeEvent" ("id" TEXT PRIMARY KEY, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "AdminUser" (
  "id" TEXT PRIMARY KEY, "email" TEXT NOT NULL UNIQUE, "passwordHash" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "AdminSession" (
  "tokenHash" TEXT PRIMARY KEY, "adminId" TEXT NOT NULL REFERENCES "AdminUser"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "AdminSession_adminId_expiresAt_idx" ON "AdminSession" ("adminId", "expiresAt");
CREATE TABLE "AuditLog" (
  "id" TEXT PRIMARY KEY, "adminId" TEXT NOT NULL, "action" TEXT NOT NULL, "targetId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuditLog_targetId_createdAt_idx" ON "AuditLog" ("targetId", "createdAt");
CREATE TABLE "CatalogImage" (
  "id" TEXT PRIMARY KEY, "bytes" BYTEA NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "PushMessage" (
  "id" TEXT PRIMARY KEY, "orderId" TEXT NOT NULL, "body" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextAttempt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "attempts" INTEGER NOT NULL DEFAULT 0, "deliveredAt" TIMESTAMP(3)
);
CREATE INDEX "PushMessage_deliveredAt_nextAttempt_idx" ON "PushMessage" ("deliveredAt", "nextAttempt");
