import Image from "next/image";
import brandMark from "../../../public/brand/icons/icon-192.png";

/**
 * The picture side of the sign-in split (redesign §5, HeroPage). Until the
 * owner's photos arrive it is the brand on the eggplant frame, not a stock
 * placeholder: nothing on it pretends to be a real person or place.
 */
export function HeroArt() {
  return (
    <div className="hero-split-art" aria-hidden>
      <Image src={brandMark} alt="" width={96} height={96} unoptimized className="size-16 rounded-2xl lg:size-24" />
      <p className="hero-split-line">Field work that matters.</p>
    </div>
  );
}
