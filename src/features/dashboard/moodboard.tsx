"use client";

import { ImagePlus, Images, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetDescription, SheetHeader, SheetPanel, SheetPopup, SheetTitle } from "@/components/ui/sheet";
import { ALT_MAX, MOODBOARD_MAX_IMAGES, MOODBOARD_TYPES, moodboardUploadError } from "@/domain/moodboard";
import { useSignedIn } from "@/features/auth/auth-provider";
import { FormField } from "@/features/event-create/form-field";
import type { MoodboardImage } from "@/lib/firebase/moodboard";

type MoodboardApi = typeof import("@/lib/firebase/moodboard");
let api: Promise<MoodboardApi> | undefined;
const loadApi = (): Promise<MoodboardApi> => (api ??= import("@/lib/firebase/moodboard"));

/**
 * EM-67 (Figma moodboard): up to 6 of the user's own images, each with alt text, stored in Cloud
 * Storage under their own path. The shared demo account can look but not upload (storage.rules).
 */
export function Moodboard({ eventId }: { eventId: string }): React.ReactElement {
  const { user, isDemo } = useSignedIn();
  const [images, setImages] = useState<MoodboardImage[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<MoodboardImage | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setImages(await (await loadApi()).listImages(user.uid, eventId));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [user.uid, eventId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const count = images?.length ?? 0;
  const full = count >= MOODBOARD_MAX_IMAGES;

  const upload = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!file) return setError("Choose an image to add.");
    const problem = moodboardUploadError({ type: file.type, size: file.size, alt }, count);
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    setStatus("Uploading…");
    try {
      await (await loadApi()).uploadImage(user.uid, eventId, file, alt);
      setFile(null);
      setAlt("");
      if (fileInput.current) fileInput.current.value = "";
      await refresh();
      setStatus("Image added to the moodboard.");
    } catch {
      setStatus("");
      setError("The image couldn't be uploaded. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (image: MoodboardImage): Promise<void> => {
    setPreview(null);
    try {
      await (await loadApi()).deleteImage(user.uid, eventId, image.id);
      await refresh();
      setStatus(`Removed: ${image.alt}`);
    } catch {
      setStatus("The image couldn't be removed. Check your connection and try again.");
    }
  };

  return (
    <section aria-labelledby="moodboard-heading" className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-card sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="moodboard-heading" className="flex items-center gap-2 font-bold text-xl">
          <Images aria-hidden="true" className="size-5 text-accent-foreground" />
          Moodboard
        </h2>
        <p className="text-muted-foreground text-sm">
          {count} of {MOODBOARD_MAX_IMAGES} images
        </p>
      </div>

      {loadFailed ? (
        <p className="text-sm">The moodboard couldn&apos;t be loaded. Please reload the page.</p>
      ) : images === null ? (
        <p className="text-muted-foreground text-sm">Loading the moodboard…</p>
      ) : images.length === 0 ? (
        <p className="text-muted-foreground text-sm">No images yet. Add photos of styles, colours or venues you like.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((image) => (
            <li key={image.id}>
              <button
                type="button"
                className="block aspect-square w-full overflow-hidden rounded-xl border focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                onClick={() => setPreview(image)}
                aria-label={`View larger: ${image.alt}`}
              >
                {/* User uploads from Cloud Storage: plain img, no Next image optimiser for signed URLs. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt={image.alt} className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {isDemo ? (
        <p className="text-muted-foreground text-sm">Sign in with Google to add your own images. The shared demo account can&apos;t upload.</p>
      ) : full ? (
        <p className="text-muted-foreground text-sm">The moodboard is full. Remove an image to add another.</p>
      ) : (
        images !== null && (
          <form onSubmit={(e) => void upload(e)} className="flex flex-col gap-3 rounded-xl border border-dashed p-3" noValidate>
            <FormField id="moodboard-file" label="Image" hint="JPEG, PNG or WebP, under 1 MB." error={error}>
              {(aria) => (
                <Input
                  {...aria}
                  ref={fileInput}
                  type="file"
                  accept={MOODBOARD_TYPES.join(",")}
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setError(null);
                  }}
                />
              )}
            </FormField>
            <FormField id="moodboard-alt" label="Describe the image" hint="Read out to people who can't see it.">
              {(aria) => <Input {...aria} value={alt} maxLength={ALT_MAX} onChange={(e) => setAlt(e.target.value)} />}
            </FormField>
            <Button type="submit" variant="outline" className="self-start" loading={busy}>
              <ImagePlus aria-hidden="true" />
              Add to moodboard
            </Button>
          </form>
        )
      )}
      <p aria-live="polite" className="sr-only">
        {status}
      </p>

      <Sheet open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <SheetPopup>
          {preview && (
            <>
              <SheetHeader>
                <SheetTitle className="pe-8">Moodboard image</SheetTitle>
                <SheetDescription className="wrap-anywhere">{preview.alt}</SheetDescription>
              </SheetHeader>
              <SheetPanel className="flex flex-col gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview.url} alt={preview.alt} className="w-full rounded-xl border" />
                {!isDemo && (
                  <Button variant="outline" className="self-start text-destructive-foreground" onClick={() => void remove(preview)}>
                    <Trash2 aria-hidden="true" />
                    Remove from the moodboard
                  </Button>
                )}
              </SheetPanel>
            </>
          )}
        </SheetPopup>
      </Sheet>
    </section>
  );
}
