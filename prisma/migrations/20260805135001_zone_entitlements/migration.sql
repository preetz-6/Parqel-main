-- CreateTable
CREATE TABLE "zone_entitlements" (
    "id" TEXT NOT NULL,
    "zone_id" TEXT NOT NULL,
    "user_type" "UserType" NOT NULL,

    CONSTRAINT "zone_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "zone_entitlements_zone_id_idx" ON "zone_entitlements"("zone_id");

-- CreateIndex
CREATE UNIQUE INDEX "zone_entitlements_zone_id_user_type_key" ON "zone_entitlements"("zone_id", "user_type");

-- AddForeignKey
ALTER TABLE "zone_entitlements" ADD CONSTRAINT "zone_entitlements_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "parking_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
