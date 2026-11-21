-- Turfcut F1 migration — the signature counter's undo. Run BEFORE deploying
-- the code that records it. Paste into the Supabase SQL editor. Safe to run
-- again: the value is skipped when it already exists. Run it as its own
-- paste: it adds an enum value.
-- (Fresh databases: supabase-manual-setup.sql already includes it.)
--
-- Change (approved by Caden, Nov 21: "new event type"). Additive; nothing
-- existing changes:
--   1. WorkEventType gains SIGNATURE_UNDONE: the worker takes one signature
--      back off the counter (a mis-tap). It is a new event in the
--      append-only ledger; the +1s are never touched.
--      Payload: { "count": 1 }.

ALTER TYPE "public"."WorkEventType" ADD VALUE IF NOT EXISTS 'SIGNATURE_UNDONE';
