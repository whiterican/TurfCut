-- Turfcut M8.2 migration — shift slots. Run after s2-notices.sql, BEFORE
-- deploying this code. Paste into the Supabase SQL editor. Safe to run
-- again: everything it adds is skipped when it already exists. (Fresh
-- databases: supabase-manual-setup.sql already includes it.)
--
-- Changes (M8 plan, approved Oct 18). Additive; no existing row changes:
--   1. ShiftSlot: an open shift staff post on a job, with a number of seats.
--      Times and place are fixed once posted; only the seats and the status
--      change. Server-only (RLS on, no policies, no grants).
--   2. Shift.slotId: the slot a shift took a seat on, if any. Existing
--      shifts keep NULL. A partial unique index allows one live seat per
--      engagement per slot.

BEGIN;
-- Don't queue the app behind a long transaction: after 5 seconds of waiting
-- this stops and rolls back (nothing changes); run it again.
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  CREATE TYPE "public"."ShiftSlotStatus" AS ENUM ('OPEN', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "public"."ShiftSlot" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "headcount" INTEGER NOT NULL,
    "stagingLocation" TEXT,
    "stagingLat" DOUBLE PRECISION,
    "stagingLng" DOUBLE PRECISION,
    "supervisorId" UUID,
    "turfArea" JSONB,
    "notes" TEXT,
    "status" "public"."ShiftSlotStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftSlot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ShiftSlot_times" CHECK ("endsAt" > "startsAt" AND "endsAt" <= "startsAt" + interval '14 hours'),
    CONSTRAINT "ShiftSlot_headcount" CHECK ("headcount" BETWEEN 1 AND 200),
    CONSTRAINT "ShiftSlot_notes_length" CHECK ("notes" IS NULL OR char_length("notes") <= 500),
    CONSTRAINT "ShiftSlot_staging_pair" CHECK (("stagingLat" IS NULL) = ("stagingLng" IS NULL)),
    CONSTRAINT "ShiftSlot_closed" CHECK (("status" = 'CLOSED') = ("closedAt" IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS "ShiftSlot_jobId_startsAt_idx" ON "public"."ShiftSlot"("jobId", "startsAt");
CREATE INDEX IF NOT EXISTS "ShiftSlot_supervisorId_idx" ON "public"."ShiftSlot"("supervisorId");
CREATE INDEX IF NOT EXISTS "ShiftSlot_createdById_idx" ON "public"."ShiftSlot"("createdById");
DO $$ BEGIN
  ALTER TABLE "public"."ShiftSlot" ADD CONSTRAINT "ShiftSlot_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."ShiftSlot" ADD CONSTRAINT "ShiftSlot_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."ShiftSlot" ADD CONSTRAINT "ShiftSlot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "public"."Shift" ADD COLUMN IF NOT EXISTS "slotId" UUID;
CREATE INDEX IF NOT EXISTS "Shift_slotId_idx" ON "public"."Shift"("slotId");
-- A backstop under the app's locks: one live seat per engagement per slot.
-- (Not in schema.prisma, which can't express a partial index.)
CREATE UNIQUE INDEX IF NOT EXISTS "Shift_slot_seat_key" ON "public"."Shift"("slotId", "engagementId") WHERE "slotId" IS NOT NULL AND "status" <> 'CANCELLED';
DO $$ BEGIN
  ALTER TABLE "public"."Shift" ADD CONSTRAINT "Shift_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "public"."ShiftSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Server-only: no grants, no policies (deny by default).
ALTER TABLE "public"."ShiftSlot" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."ShiftSlot" FROM anon, authenticated;

COMMIT;
