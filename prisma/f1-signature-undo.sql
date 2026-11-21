-- Turfcut F1 migration — the signature counter's undo. Run BEFORE deploying
-- the code that records it. Paste into the Supabase SQL editor. Safe to run
-- again: the value is skipped when it already exists.
-- (Fresh databases: supabase-manual-setup.sql already includes it.)
--
-- Change (approved by Caden, Nov 21: "new event type"). Additive; nothing
-- existing changes:
--   1. WorkEventType gains SIGNATURE_UNDONE: the worker takes back their
--      latest +1 on the signature counter (a mis-tap). It is a new event in
--      the append-only ledger; the +1 it takes back is never touched.
--      Payload: { "count": 1 }.

ALTER TYPE "public"."WorkEventType" ADD VALUE IF NOT EXISTS 'SIGNATURE_UNDONE';
