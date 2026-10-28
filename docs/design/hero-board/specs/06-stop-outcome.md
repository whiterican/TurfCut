# 06 — Stop Outcome: future feature, persistence blocked

**Current source:** there is no authorized stop route or Stop/Visit/Lead model at the audited SHA. `WorkEvent.DOOR_KNOCK` is aggregate work, and turf pins are map marks. Neither proves a visit to a house. Coordinate with the existing #110 expansion plan; do not introduce a disconnected prototype app into production.

**Visual contract for approved future implementation:** compact back/title/settings header → address/location card with map action → **Select Outcome** radio group → **Add a note (optional)** textarea → full-width Forest **Save Outcome** → dock. Exact option text: **Not home**, **Answered – not interested**, **Interested**, **Callback**, **Sale**, **Do not knock**. No default selection, no apparent successful submission without acknowledgement. Whether Sale applies to a specific job must be validated against the approved product taxonomy.

**Geometry:** 14px gutters; address H3 with caption locality; 44px minimum radio rows; 20px group spacing; textarea at least 100px, content-driven; one primary Save button above the keyboard/dock clearance. Back navigation must protect an unsaved note through the existing pattern.

**Required model/API decision before production code:** assigned stop identity and address source, job/shift/worker ownership, permitted outcome by job type, append-only event/correction semantics, idempotency key, offline queue storage, server validation/acknowledgement, do-not-knock effect, retention and follow-up/lead creation. A cosmetic branch cannot quietly create this contract.

**States/copy:** unselected → disabled Save with clear group label; saving → **Saving…**; offline → **Saved on this device. Waiting to sync.** only if durable local storage succeeded; failure → **Outcome not saved. Try again.**; acknowledgement → **Outcome saved.** Exact copy must match real durability semantics. No backend means no enabled production Save or success toast.

**Evidence:** a clearly labeled static future-state reference is allowed in docs; no claim of working implementation. After approval, require unauthorized stop/other worker/other organization, duplicate retry, offline reload, correction and stale assignment workflow tests as well as screenshots.
