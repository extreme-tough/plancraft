/** Remembers an explicit sign-out for this tab, so the next visit offers a choice instead of re-entering the demo. */
const SIGNED_OUT_KEY = "plancraft.signedOut";

export function markSignedOut(value: boolean): void {
  try {
    if (value) sessionStorage.setItem(SIGNED_OUT_KEY, "1");
    else sessionStorage.removeItem(SIGNED_OUT_KEY);
  } catch {
    // Storage can be blocked; the only cost is landing in the demo again.
  }
}

export function wasSignedOut(): boolean {
  try {
    return sessionStorage.getItem(SIGNED_OUT_KEY) === "1";
  } catch {
    return false;
  }
}
