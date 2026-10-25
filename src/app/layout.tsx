import { CSPProvider } from "@base-ui/react/csp-provider";
import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "PlanCraft", template: "%s · PlanCraft" },
  description:
    "Plan a celebration within your budget: a personalized plan, a task timeline, vendor quote comparison, and revisions when things change.",
};

export const viewport: Viewport = {
  themeColor: "#5b5fc7",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>): Promise<React.ReactElement> {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" className={jakarta.variable}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:text-foreground focus:shadow-card"
        >
          Skip to main content
        </a>
        <CSPProvider nonce={nonce}>{children}</CSPProvider>
      </body>
    </html>
  );
}
