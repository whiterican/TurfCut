import Image from "next/image";
import brandMark from "../../../public/brand/icons/icon-192.png";
import { HOW_IT_WORKS, LANDING_LINE, LANDING_PHOTO, LANDING_PROOF } from "@/lib/landing-copy";

/**
 * The picture side of the sign-in split (redesign §5, HeroPage). From 1024 it is the landing page beside the
 * form: its photograph, its line and what the app does in three steps (Caden, Nov 14: the panel was a large empty
 * dark space; it should be the page a visitor saw before this one). The words are the landing page's own
 * (lib/landing-copy). Below 1024 there is no panel, only the line on the page above the form.
 * Decorative: the form beside it is the page, and everything here is said on the landing page.
 * The mark shows only where the header doesn't already carry it beside the band (.hero-split-mark in globals.css).
 */
export function HeroArt() {
  return (
    <div className="hero-split-art" aria-hidden>
      {/* Not fetched below 1024, where it is not drawn: lazy, and given no width there. */}
      <Image src={LANDING_PHOTO} alt="" fill sizes="(min-width: 64rem) 45vw, 1px" className="hero-split-photo object-cover" />
      <div className="hero-split-scrim" />
      <Image src={brandMark} alt="" width={96} height={96} unoptimized className="hero-split-mark size-10 rounded-full lg:size-14 lg:rounded-[var(--radius-card)]" />
      <div className="hero-split-copy">
        <p className="hero-split-line">{LANDING_LINE}</p>
        <p className="hero-split-proof">{LANDING_PROOF}</p>
        <ol className="hero-split-steps">
          {HOW_IT_WORKS.map((step) => (
            <li key={step.number}>
              <span className="hero-split-step-n">{step.number}</span>
              <span>
                <span className="hero-split-step-title">{step.title}</span>
                <span className="hero-split-step-text">{step.description}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
