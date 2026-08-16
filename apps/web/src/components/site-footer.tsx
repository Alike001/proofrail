import Link from "next/link";

import { GITHUB_URL } from "../lib/site";
import { BrandMark } from "./brand-mark";

export function SiteFooter(): React.JSX.Element {
  return (
    <footer className="site-footer">
      <BrandMark />
      <nav aria-label="Footer navigation">
        <Link href="/#how-it-works">How it works</Link>
        <Link href="/#mainnet-proof">Live receipt</Link>
        <a href={GITHUB_URL} rel="noreferrer" target="_blank">
          GitHub
        </a>
      </nav>
      <span>© 2026 ProofRail</span>
    </footer>
  );
}
