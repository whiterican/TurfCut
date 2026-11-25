-- Turfcut F2 migration — opt-in area sharing on the signature counter. Run
-- after f1-signature-undo.sql and BEFORE deploying the code that records it.
-- Paste into the Supabase SQL editor, as a paste of its own (it adds an enum
-- value). Safe to run again: the value is skipped when it already exists.
-- (Fresh databases: supabase-manual-setup.sql already includes it.)
--
-- Change (approved by Caden, Nov 21: "last-tap area, opt-in"). Additive;
-- nothing existing changes:
--   1. WorkEventType gains LOCATION_SHARING: the worker turns area sharing on
--      or off for one shift. Off by default; each change is its own event,
--      so the record shows when the worker agreed and when they stopped.
--      Payload: { "on": true | false, "consent": 1 } (the version of the
--      words the worker agreed to).
--   No new column: while sharing is on, a signature event's payload carries
--   "area": { "lat", "lng" }, the centre of a 0.01-degree grid cell (about
--   1 km), never the phone's position. The server snaps it again.

ALTER TYPE "public"."WorkEventType" ADD VALUE IF NOT EXISTS 'LOCATION_SHARING';
