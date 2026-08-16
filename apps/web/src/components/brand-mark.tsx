import Link from "next/link";

export function BrandMark(): React.JSX.Element {
  return (
    <Link className="brand-mark" href="/" aria-label="ProofRail home">
      <svg
        aria-hidden="true"
        className="brand-mark__glyph"
        viewBox="0 0 56 24"
        fill="none"
      >
        <path d="M1 7H35M1 17H35" stroke="currentColor" strokeWidth="3" />
        <path d="M35 2H54V22H35V2Z" stroke="currentColor" strokeWidth="3" />
      </svg>
      <span>ProofRail</span>
    </Link>
  );
}
