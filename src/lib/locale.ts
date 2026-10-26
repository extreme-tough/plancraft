"use client";

import { useSyncExternalStore } from "react";

/** The browser's locale for number, currency and date formatting (EM-37). The UI text stays English. */
export function useLocale(): string {
  return useSyncExternalStore(
    () => () => {},
    () => navigator.language || "en",
    () => "en",
  );
}
