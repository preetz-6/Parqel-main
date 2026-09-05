-- Convert any existing PARKING_ADMIN assignments to SUPERVISOR first
UPDATE "UserRole" SET role = 'SUPERVISOR' WHERE role = 'PARKING_ADMIN';

-- Create new Role enum without PARKING_ADMIN
CREATE TYPE "Role_new" AS ENUM ('EMPLOYEE', 'GUARD', 'SUPERVISOR', 'ADMIN');

-- Update UserRole table to use the new enum type
ALTER TABLE "UserRole" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");

-- Drop old Role enum and rename new enum to Role
DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";
