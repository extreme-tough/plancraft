/**
 * The one shared demo account every reviewer is signed in to (EM-58). Its tokens are minted by the
 * server; it has no password and is never linked to another sign-in method (EM-60).
 */
export const DEMO_UID = "demo-shared";

export function isDemoUid(uid: string | null | undefined): boolean {
  return uid === DEMO_UID;
}
