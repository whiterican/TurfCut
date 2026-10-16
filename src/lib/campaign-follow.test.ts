import { describe, expect, it } from "vitest";
import { POST_NOTICE_EXCERPT, postNoticeText, dayStart, feedBadge, feedSeenAt, feedSources, followChange, likeChange, MAX_NOTICES_PER_CAMPAIGN_PER_DAY, noticeAllowed, noticeRecipients } from "./campaign-follow";

describe("feed sources", () => {
  it("are the followed and the hiring campaigns, following winning as the reason", () => {
    const m = feedSources(["a", "b"], ["b", "c"]);
    expect([...m.entries()].sort()).toEqual([
      ["a", "following"],
      ["b", "following"],
      ["c", "hired"],
    ]);
  });
  it("are empty for a worker who follows nobody and was never hired", () => {
    expect(feedSources([], []).size).toBe(0);
  });
});

describe("follow changes", () => {
  it("open a row when not following", () => {
    expect(followChange(null, { follow: true })).toBe("open");
    expect(followChange(null, { follow: true, notify: true })).toBe("open");
  });
  it("close the open row when unfollowing, and do nothing when there's none", () => {
    expect(followChange({ notify: true }, { follow: false })).toBe("close");
    expect(followChange(null, { follow: false })).toBe("none");
  });
  it("replace the row only when the notice setting changes (rows never change)", () => {
    expect(followChange({ notify: false }, { follow: true, notify: true })).toBe("replace");
    expect(followChange({ notify: true }, { follow: true, notify: false })).toBe("replace");
    expect(followChange({ notify: true }, { follow: true, notify: true })).toBe("none");
    expect(followChange({ notify: true }, { follow: true })).toBe("none");
  });
});

describe("likes", () => {
  it("toggle one open row", () => {
    expect(likeChange(false, true)).toBe("open");
    expect(likeChange(true, false)).toBe("close");
    expect(likeChange(true, true)).toBe("none");
    expect(likeChange(false, false)).toBe("none");
  });
});

describe("notices", () => {
  it("stop at the daily cap per campaign", () => {
    expect(noticeAllowed(0)).toBe(true);
    expect(noticeAllowed(MAX_NOTICES_PER_CAMPAIGN_PER_DAY - 1)).toBe(true);
    expect(noticeAllowed(MAX_NOTICES_PER_CAMPAIGN_PER_DAY)).toBe(false);
  });
  it("count days in UTC", () => {
    expect(dayStart(new Date("2026-10-11T23:59:59.999Z")).toISOString()).toBe("2026-10-11T00:00:00.000Z");
    expect(dayStart(new Date("2026-10-12T00:00:00.000Z")).toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });
  it("go to followers who asked, once each, under the daily cap", () => {
    const followers = [
      { workerId: "a", notify: true },
      { workerId: "b", notify: false },
      { workerId: "c", notify: true },
      { workerId: "a", notify: true },
      { workerId: "d", notify: true },
    ];
    const sent = new Map([["c", MAX_NOTICES_PER_CAMPAIGN_PER_DAY], ["d", MAX_NOTICES_PER_CAMPAIGN_PER_DAY - 1]]);
    expect(noticeRecipients(followers, sent)).toEqual(["a", "d"]);
  });
});

describe("feed badge", () => {
  it("counts up to the cap, then says 9+", () => {
    expect(feedBadge(0)).toBe("Your feed");
    expect(feedBadge(1)).toBe("1 new in your feed");
    expect(feedBadge(9)).toBe("9 new in your feed");
    expect(feedBadge(10)).toBe("9+ new in your feed");
  });
});

describe("feed seen cookie", () => {
  const now = new Date("2026-10-11T12:00:00.000Z");
  it("reads a plain ISO time and nothing else", () => {
    expect(feedSeenAt("2026-10-11T11:00:00.000Z", now)?.toISOString()).toBe("2026-10-11T11:00:00.000Z");
    expect(feedSeenAt(undefined, now)).toBeNull();
    expect(feedSeenAt("yesterday", now)).toBeNull();
    expect(feedSeenAt("2026-10-11T11:00:00Z", now)).toBeNull();
    expect(feedSeenAt("2026-10-11T13:00:00.000Z", now)).toBeNull(); // a clock ahead of ours would hide new posts
  });
});

describe("a followed campaign's new post (S2.4)", () => {
  const post = { id: "p1", body: "Canvass this Saturday  \n at the library.", profile: { handle: "yes_on_7", displayName: "Yes on 7" } };
  it("names the campaign, quotes the post on one line, and links to it", () => {
    expect(postNoticeText(post)).toEqual({ text: "Yes on 7 posted: “Canvass this Saturday at the library.”", href: "/c/yes_on_7/p/p1" });
  });
  it("cuts a long post short, at a word", () => {
    const t = postNoticeText({ ...post, body: "word ".repeat(100) }).text;
    expect(t.endsWith("…”")).toBe(true);
    expect([...t].length).toBeLessThan(POST_NOTICE_EXCERPT + 30);
  });
});
