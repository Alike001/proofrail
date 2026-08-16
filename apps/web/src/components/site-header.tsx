import Link from "next/link";

import { GITHUB_URL } from "../lib/site";
import { BrandMark } from "./brand-mark";

export function SiteHeader(): React.JSX.Element {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <BrandMark />
        <nav className="site-nav" aria-label="Primary navigation">
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/#mainnet-proof">Live receipt</Link>
          <a href={GITHUB_URL} rel="noreferrer" target="_blank">
            GitHub
          </a>
          <Link
            className="button button--primary site-nav__action"
            href="/build"
            prefetch={false}
          >
            Build evidence
          </Link>
        </nav>
      </div>
    </header>
  );
}
