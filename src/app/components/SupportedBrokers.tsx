// @ts-nocheck
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Building2 } from 'lucide-react';
import { getBaseUrl } from '../utils/apiService';
import { BrokerLogo } from '../brokerLogos';
import { publicAnonKey } from '@/utils-ext/supabase/info';


/**
 * 🏦 Supported brokers — driven by the common broker registry.
 * New brokers added on the backend show up here automatically.
 */
export function SupportedBrokers() {
  const [brokers, setBrokers] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${getBaseUrl()}/brokers`, {
          headers: { Authorization: `Bearer ${publicAnonKey}` },
        });
        const data = await res.json();
        if (!cancelled && Array.isArray(data?.brokers)) setBrokers(data.brokers);
      } catch {
        if (!cancelled) setBrokers([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!brokers.length) return null;

  return (
    <section className="relative py-16 px-4 sm:px-6 lg:px-8 bg-slate-950" aria-labelledby="supported-brokers-heading">
      <div className="max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-5">
          <Building2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
          <span className="text-sm text-emerald-400 font-semibold">Supported Brokers</span>
        </div>
        <h2 id="supported-brokers-heading" className="text-3xl md:text-4xl font-bold text-white mb-4">
          Trade with the broker you already use
        </h2>
        <p className="text-slate-400 max-w-2xl mx-auto mb-10">
          Connect one broker account — signals, orders, funds and positions all route through it
          from your own static IP.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brokers.map((b: any, i: number) => (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 p-6 text-left hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center gap-3 mb-3">
                <BrokerLogo id={b.id} name={b.name} color={b.color} size={44} />
                <span className="text-lg font-semibold text-white">{b.name}</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400 ml-auto" aria-hidden="true" />
              </div>
              <p className="text-sm text-slate-400 capitalize">
                {(b.features || []).join(' · ').replace(/-/g, ' ')}
              </p>

            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default SupportedBrokers;
