// @ts-nocheck
import React from 'react';
import { BROKER_BASE64_LOGOS } from './brokerLogosData';

/**
 * 🏦 Broker logo registry — single source of truth for authentic broker logos & cards.
 * High-resolution authentic brand PNG images for all 8 Indian brokers:
 * 1. Dhan (Authentic green emblem with Hindi 'ध')
 * 2. Zerodha Kite (Crisp white square with red geometric Kite)
 * 3. Groww (Clean split circle cyan/blue rising wave)
 * 4. Upstox (Vivid purple icon with white 'up' monogram)
 * 5. Angel One (Official green bar with orange triangle matrix)
 * 6. FYERS (Vivid blue with white stylized double-F wings)
 * 7. AliceBlue (White background with blue/green concentric tilted orbital rings)
 * 8. 5paisa (Official red background with metallic 3D '5' badge)
 */

export interface BrokerMeta {
  id: string;
  name: string;
  short: string;
  status: 'live' | 'planned';
  color: string;
  logo: string;
  website: string;
  features: string[];
  description: string;
  defaultEnabled: boolean;
  enabled: boolean;
  apiType: 'REST' | 'WebSocket' | 'OAuth' | 'SmartAPI';
  hasOAuth: boolean;
  featureTagline: string;
}

export const BROKER_PNG_LOGOS: Record<string, string> = {
  dhan: BROKER_BASE64_LOGOS.dhan || '/icons/brokers/dhan.png',
  zerodha: BROKER_BASE64_LOGOS.zerodha || '/icons/brokers/zerodha.png',
  kite: BROKER_BASE64_LOGOS.zerodha || '/icons/brokers/zerodha.png',
  groww: BROKER_BASE64_LOGOS.groww || '/icons/brokers/groww.png',
  upstox: BROKER_BASE64_LOGOS.upstox || '/icons/brokers/upstox.png',
  angelone: BROKER_BASE64_LOGOS.angelone || '/icons/brokers/angelone.png',
  'angel-one': BROKER_BASE64_LOGOS.angelone || '/icons/brokers/angelone.png',
  angel: BROKER_BASE64_LOGOS.angelone || '/icons/brokers/angelone.png',
  smartapi: BROKER_BASE64_LOGOS.angelone || '/icons/brokers/angelone.png',
  fyers: BROKER_BASE64_LOGOS.fyers || '/icons/brokers/fyers.png',
  aliceblue: BROKER_BASE64_LOGOS.aliceblue || '/icons/brokers/aliceblue.png',
  'alice-blue': BROKER_BASE64_LOGOS.aliceblue || '/icons/brokers/aliceblue.png',
  alice: BROKER_BASE64_LOGOS.aliceblue || '/icons/brokers/aliceblue.png',
  '5paisa': BROKER_BASE64_LOGOS['5paisa'] || '/icons/brokers/5paisa.png',
  fivepaisa: BROKER_BASE64_LOGOS['5paisa'] || '/icons/brokers/5paisa.png',
  'five-paisa': BROKER_BASE64_LOGOS['5paisa'] || '/icons/brokers/5paisa.png',
};

export const BROKER_LOGOS: Record<string, string> = BROKER_PNG_LOGOS;

export const ALL_8_BROKERS: BrokerMeta[] = [
  {
    id: 'dhan',
    name: 'Dhan',
    short: 'Dhan',
    status: 'live',
    color: '#00BA63',
    logo: BROKER_PNG_LOGOS.dhan,
    website: 'https://dhan.co',
    features: ['Orders', 'Positions', 'Funds', 'Instruments', 'Static Ip'],
    featureTagline: 'Orders · Positions · Funds · Instruments · Static Ip',
    hasOAuth: false,
    description: 'Lightning-fast API execution with native option chain feeds and direct webhooks.',
    defaultEnabled: true,
    enabled: true,
    apiType: 'REST',
  },
  {
    id: 'zerodha',
    name: 'Zerodha Kite',
    short: 'Zerodha',
    status: 'live',
    color: '#E53935',
    logo: BROKER_PNG_LOGOS.zerodha,
    website: 'https://kite.trade',
    features: ['Orders', 'Positions', 'Funds', 'Instruments', 'Static Ip', 'Oauth'],
    featureTagline: 'Orders · Positions · Funds · Instruments · Static Ip · Oauth',
    hasOAuth: true,
    description: "India's largest retail discount broker powered by robust Kite Connect 3.0 APIs.",
    defaultEnabled: true,
    enabled: true,
    apiType: 'OAuth',
  },
  {
    id: 'groww',
    name: 'Groww',
    short: 'Groww',
    status: 'live',
    color: '#00D09C',
    logo: BROKER_PNG_LOGOS.groww,
    website: 'https://groww.in/trade-api',
    features: ['Orders', 'Positions', 'Funds', 'Instruments', 'Static Ip'],
    featureTagline: 'Orders · Positions · Funds · Instruments · Static Ip',
    hasOAuth: false,
    description: 'Seamless low-latency execution and position syncing on modern Groww trading APIs.',
    defaultEnabled: true,
    enabled: true,
    apiType: 'REST',
  },
  {
    id: 'upstox',
    name: 'Upstox',
    short: 'Upstox',
    status: 'live',
    color: '#6928A0',
    logo: BROKER_PNG_LOGOS.upstox,
    website: 'https://upstox.com',
    features: ['Orders', 'Positions', 'Funds', 'Instruments', 'Static Ip', 'Oauth'],
    featureTagline: 'Orders · Positions · Funds · Instruments · Static Ip · Oauth',
    hasOAuth: true,
    description: 'High-speed algorithmic trading through Upstox API v2 with automatic token refresh.',
    defaultEnabled: true,
    enabled: true,
    apiType: 'OAuth',
  },
  {
    id: 'angelone',
    name: 'Angel One',
    short: 'Angel One',
    status: 'live',
    color: '#00A859',
    logo: BROKER_PNG_LOGOS.angelone,
    website: 'https://smartapi.angelone.in',
    features: ['Orders', 'Positions', 'Funds', 'Instruments', 'Static Ip'],
    featureTagline: 'Orders · Positions · Funds · Instruments · Static Ip',
    hasOAuth: false,
    description: 'Institutional-grade SmartAPI endpoints with automated TOTP login and fast routing.',
    defaultEnabled: true,
    enabled: true,
    apiType: 'SmartAPI',
  },
  {
    id: 'fyers',
    name: 'FYERS',
    short: 'FYERS',
    status: 'live',
    color: '#0066FF',
    logo: BROKER_PNG_LOGOS.fyers,
    website: 'https://fyers.in',
    features: ['Orders', 'Positions', 'Funds', 'Instruments', 'Static Ip', 'Oauth'],
    featureTagline: 'Orders · Positions · Funds · Instruments · Static Ip · Oauth',
    hasOAuth: true,
    description: 'Modern developer-first trading API with multi-leg order placement and WebSocket feeds.',
    defaultEnabled: true,
    enabled: true,
    apiType: 'OAuth',
  },
  {
    id: 'aliceblue',
    name: 'AliceBlue',
    short: 'AliceBlue',
    status: 'live',
    color: '#0B63E5',
    logo: BROKER_PNG_LOGOS.aliceblue,
    website: 'https://aliceblueonline.com',
    features: ['Orders', 'Positions', 'Funds', 'Instruments', 'Static Ip'],
    featureTagline: 'Orders · Positions · Funds · Instruments · Static Ip',
    hasOAuth: false,
    description: 'Zero brokerage on equity delivery with high-concurrency ANT Plus REST API routing.',
    defaultEnabled: true,
    enabled: true,
    apiType: 'REST',
  },
  {
    id: '5paisa',
    name: '5paisa',
    short: '5paisa',
    status: 'live',
    color: '#E82A2A',
    logo: BROKER_PNG_LOGOS['5paisa'],
    website: 'https://xstream.5paisa.com',
    features: ['Orders', 'Positions', 'Funds', 'Instruments', 'Static Ip', 'Oauth'],
    featureTagline: 'Orders · Positions · Funds · Instruments · Static Ip · Oauth',
    hasOAuth: true,
    description: 'High-frequency trading via 5paisa Xstream developer endpoints with direct execution.',
    defaultEnabled: true,
    enabled: true,
    apiType: 'OAuth',
  },
];

export function getBrokerLogo(id?: string): string | null {
  if (!id) return null;
  const raw = String(id).toLowerCase().trim();
  const clean = raw.replace(/[\s\-_]/g, '');

  if (BROKER_PNG_LOGOS[raw]) return BROKER_PNG_LOGOS[raw];
  if (BROKER_PNG_LOGOS[clean]) return BROKER_PNG_LOGOS[clean];

  if (clean.includes('dhan')) return BROKER_PNG_LOGOS.dhan;
  if (clean.includes('zerodha') || clean.includes('kite')) return BROKER_PNG_LOGOS.zerodha;
  if (clean.includes('groww')) return BROKER_PNG_LOGOS.groww;
  if (clean.includes('upstox')) return BROKER_PNG_LOGOS.upstox;
  if (clean.includes('angel')) return BROKER_PNG_LOGOS.angelone;
  if (clean.includes('fyer')) return BROKER_PNG_LOGOS.fyers;
  if (clean.includes('alice')) return BROKER_PNG_LOGOS.aliceblue;
  if (clean.includes('5paisa') || clean.includes('fivepaisa')) return BROKER_PNG_LOGOS['5paisa'];

  return null;
}

export function getBrokerMeta(id?: string): BrokerMeta | null {
  if (!id) return null;
  const cleanId = String(id).toLowerCase().trim();
  return (
    ALL_8_BROKERS.find(
      (b) =>
        b.id.toLowerCase() === cleanId ||
        b.short.toLowerCase() === cleanId ||
        b.name.toLowerCase().replace(/\s+/g, '') === cleanId.replace(/\s+/g, '') ||
        b.name.toLowerCase().includes(cleanId)
    ) || null
  );
}

// --------------------------------------------------------------------------
// 🎨 Legacy / Fallback Vector Brand Icons
// --------------------------------------------------------------------------

export function DhanSvgIcon({ size = 44, className = '' }: { size?: number; className?: string }) {
  return (
    <BrokerLogo id="dhan" name="Dhan" size={size} className={className} />
  );
}

export function ZerodhaSvgIcon({ size = 44, className = '' }: { size?: number; className?: string }) {
  return (
    <BrokerLogo id="zerodha" name="Zerodha" size={size} className={className} />
  );
}

export function GrowwSvgIcon({ size = 44, className = '' }: { size?: number; className?: string }) {
  return (
    <BrokerLogo id="groww" name="Groww" size={size} className={className} />
  );
}

export function UpstoxSvgIcon({ size = 44, className = '' }: { size?: number; className?: string }) {
  return (
    <BrokerLogo id="upstox" name="Upstox" size={size} className={className} />
  );
}

export function AngelOneSvgIcon({ size = 44, className = '' }: { size?: number; className?: string }) {
  return (
    <BrokerLogo id="angelone" name="Angel One" size={size} className={className} />
  );
}

export function FyersSvgIcon({ size = 44, className = '' }: { size?: number; className?: string }) {
  return (
    <BrokerLogo id="fyers" name="FYERS" size={size} className={className} />
  );
}

export function AliceBlueSvgIcon({ size = 44, className = '' }: { size?: number; className?: string }) {
  return (
    <BrokerLogo id="aliceblue" name="AliceBlue" size={size} className={className} />
  );
}

export function FivepaisaSvgIcon({ size = 44, className = '' }: { size?: number; className?: string }) {
  return (
    <BrokerLogo id="5paisa" name="5paisa" size={size} className={className} />
  );
}

// --------------------------------------------------------------------------
// 🌟 BrokerLogo Component (Renders the authentic, high-res PNG image logo)
// --------------------------------------------------------------------------

interface BrokerLogoProps {
  id?: string;
  name?: string;
  color?: string;
  size?: number;
  className?: string;
  containerBg?: string;
}

export function BrokerLogo({
  id,
  name,
  size = 44,
  className = '',
}: BrokerLogoProps) {
  const logoSrc = getBrokerLogo(id) || getBrokerLogo(name);

  if (logoSrc) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-2xl overflow-hidden shadow-sm transition-transform duration-200 hover:scale-105 bg-transparent ${className}`}
        style={{ width: size, height: size }}
      >
        <img
          src={logoSrc}
          alt={name || id || 'Broker Logo'}
          width={size}
          height={size}
          className="w-full h-full object-contain rounded-2xl select-none"
          loading="eager"
          decoding="sync"
        />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-2xl font-bold text-white bg-slate-800 border border-slate-700 ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(12, size * 0.4) }}
    >
      {(name || id || '?').slice(0, 2).toUpperCase()}
    </span>
  );
}

// --------------------------------------------------------------------------
// 💎 BrokerCard Component (Authentic card with high-res PNG logo & check badge)
// --------------------------------------------------------------------------

interface BrokerCardProps {
  broker: BrokerMeta;
  isActive?: boolean;
  onSelect?: (broker: BrokerMeta) => void;
  className?: string;
}

export function BrokerCard({ broker, isActive = true, onSelect, className = '' }: BrokerCardProps) {
  return (
    <div
      onClick={() => onSelect?.(broker)}
      className={`group relative flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-[#091122]/90 hover:bg-[#0c162e] border border-cyan-900/40 hover:border-cyan-500/60 shadow-lg shadow-black/50 transition-all duration-300 ${
        onSelect ? 'cursor-pointer' : ''
      } ${className}`}
    >
      {/* Left: Authentic PNG Logo & Name/Features */}
      <div className="flex items-center gap-3.5 min-w-0 pr-2">
        <BrokerLogo id={broker.id} name={broker.name} size={50} className="shadow-md shrink-0" />
        <div className="min-w-0">
          <h4 className="text-white font-bold text-base sm:text-lg tracking-tight truncate group-hover:text-cyan-300 transition-colors">
            {broker.name}
          </h4>
          <p className="text-[11px] sm:text-xs text-slate-400 font-normal truncate mt-0.5 tracking-normal">
            {broker.featureTagline}
          </p>
        </div>
      </div>

      {/* Right: Authentic Green Check Circle Badge from screenshot */}
      <div className="shrink-0 pl-2">
        <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[#00BA63] flex items-center justify-center text-white shadow-md shadow-emerald-500/30">
          <svg
            className="w-3.5 h-3.5 sm:w-4 sm:h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3.2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </span>
      </div>
    </div>
  );
}

export default BrokerLogo;
