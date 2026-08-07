// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Shield, TrendingUp, Users, DollarSign, MessageSquare, Globe, Activity,
  UsersRound, Settings, Gift, Mail, Smartphone, ScrollText, ChevronRight, Bot,
} from 'lucide-react';
import { TAB_TREE } from '@/app/adminTabs';
import { selectAdminSubTab } from '@/hooks/useAdminSubTabSync';

const ICONS: Record<string, any> = {
  dashboard: TrendingUp,
  users: Users,
  transactions: DollarSign,
  support: MessageSquare,
  landing: Globe,
  adminUsers: Activity,
  adminManagement: UsersRound,
  settings: Settings,
  referrals: Gift,
  communication: Mail,
  mobile: Smartphone,
  audit: ScrollText,
};

interface Props {
  activeTab: string;
  onTabChange: (key: string) => void;
  allowMain: (key: string) => boolean;
  allowSub: (parent: string, sub: string) => boolean;
  pendingSupportCount?: number;
  onNavigate?: () => void;
}

export function AdminSideNav({
  activeTab, onTabChange, allowMain, allowSub, pendingSupportCount = 0, onNavigate,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(activeTab);
  const [activeSub, setActiveSub] = useState<Record<string, string>>({});
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const tree = useMemo(
    () => TAB_TREE.filter((t) => allowMain(t.key)).map((t) => ({
      ...t,
      subs: t.subs.filter((s) => allowSub(t.key, s.key)),
    })),
    [allowMain, allowSub],
  );

  // Keep the active item visible as the list grows/collapses.
  useEffect(() => {
    setExpanded(activeTab);
    const id = window.setTimeout(() => {
      activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 120);
    return () => window.clearTimeout(id);
  }, [activeTab]);

  const handleMain = (tab: any) => {
    onTabChange(tab.key);
    setExpanded((prev) => (prev === tab.key && tab.subs.length ? null : tab.key));
    if (!tab.subs.length) onNavigate?.();
  };

  const handleSub = (parent: string, sub: string) => {
    if (activeTab !== parent) onTabChange(parent);
    setActiveSub((p) => ({ ...p, [parent]: sub }));
    // let the panel mount before asking it to switch
    window.setTimeout(() => selectAdminSubTab(parent, sub), 30);
    onNavigate?.();
  };

  return (
    <div
      ref={listRef}
      className="h-full overflow-y-auto overscroll-contain px-2 py-3 space-y-1
                 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5
                 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-700"
    >
      {tree.length === 0 && (
        <p className="px-3 py-2 text-sm text-slate-400">No tabs assigned</p>
      )}

      {tree.map((tab) => {
        const Icon = ICONS[tab.key] || Shield;
        const isActive = activeTab === tab.key;
        const isOpen = expanded === tab.key && tab.subs.length > 0;
        return (
          <div key={tab.key}>
            <button
              ref={isActive ? activeRef : undefined}
              onClick={() => handleMain(tab)}
              className={`group relative w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium
                transition-all duration-200
                ${isActive
                  ? 'bg-blue-600/20 text-blue-100 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.4)]'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'}`}
            >
              {isActive && (
                <motion.span
                  layoutId="admin-nav-active"
                  className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-blue-400"
                />
              )}
              <Icon className={`size-4 shrink-0 transition-transform duration-200 ${isActive ? 'text-blue-300' : 'group-hover:scale-110'}`} />
              <span className="flex-1 text-left truncate">{tab.label}</span>
              {tab.key === 'support' && pendingSupportCount > 0 && (
                <span className="size-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center animate-pulse">
                  {pendingSupportCount}
                </span>
              )}
              {tab.subs.length > 0 && (
                <ChevronRight
                  className={`size-4 shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-90 text-blue-300' : ''}`}
                />
              )}
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <div className="ml-5 mt-1 mb-1 border-l border-slate-700/70 pl-2 space-y-0.5">
                    {tab.subs.map((sub) => {
                      const subActive = isActive && (activeSub[tab.key] || tab.subs[0]?.key) === sub.key;
                      return (
                        <button
                          key={sub.key}
                          onClick={() => handleSub(tab.key, sub.key)}
                          className={`w-full text-left rounded-lg px-3 py-2 text-[13px] transition-all duration-200
                            ${subActive
                              ? 'bg-blue-500/15 text-blue-200'
                              : 'text-slate-400 hover:text-white hover:bg-slate-800/60 hover:translate-x-0.5'}`}
                        >
                          {sub.label}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

export default AdminSideNav;
