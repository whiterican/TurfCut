import { describe, expect, it } from "vitest";
import { notificationText, orgNoticeText } from "./notification-text";

const e = (over: Partial<{ status: string; wasOffer: boolean }> = {}) => ({
  id: "eng", jobId: "job", status: "APPLIED", wasOffer: false, ...over,
  worker: { displayName: "Alex Rivera" },
  job: { title: "Aurora canvass", org: { name: "Front Range" } },
});

describe("notification words", () => {
  it("workers read the organization and job, and land where they can act", () => {
    expect(notificationText("INVITATION_RECEIVED", e(), "worker")).toEqual({ text: "Front Range invited you to Aurora canvass.", href: "/jobs/invitations" });
    expect(notificationText("OFFER_RECEIVED", e(), "worker").href).toBe("/jobs/job");
  });
  it("a closed job says what ended: an application, an offer or an invitation", () => {
    expect(notificationText("JOB_CLOSED", e({ status: "DECLINED" }), "worker").text).toMatch(/before a decision on your application/);
    expect(notificationText("JOB_CLOSED", e({ status: "DECLINED", wasOffer: true }), "worker").text).toMatch(/offer was withdrawn/);
    expect(notificationText("JOB_CLOSED", e({ status: "WITHDRAWN" }), "worker").text).toMatch(/invitation was withdrawn/);
  });
  it("staff read the worker's display name and land on the applicant page; no staff name is ever in a worker's notice", () => {
    expect(notificationText("APPLICATION_RECEIVED", e(), "org")).toEqual({ text: "Alex Rivera applied to Aurora canvass.", href: "/hiring/job/people/eng" });
    expect(notificationText("OFFER_ACCEPTED", e(), "org").text).toBe("Alex Rivera accepted the offer on Aurora canvass.");
    for (const k of ["INVITATION_RECEIVED", "OFFER_RECEIVED", "NOT_SELECTED", "INVITATION_WITHDRAWN", "JOB_CLOSED"] as const) {
      expect(notificationText(k, e(), "worker").text).not.toMatch(/Alex Rivera/);
    }
  });

  it("Turfcut's decision on the organization names no staff member and no reason, and leads to Settings (M10.2)", () => {
    expect(orgNoticeText("ORG_APPROVED")).toEqual({ text: "Turfcut approved your organization for the pilot. Jobs can publish once the rest of the gate in Settings is done.", href: "/org/settings" });
    expect(orgNoticeText("ORG_APPROVAL_REVOKED")?.href).toBe("/org/settings");
    expect(orgNoticeText("ORG_APPROVAL_REVOKED")?.text).not.toMatch(/@|reason/i);
    expect(orgNoticeText("PAYOUT_SENT")).toBeNull();
  });
});
