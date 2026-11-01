import Image from "next/image";
import type { JobType } from "@prisma/client";

/**
 * The picture on a job row and at the head of a job (#111): the campaign's
 * own published header when the job has one, else the category's licensed
 * photograph (public/photos/MANIFEST.md), never a drawing. Decorative: the
 * words beside it carry the job. `sizes` tells the browser how wide the slot
 * is, so a 76px thumbnail doesn't fetch the 1200px file.
 */
const CATEGORY_PHOTO: Record<JobType, string> = {
  PETITION: "/photos/job-petition.jpg",
  CANVASS: "/photos/job-canvass.jpg",
};

export function jobPhotoSrc(type: JobType, campaignHeaderUrl?: string | null): string {
  return campaignHeaderUrl || CATEGORY_PHOTO[type] || "/photos/job-field.jpg";
}

export function JobPhoto({ type, src, sizes, priority = false }: { type: JobType; src?: string | null; sizes: string; priority?: boolean }) {
  return (
    <Image
      src={jobPhotoSrc(type, src)}
      alt=""
      fill
      sizes={sizes}
      priority={priority}
      className="job-photo"
      // Local files and the media host only; a campaign header is already a sized upload.
      unoptimized={!!src}
    />
  );
}
