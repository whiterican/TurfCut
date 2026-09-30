/**
 * The seeded shift's work events, shared by prisma/seed.ts and the scorecard
 * tests so "scorecard matches the seed" is checked against the real seed
 * data. prisma/manual-seed.sql mirrors this list by hand — keep them in sync.
 *
 * Timeline (offsets from check-in):
 *   0:00 CHECK_IN · 0:05 PACKET_PICKUP · 1:30–2:00 paused · 4:00 CHECK_OUT
 *   40 doors, 18 contacts, 22 signatures submitted, 20 accepted at batch count.
 *
 * Hand-computed scorecard (see src/lib/scorecard.test.ts):
 *   active hours      4h − 0.5h paused = 3.5
 *   doors/active hr   40 / 3.5         = 11.428571…
 *   doors/shift       40 / 1           = 40
 *   contact rate      18 / 40          = 0.45
 *   sigs/active hr    22 / 3.5         = 6.285714…
 *   acceptance rate   20 / 22          = 0.909090…
 *   show rate         1 / 1            = 1
 */

export const SEED_SHIFT_ID = "00000000-0000-0000-0000-000000000201";
export const SEED_SHIFT_HOURS = 4;

const MIN = 60_000;

/** Ids 131–135 are the M0 events (unchanged); 136–140 were added in M1. */
export const SEED_SHIFT_EVENTS = [
  { id: "00000000-0000-0000-0000-000000000136", type: "CHECK_IN", offsetMs: 0, payload: {} },
  { id: "00000000-0000-0000-0000-000000000131", type: "PACKET_PICKUP", offsetMs: 5 * MIN, payload: { packetId: "PKT-0001", sheets: 25 } },
  { id: "00000000-0000-0000-0000-000000000132", type: "DOOR_KNOCK", offsetMs: 80 * MIN, payload: { count: 40 } },
  { id: "00000000-0000-0000-0000-000000000137", type: "PAUSE_START", offsetMs: 90 * MIN, payload: { reason: "break" } },
  { id: "00000000-0000-0000-0000-000000000138", type: "PAUSE_END", offsetMs: 120 * MIN, payload: {} },
  { id: "00000000-0000-0000-0000-000000000133", type: "CONTACT", offsetMs: 180 * MIN, payload: { count: 18 } },
  { id: "00000000-0000-0000-0000-000000000134", type: "SIGNATURE_SUBMITTED", offsetMs: 200 * MIN, payload: { count: 22 } },
  { id: "00000000-0000-0000-0000-000000000135", type: "PACKET_RETURN", offsetMs: 230 * MIN, payload: { packetId: "PKT-0001", sheetsReturned: 25, signatures: 22 } },
  { id: "00000000-0000-0000-0000-000000000139", type: "CHECK_OUT", offsetMs: 240 * MIN, payload: {} },
  { id: "00000000-0000-0000-0000-000000000140", type: "BATCH_COUNT", offsetMs: 250 * MIN, payload: { submitted: 22, accepted: 20 } },
] as const;
