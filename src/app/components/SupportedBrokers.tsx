// @ts-nocheck
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Building2, Shield, Zap, ExternalLink } from 'lucide-react';
import { getBaseUrl } from '../utils/apiService';
import { BrokerLogo, BrokerCard, ALL_8_BROKERS, getBrokerMeta } from '../brokerLogos';
import { publicAnonKey } from '@/utils-ext/supabase/info';

/**
 * 🏦 Supported brokers — driven by the common broker registry.
 * Displays all 8 supported Indian brokers with official logos and integration highlights.
 */
export function SupportedBrokers() {
  const [brokers, setBrokers] = useState<any[]>(ALL_8_BROKERS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${getBaseUrl()}/brokers`, {
          headers: { Authorization: `Bearer ${publicAnonKey}` },
        });
        const data = await res.json();
        if (!cancelled && Array.isArray(data?.brokers) && data.brokers.length > 0) {
          // Merge with ALL_8_BROKERS to ensure all 8 brokers have logos & metadata
          const merged = ALL_8_BROKERS.map((def) => {
            const fromServer = data.brokers.find((b: any) => b.id === def.id);
            return fromServer ? { ...def, ...fromServer } : def;
          });
          setBrokers(merged);
        }
      } catch {
        // Fallback to ALL_8_BROKERS
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="relative py-20 px-4 sm:px-6 lg:px-8 bg-slate-950/90 border-y border-slate-900" aria-labelledby="supported-brokers-heading">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-5">
            <Building2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <span className="text-sm text-emerald-400 font-semibold">8 Supported Indian Brokers</span>
          </div>
          <h2 id="supported-brokers-heading" className="text-3xl md:text-5xl font-bold text-white mb-4">
            Trade with the Broker You Already Use
          </h2>
          <p className="text-slate-400 max-w-3xl mx-auto text-base sm:text-lg">
            Connect your preferred demat account in 60 seconds. High-speed algorithmic execution, real-time positions, funds sync, and risk management through your dedicated static IP VPS.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 max-w-5xl mx-auto">
          {brokers.map((b: any, i: number) => {
            const meta = getBrokerMeta(b.id) || b;
            return (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: i * 0.05 }}
              >
                <BrokerCard
                  broker={meta}
                  onSelect={() => {
                    if (meta.website) window.open(meta.website, '_blank', 'noopener,noreferrer');
                  }}
                />
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default SupportedBrokers;
