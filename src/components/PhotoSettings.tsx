"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Camera, Trash2 } from "lucide-react";
import { removeProfilePhoto, uploadProfilePhoto, type PhotoState } from "@/app/settings/photo-actions";

/** The side of the square the browser sends: plenty for a face in a menu, and a few dozen KB. */
const EDGE = 512;
/** The server's limit (lib/image-clean MEDIA_MAX_BYTES). */
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * The photo as a centred, upright EDGE-pixel square JPEG, made in the browser
 * (a phone photo is several MB and may be stored sideways). Null when the
 * browser can't; the original is sent then, and the server judges it.
 */
async function square(file: File): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.min(EDGE, side);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    return blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : null;
  } catch {
    return null;
  }
}

/** Settings → Photo: add, change or remove your own profile photo. */
export function PhotoSettings({ photo, initial }: { /** The address of the current photo, if there is one. */ photo: string | null; /** Shown in the circle when there is no photo. */ initial: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<PhotoState | null>(null);
  const [busy, start] = useTransition();
  // The address of a photo that would not load: the initial stands in for it.
  const [failed, setFailed] = useState<string | null>(null);
  const img = useRef<HTMLImageElement>(null);
  // A photo that failed before the page came alive sent its error too early to be heard: look once.
  useEffect(() => {
    if (photo && img.current?.complete && img.current.naturalWidth === 0) setFailed(photo);
  }, [photo]);

  // A call that throws (no connection, a refused request) is said on the status line, never left to the error screen.
  const run = (work: () => Promise<PhotoState>) =>
    start(async () => {
      try {
        setState(await work());
      } catch {
        setState({ ok: false, message: "That didn't go through. Check your connection and try again." });
      }
    });

  const choose = (file: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setState({ ok: false, message: "Choose a JPEG or PNG photo." });
      return;
    }
    run(async () => {
      const ready = (await square(file)) ?? file;
      // Checked here too: a body over the server's limit would fail without a reason.
      if (ready.size > MAX_BYTES) return { ok: false, message: "Photos are up to 2 MB." };
      const fd = new FormData();
      fd.set("photo", ready, ready.name);
      return uploadProfilePhoto(null, fd);
    });
  };

  return (
    <section className="section">
      <h2 className="section-title">Photo</h2>
      <div className="card flex flex-wrap items-center gap-4">
        <span className="photo-lg" aria-hidden={!photo || failed === photo}>
          {/* eslint-disable-next-line @next/next/no-img-element -- served by a signed-in route, not an optimizable public image */}
          {photo && failed !== photo ? <img ref={img} src={photo} alt="Your profile photo" onError={() => setFailed(photo)} /> : initial}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input ref={input} type="file" accept="image/jpeg,image/png" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => choose(e.target.files?.[0])} />
            <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => input.current?.click()}>
              <Camera aria-hidden className="btn-icon" />
              {busy ? "Saving…" : photo ? "Change photo" : "Add photo"}
            </button>
            {photo && (
              <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => run(removeProfilePhoto)}>
                <Trash2 aria-hidden className="btn-icon" />
                Remove
              </button>
            )}
          </div>
          <p className="text-hint">You see it, and so do the people you share a chat with. Organizations never see it while you apply.</p>
          <p role="status" className={state && !state.ok ? "text-danger-msg" : "text-sm text-muted"}>{state?.message ?? ""}</p>
        </div>
      </div>
    </section>
  );
}
