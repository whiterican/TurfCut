/**
 * The worker's guide (Caden, Nov 10): the explanations that used to sit on every screen, in one
 * place. Every statement describes existing behaviour; nothing here is a new promise. Change a
 * sentence only with the code that makes it true (guide.test.ts pins the ones about pay and privacy).
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
    ],
    link: { href: "/profile/sharing", label: "Open Who sees what" },
  },
];
