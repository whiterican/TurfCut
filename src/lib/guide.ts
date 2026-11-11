/**
 * The worker's guide (Caden, Nov 10): the explanations that used to sit on every screen, in one
 * place. Every statement describes existing behaviour; nothing here is a new promise. Change a
 * sentence only with the code that makes it true (guide.test.ts pins the ones about pay, privacy and messages).
 */
export interface GuideSection {
  id: string;
  title: string;
  points: string[];
  link?: { href: string; label: string };
}

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "jobs",
    title: "Finding jobs",
    points: [
      "Every job page shows the gross rate, the credentials it needs and who handles problems, before you apply.",
      "Swipe a job right to save it and left to hide it, or use the buttons.",
      "Saving and hiding are private to you. Neither is ever used to rank jobs or people.",
    ],
    link: { href: "/jobs", label: "Open Jobs" },
  },
  {
    id: "shifts",
    title: "Shifts",
    points: [
      "The organization schedules your shifts. They appear on Home and under Work.",
      "While you're checked in, the timer counts from your check-in. It is not your verified pay time.",
      "On hourly jobs, pay counts verified time only.",
      "If a shift has ended and you're still checked in, open the shift to check out, or ask your organizer to correct the end time.",
    ],
    link: { href: "/shifts", label: "Open Work" },
  },
  {
    id: "messages",
    title: "Messages",
    points: [
      "Chats carry text and text-only documents: PDF, Word, Excel or plain text, up to 4 MB. Photos can't be sent.",
      "Do not photograph or share signed petition sheets. Custody is tracked as packet IDs and counts only.",
    ],
    link: { href: "/messages", label: "Open Messages" },
  },
  {
    id: "pay",
    title: "Getting paid",
    points: [
      "Earnings shows gross pay for shifts your supervisors approved.",
      "Each amount is worked out from your verified hours, completed shifts or accepted work at the job's posted rate.",
      "Turfcut never takes a cut of your pay. Campaigns pay the platform fee.",
      "Once pay is approved for payment, its amount never changes. A correction shows up as a separate adjustment.",
      "Set up payouts once and approved pay goes to your bank through Stripe. Stripe collects your bank and tax details; Turfcut never sees them.",
      "You get a receipt for every payment sent to you.",
      "If a reviewed shift's pay looks wrong, dispute it from Earnings.",
    ],
    link: { href: "/earnings", label: "Open Earnings" },
  },
  {
    id: "privacy",
    title: "Who sees what",
    points: [
      "You choose who sees each part of your scorecard, your availability and your credentials.",
      "You choose whether organizations can find you.",
      "Your political-fit answers are used only as you authorize. Turfcut never guesses your politics.",
      "Download my data, in Settings, gives you your profile, experience, consent history, shifts, pay, disputes and the messages you sent.",
    ],
    link: { href: "/profile/sharing", label: "Open Who sees what" },
  },
];

/**
 * The organization's guide. Each point restates what its screen already says
 * (Field, Pay, Credentials, Members, organization Settings), so the screens
 * can stay short.
 */
export const ORG_GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "publishing",
    title: "Publishing jobs",
    points: [
      "A job publishes only under an approved, current, unexpired jurisdiction rule profile. Anything else blocks publishing and says why.",
      "When a rule profile is superseded, the job has to be filed under the current rules.",
    ],
    link: { href: "/jobs", label: "Open Jobs" },
  },
  {
    id: "field",
    title: "Field",
    points: [
      "Turf drawn on a shift appears on the map and fills as its workers check in.",
      "Nobody's position is ever on the map.",
    ],
    link: { href: "/field", label: "Open Field" },
  },
  {
    id: "messages",
    title: "Messages",
    points: [
      "Chats carry text and text-only documents: PDF, Word, Excel or plain text, up to 4 MB. Photos can't be sent.",
      "Do not photograph or share signed petition sheets. Custody is tracked as packet IDs and counts only.",
    ],
    link: { href: "/messages", label: "Open Messages" },
  },
  {
    id: "pay",
    title: "Pay",
    points: [
      "Supervisors approve the work; someone else approves the pay. Whoever approved a shift's work cannot approve its pay.",
      "Each shift's pay line is calculated from verified work when a supervisor approves the shift.",
      "Workers receive the full gross amount. The 15% platform fee is invoiced to your organization.",
    ],
    link: { href: "/pay", label: "Open Pay" },
  },
  {
    id: "credentials",
    title: "Checking credentials",
    points: [
      "Record that you checked a hired worker's credential, and how. The worker sees which organization verified it; other organizations see only that one did, and how.",
      "Turfcut never shows you a credential's number. Look the worker up by name in the state's registry, or ask to see the original.",
      "A worker may share a photo of a Colorado training certificate with organizations that hire them. It shows whatever is printed on it.",
      "The worker sees each time your organization opens that photo. Once you have, you can record that you checked it that way.",
      "A photo is something to check, not proof by itself.",
    ],
    link: { href: "/org/credentials", label: "Open Credentials" },
  },
  {
    id: "team",
    title: "Your team",
    points: [
      "Someone new joins by opening the link in the invitation email. Anyone who already has a Turfcut login sees the invite after signing in and chooses whether to accept.",
      "Invites last 7 days.",
      "Every invite, role change and removal is recorded in the audit log.",
    ],
    link: { href: "/org/settings/members", label: "Open Members" },
  },
];

/** The guide for a role: the worker's, or the organization's for everyone else. */
export const guideFor = (role: string): GuideSection[] => (role === "WORKER" ? GUIDE_SECTIONS : ORG_GUIDE_SECTIONS);

