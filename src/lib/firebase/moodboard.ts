"use client";

import { connectStorageEmulator, deleteObject, getDownloadURL, getMetadata, getStorage, listAll, ref, uploadBytes, type FirebaseStorage } from "firebase/storage";
import { clientFirebase } from "./client";
import { EMULATOR_HOSTS, firebasePublicConfig } from "./config";

/**
 * EM-67: moodboard images in Cloud Storage at users/{uid}/events/{eventId}/moodboard/{imageId},
 * with the alt text as custom metadata. storage.rules checks owner, size, type and alt text again.
 * Loaded with a dynamic import, so the Storage SDK only reaches pages that show a moodboard (ENG-11).
 */
export interface MoodboardImage {
  id: string;
  url: string;
  alt: string;
  created: string;
}

let storage: FirebaseStorage | undefined;

function bucket(): FirebaseStorage {
  if (storage) return storage;
  const config = firebasePublicConfig();
  storage = getStorage(clientFirebase().app, `gs://${config.storageBucket}`);
  if (config.useEmulators) connectStorageEmulator(storage, EMULATOR_HOSTS.storage.host, EMULATOR_HOSTS.storage.port);
  return storage;
}

const folder = (uid: string, eventId: string) => ref(bucket(), `users/${uid}/events/${eventId}/moodboard`);

/** The event's images, oldest first. */
export async function listImages(uid: string, eventId: string): Promise<MoodboardImage[]> {
  const { items } = await listAll(folder(uid, eventId));
  const images = await Promise.all(
    items.map(async (item) => {
      const [metadata, url] = await Promise.all([getMetadata(item), getDownloadURL(item)]);
      return { id: item.name, url, alt: metadata.customMetadata?.alt ?? "", created: metadata.timeCreated };
    }),
  );
  return images.sort((a, b) => a.created.localeCompare(b.created));
}

export async function uploadImage(uid: string, eventId: string, file: File, alt: string): Promise<void> {
  const item = ref(folder(uid, eventId), crypto.randomUUID());
  await uploadBytes(item, file, { contentType: file.type, customMetadata: { alt: alt.trim() } });
}

export async function deleteImage(uid: string, eventId: string, imageId: string): Promise<void> {
  await deleteObject(ref(folder(uid, eventId), imageId));
}
