// @ts-nocheck
/**
 * 🏦 Broker logo registry — single source of truth for broker artwork.
 * Add a new broker: drop its asset pointer in src/assets and add one line here.
 */
import dhan from '@/assets/broker-dhan.png.asset.json';
import zerodha from '@/assets/broker-zerodha.png.asset.json';
import groww from '@/assets/broker-groww.png.asset.json';
import upstox from '@/assets/broker-upstox.png.asset.json';
import angelone from '@/assets/broker-angelone.png.asset.json';
import fyers from '@/assets/broker-fyers.png.asset.json';
import aliceblue from '@/assets/broker-aliceblue.png.asset.json';
import fivepaisa from '@/assets/broker-fivepaisa.png.asset.json';

export const BROKER_LOGOS: Record<string, string> = {
  dhan: dhan.url,
  zerodha: zerodha.url,
  kite: zerodha.url,
  groww: groww.url,
  upstox: upstox.url,
  angelone: angelone.url,
  fyers: fyers.url,
  aliceblue: aliceblue.url,
  '5paisa': fivepaisa.url,
  fivepaisa: fivepaisa.url,
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
  const src = getBrokerLogo(id);
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
