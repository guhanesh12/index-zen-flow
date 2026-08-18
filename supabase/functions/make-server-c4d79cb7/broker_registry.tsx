/**
 * 🏦 COMMON BROKER REGISTRY
 *
 * Single source of truth for "which brokers exist" and "which brokers are ON".
 * Every surface (landing page, user broker chooser, dashboard banner, admin
 * panel) reads from here, so adding a new broker later = adding one entry to
 * BROKER_CATALOG. Nothing else needs to change.
 *
 * Admin can switch a broker ON/OFF; a broker that is OFF is hidden from users
 * everywhere (chooser + landing page) but existing sessions are untouched.
 */

import * as kv from "./kv_store.tsx";

export type BrokerStatus = "live" | "planned";

export interface BrokerDef {
  id: string;              // 'dhan' | 'zerodha' | ...
  name: string;            // display name
  short: string;           // chip label
  status: BrokerStatus;    // 'live' = integration implemented
  color: string;           // brand hex (UI accents)
  website: string;
  features: string[];      // what the integration supports
  defaultEnabled: boolean;
}

/** 👇 ADD A NEW BROKER HERE — everything else picks it up automatically. */
export const BROKER_CATALOG: BrokerDef[] = [
  {
    id: "dhan",
    name: "Dhan",
    short: "Dhan",
    status: "live",
    color: "#22c55e",
    website: "https://dhan.co",
    features: ["orders", "positions", "funds", "instruments", "static-ip"],
    defaultEnabled: true,
  },
  {
    id: "zerodha",
    name: "Zerodha Kite",
    short: "Zerodha",
    status: "live",
    color: "#f97316",
    website: "https://kite.trade",
    features: ["orders", "positions", "funds", "instruments", "static-ip", "oauth"],
    defaultEnabled: true,
  },
  {
    id: "groww",
    name: "Groww",
    short: "Groww",
    status: "live",
    color: "#00b386",
    website: "https://groww.in/trade-api",
    features: ["orders", "positions", "funds", "instruments", "static-ip"],
    defaultEnabled: true,
  },
  {

    id: "upstox",
    name: "Upstox",
    short: "Upstox",
    status: "planned",
    color: "#7c3aed",
    website: "https://upstox.com",
    features: [],
    defaultEnabled: false,
  },
  {
    id: "angelone",
    name: "Angel One",
    short: "Angel One",
    status: "planned",
    color: "#ef4444",
    website: "https://angelone.in",
    features: [],
    defaultEnabled: false,
  },
  {
    id: "fyers",
    name: "Fyers",
    short: "Fyers",
    status: "planned",
    color: "#0ea5e9",
    website: "https://fyers.in",
    features: [],
    defaultEnabled: false,
  },
];

const SETTINGS_KEY = "broker_registry_settings";

export function getBrokerDef(id: string): BrokerDef | null {
  return BROKER_CATALOG.find((b) => b.id === String(id || "").toLowerCase()) || null;
}

export function brokerLabel(id: string): string {
  return getBrokerDef(id)?.name || (id ? String(id).toUpperCase() : "—");
}

/** Admin-controlled ON/OFF map merged over catalog defaults. */
export async function getBrokerSettings(): Promise<Record<string, { enabled: boolean }>> {
  const stored = ((await kv.get(SETTINGS_KEY)) as Record<string, any>) || {};
  const out: Record<string, { enabled: boolean }> = {};
  for (const b of BROKER_CATALOG) {
    const enabled = typeof stored?.[b.id]?.enabled === "boolean"
      ? stored[b.id].enabled
      : b.defaultEnabled;
    // A broker without an implementation can never be enabled.
    out[b.id] = { enabled: b.status === "live" ? enabled : false };
  }
  return out;
}

export async function setBrokerEnabled(id: string, enabled: boolean) {
  const def = getBrokerDef(id);
  if (!def) throw new Error(`Unknown broker: ${id}`);
  if (def.status !== "live" && enabled) throw new Error(`${def.name} integration is not available yet`);
  const stored = ((await kv.get(SETTINGS_KEY)) as Record<string, any>) || {};
  stored[def.id] = { enabled: !!enabled, updatedAt: new Date().toISOString() };
  await kv.set(SETTINGS_KEY, stored);
  return await getBrokerSettings();
}

/** Full list with enabled flags (admin view). */
export async function listBrokers() {
  const settings = await getBrokerSettings();
  return BROKER_CATALOG.map((b) => ({ ...b, enabled: settings[b.id]?.enabled === true }));
}

/** Only brokers users may pick right now (public view). */
export async function listEnabledBrokers() {
  return (await listBrokers()).filter((b) => b.enabled);
}

/** Guard used before a user selects a broker. */
export async function assertBrokerEnabled(id: string) {
  const settings = await getBrokerSettings();
  if (!settings[String(id).toLowerCase()]?.enabled) {
    throw new Error(`${brokerLabel(id)} is currently disabled by the administrator`);
  }
}
