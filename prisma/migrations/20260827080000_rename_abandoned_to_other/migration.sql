-- Rename the ViolationType enum value ABANDONED to OTHER.
-- This is a safe rename: it changes the stored label, not the column or table.
ALTER TYPE "ViolationType" RENAME VALUE 'ABANDONED' TO 'OTHER';
