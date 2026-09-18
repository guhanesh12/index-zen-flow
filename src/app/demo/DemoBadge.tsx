// @ts-nocheck
import { isDemoMode, exitDemoMode } from './demoMode';

/** Small badge shown on screen while the app runs with sample demo data. */
export default function DemoBadge() {
  if (!isDemoMode()) return null;
  return (
    <button
      type="button"
      onClick={() => {
        exitDemoMode();
        window.location.href = window.location.pathname;
      }}
      title="Leave demo and return to your real account"
      style={{
        position: 'fixed',
        bottom: 12,
        left: 12,
        zIndex: 9999,
        padding: '6px 12px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        background: 'hsl(var(--secondary))',
        color: 'hsl(var(--foreground))',
        border: '1px solid hsl(var(--border))',
        pointerEvents: 'none',
        opacity: 0.85,
      }}
    >
      Demo · sample data
    </div>
  );
}
