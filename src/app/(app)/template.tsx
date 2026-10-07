// Re-keyed on every navigation, so each page arrives with a short rise
// instead of snapping in. CSS-only: no client JS, and reduced-motion users get
// an instant swap via the global prefers-reduced-motion rule.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-rise">{children}</div>;
}
