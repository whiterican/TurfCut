-- TEST-ONLY stand-in for W2's append-only stop outcome (not part of the proposal).
CREATE TABLE "public"."StopOutcome" (
  "id" UUID NOT NULL PRIMARY KEY,
  "shiftId" UUID NOT NULL REFERENCES "public"."Shift"("id") ON DELETE RESTRICT,
  "walkbookId" UUID REFERENCES "public"."Walkbook"("id") ON DELETE RESTRICT,
  "stopNumber" INTEGER,
  "outcome" TEXT NOT NULL,
  CHECK (("walkbookId" IS NULL) = ("stopNumber" IS NULL))
);
-- Deliberately NO key to WalkbookStop or ImportedAddress.
ALTER TABLE "public"."StopOutcome" ENABLE ROW LEVEL SECURITY;
