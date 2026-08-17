import type { Metadata } from "next";

import { BuildWorkflow } from "../../components/build-workflow";
import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";

export const metadata: Metadata = {
  description: "Build a replayable SEC and GLEIF evidence receipt for BOT Chain.",
  title: "Build evidence"
};

export default function BuildPage() {
  return (
    <main className="build-page">
      <SiteHeader />
      <BuildWorkflow />
      <SiteFooter />
    </main>
  );
}
