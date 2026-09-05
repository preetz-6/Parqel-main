-- Add GPS coordinates to violations for on-site location context.
-- Both are optional — GPS may be unavailable or denied by the user.
ALTER TABLE "violations" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "violations" ADD COLUMN "longitude" DOUBLE PRECISION;
