// @ts-nocheck
/**
 * 🏦 Broker logo registry — single source of truth for broker artwork.
 * Add a new broker: drop its asset pointer in src/assets and add one line here.
 */
import dhan from '@/assets/broker-dhan.webp';
import zerodha from '@/assets/broker-zerodha.webp';
import groww from '@/assets/broker-groww.webp';
import upstox from '@/assets/broker-upstox.webp';
import angelone from '@/assets/broker-angelone.webp';
import fyers from '@/assets/broker-fyers.webp';
import aliceblue from '@/assets/broker-aliceblue.webp';
import fivepaisa from '@/assets/broker-fivepaisa.webp';
import { isDemoMode } from './demo/demoMode';

export const BROKER_LOGOS: Record<string, string> = {
  dhan: dhan,
  zerodha: zerodha,
  kite: zerodha,
  groww: groww,
  upstox: upstox,
  angelone: angelone,
  fyers: fyers,
  aliceblue: aliceblue,
  '5paisa': fivepaisa,
  fivepaisa: fivepaisa,
};

export function getBrokerLogo(id?: string): string | null {
  if (!id) return null;
  return BROKER_LOGOS[String(id).toLowerCase()] || null;
}

interface BrokerLogoProps {
  id?: string;
  name?: string;
  color?: string;
  size?: number;
  className?: string;
}

/** Square broker logo with a colored fallback dot when artwork is missing. */
export function BrokerLogo({ id, name, color = '#64748b', size = 40, className = '' }: BrokerLogoProps) {
  const normalizedId = String(id || '').toLowerCase();
  const demoId = normalizedId === 'kite' ? 'zerodha' : normalizedId === '5paisa' ? 'fivepaisa' : normalizedId;
  const src = isDemoMode() && demoId ? `/demo-assets/broker-${demoId}.png` : getBrokerLogo(id);
  if (!src) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-xl font-bold text-white ${className}`}
        style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.42 }}
        aria-hidden="true"
      >
        {(name || id || '?').slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={`${name || id} logo`}
      loading="lazy"
      width={size}
      height={size}
      className={`rounded-xl object-contain bg-white/5 ring-1 ring-white/10 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export default BrokerLogo;
