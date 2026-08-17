import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  description:
    "Replayable SEC and GLEIF public-company evidence receipts anchored on BOT Chain.",
  title: {
    default: "ProofRail",
    template: "%s · ProofRail"
  }
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
