// Six pale tints 60 degrees apart (violet skipped), so neighbouring agents rarely share one.
const HUES = [172, 32, 205, 132, 52, 340];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

const hueOf = (name: string) => HUES[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length];

/** An agent's stable monogram: its initials on a pale tint chosen from its name. */
export function AgentMark({ name, size = 28 }: { name: string; size?: number }) {
  const hue = hueOf(name);
  return (
    <span className="agent-mark" aria-hidden style={{ width: size, height: size, background: `hsl(${hue} 42% 91%)`, color: `hsl(${hue} 48% 26%)` }}>
      {initials(name)}
    </span>
  );
}

/** Prosper's mark: a voice wave in a round badge. */
export function ProductMark() {
  return (
    <span className="product-mark">
      <svg className="product-mark__glyph" width="24" height="24" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="12" fill="var(--accent)" />
        <path d="M7 10.5v3M10 8v8M13 6.5v11M16 9v6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span className="product-mark__name">Prosper</span>
    </span>
  );
}
