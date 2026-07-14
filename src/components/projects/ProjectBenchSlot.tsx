// A reserved bench: dashed outline where the next instrument lands. Purely
// decorative — hidden from assistive tech — it keeps a small catalogue
// reading as a lab with more benches rather than an empty room.
export function ProjectBenchSlot() {
  return (
    <div aria-hidden="true" className="neon-bench">
      <span>bench · reserved</span>
    </div>
  );
}
