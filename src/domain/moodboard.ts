/**
 * EM-67: the moodboard's limits, checked before an upload and again by storage.rules. Images live
 * in Cloud Storage under the owner's path; the alt text travels with each file as metadata.
 */
export const MOODBOARD_MAX_IMAGES = 6;
/** "Under 1 MB": strictly less than 1 MiB, the same bound storage.rules enforces. */
export const MOODBOARD_MAX_BYTES = 1024 * 1024;
export const MOODBOARD_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ALT_MAX = 200;

export interface UploadCandidate {
  type: string;
  size: number;
  alt: string;
}

/** Why an upload can't go ahead, or null when it can. */
export function moodboardUploadError(file: UploadCandidate, imagesSoFar: number): string | null {
  if (imagesSoFar >= MOODBOARD_MAX_IMAGES) return `The moodboard holds up to ${MOODBOARD_MAX_IMAGES} images. Remove one to add another.`;
  if (!(MOODBOARD_TYPES as readonly string[]).includes(file.type)) return "Choose a JPEG, PNG or WebP image.";
  if (file.size <= 0) return "That file is empty.";
  if (file.size >= MOODBOARD_MAX_BYTES) return "Choose an image under 1 MB.";
  const alt = file.alt.trim();
  if (alt === "") return "Describe the image for people who can't see it.";
  if (alt.length > ALT_MAX) return `Keep the description to ${ALT_MAX} characters.`;
  return null;
}
