const STAGES = [
  ["SEC + GLEIF", "Official records are fetched and validated at the source."],
  ["DETERMINISTIC POLICY", "Fixed rules produce a reproducible pass or failure."],
  ["SIGNED PACKET", "Result, evidence hashes, and publisher are bound together."],
  ["BOT MAINNET RECEIPT", "The accepted packet hash becomes public chain history."]
] as const;

export function EvidenceRail(): React.JSX.Element {
  return (
    <section className="evidence-rail" id="how-it-works" aria-labelledby="rail-title">
      <h2 className="sr-only" id="rail-title">
        How ProofRail works
      </h2>
      <div className="evidence-rail__line" aria-hidden="true" />
      <div className="evidence-rail__grid">
        {STAGES.map(([title, description]) => (
          <article className="rail-stage" key={title}>
            <span className="rail-stage__node" aria-hidden="true" />
            <h3>{title}</h3>
            <p>{description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
