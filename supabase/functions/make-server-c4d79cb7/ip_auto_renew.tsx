/**
 * 🔁 DEDICATED IP — SUBSCRIPTION REMINDERS + WALLET AUTO-RENEWAL
 *
 * Runs once a day (pg_cron → /cron/ip-subscription-daily):
 *   • 3, 2, 1 days before expiry  → push reminder every day
 *   • on/after expiry             → auto-renew from wallet when the user has
 *                                   switched auto-renewal ON (explicit consent)
 *   • wallet short of the fee     → "add funds" push instead of a silent failure
 *
 * Auto-renewal is opt-in. Nothing is ever debited without a stored consent
 * record (userId + timestamp) created from the toggle on the dedicated IP page.
 */

import * as kv from "./kv_store.tsx";
import * as IPPoolManager from "./ip_pool_manager.tsx";
import * as pushNotifications from "./push_notifications.tsx";

export const IP_RENEWAL_FEE = 599;         // ₹599 / 30 days
export const REMINDER_DAYS = 3;            // start reminding 3 days before expiry
const CONSENT_PREFIX = "ip_auto_renew:";
const NOTICE_PREFIX = "ip_renew_notice:";
const ASSIGNMENT_PREFIX = "user_ip_assignment:";

export interface AutoRenewConsent {
  enabled: boolean;
  consentAt?: string;
  revokedAt?: string;
  lastRenewalAt?: string;
  lastRenewalAmount?: number;
  lastFailureAt?: string;
  lastFailureReason?: string;
}

export async function getAutoRenew(userId: string): Promise<AutoRenewConsent> {
  const saved = (await kv.get(`${CONSENT_PREFIX}${userId}`)) as AutoRenewConsent | null;
  return saved && typeof saved === "object" ? { enabled: false, ...saved } : { enabled: false };
}

export async function setAutoRenew(userId: string, enabled: boolean): Promise<AutoRenewConsent> {
  const current = await getAutoRenew(userId);
  const next: AutoRenewConsent = {
    ...current,
    enabled,
    ...(enabled ? { consentAt: new Date().toISOString(), revokedAt: undefined } : { revokedAt: new Date().toISOString() }),
  };
  await kv.set(`${CONSENT_PREFIX}${userId}`, next);
  return next;
}

export function daysUntil(expiresAt?: string): number {
  if (!expiresAt) return 0;
  const ms = new Date(expiresAt).getTime();
  if (!Number.isFinite(ms)) return 0;
  return Math.ceil((ms - Date.now()) / (24 * 60 * 60 * 1000));
}

async function getWallet(userId: string): Promise<any> {
  return (await kv.get(`wallet:${userId}`)) || { balance: 0, totalProfit: 0, totalDeducted: 0 };
}

/** Debit the renewal fee and record it in the user's wallet ledger. */
async function debitWallet(userId: string, amount: number, description: string) {
  const wallet = await getWallet(userId);
  const balance = Number(wallet.balance || 0);
  if (balance < amount) return { ok: false as const, balance };

  const newBalance = balance - amount;
  await kv.set(`wallet:${userId}`, {
    ...wallet,
    balance: newBalance,
    totalDeducted: Number(wallet.totalDeducted || 0) + amount,
  });

  const existing = await kv.get(`wallet_transactions:${userId}`);
  const list = Array.isArray(existing) ? existing : [];
  await kv.set(`wallet_transactions:${userId}`, [
    {
      id: `txn_ipauto_${Date.now()}`,
      userId,
      type: "debit",
      amount,
      balance: newBalance,
      description,
      timestamp: Date.now(),
      category: "dedicated_ip_auto_renewal",
    },
    ...list,
  ]);

  return { ok: true as const, balance: newBalance };
}

/** Put the money back when the renewal step fails after a successful debit. */
async function refundWallet(userId: string, amount: number, description: string) {
  const wallet = await getWallet(userId);
  const balance = Number(wallet.balance || 0);
  const newBalance = balance + amount;

  await kv.set(`wallet:${userId}`, {
    ...wallet,
    balance: newBalance,
    totalDeducted: Math.max(0, Number(wallet.totalDeducted || 0) - amount),
  });

  const existing = await kv.get(`wallet_transactions:${userId}`);
  const list = Array.isArray(existing) ? existing : [];
  await kv.set(`wallet_transactions:${userId}`, [
    {
      id: `txn_ipauto_refund_${Date.now()}`,
      userId,
      type: "credit",
      amount,
      balance: newBalance,
      description,
      timestamp: Date.now(),
      category: "dedicated_ip_auto_renewal_refund",
    },
    ...list,
  ]);

  return newBalance;
}

/** One push per user per day per kind — a restarted cron can never spam. */
async function pushOncePerDay(
  userId: string,
  kind: string,
  payload: { title: string; body: string; targetUrl?: string; data?: Record<string, string> },
) {
  const day = new Date().toISOString().slice(0, 10);
  const key = `${NOTICE_PREFIX}${userId}:${day}:${kind}`;
  if (await kv.get(key)) return false;
  await kv.set(key, { sentAt: new Date().toISOString() });
  try {
    await pushNotifications.sendPushToUser(userId, {
      targetUrl: "/dashboard?tab=dedicated-ip",
      ...payload,
      data: { type: "ip_subscription", kind, ...(payload.data || {}) },
    });
  } catch (e) {
    console.warn(`⚠️ [IP AUTO-RENEW] push failed for ${userId}:`, (e as any)?.message);
  }
  return true;
}

export interface DailyJobResult {
  checked: number;
  reminders: number;
  renewed: number;
  lowBalance: number;
  expired: number;
  errors: string[];
}

/**
 * Daily sweep across every user holding a dedicated IP.
 */
export async function runIpSubscriptionDailyJob(): Promise<DailyJobResult> {
  const result: DailyJobResult = { checked: 0, reminders: 0, renewed: 0, lowBalance: 0, expired: 0, errors: [] };

  const assignments = (await kv.getByPrefix(ASSIGNMENT_PREFIX)) || [];

  for (const raw of assignments) {
    const assignment: any = raw?.value ?? raw;
    const userId = assignment?.userId;
    if (!userId || !assignment?.expiresAt) continue;
    if (assignment.subscriptionStatus === "cancelled") continue;

    result.checked++;

    try {
      const daysLeft = daysUntil(assignment.expiresAt);
      const consent = await getAutoRenew(userId);
      const wallet = await getWallet(userId);
      const balance = Number(wallet.balance || 0);
      const ip = assignment.ipAddress || "your dedicated IP";

      // ── Still running: remind on the last 3 days ──────────────────────
      if (daysLeft > 0 && daysLeft <= REMINDER_DAYS) {
        if (consent.enabled && balance < IP_RENEWAL_FEE) {
          // auto-renewal is ON but the wallet cannot cover it
          if (await pushOncePerDay(userId, `lowbal-${daysLeft}`, {
            title: `Add funds — IP renews in ${daysLeft} day${daysLeft > 1 ? "s" : ""}`,
            body: `Auto-renewal needs ₹${IP_RENEWAL_FEE}. Your wallet has ₹${balance.toFixed(0)}. Add ₹${(IP_RENEWAL_FEE - balance).toFixed(0)} to keep IP ${ip} active.`,
          })) result.lowBalance++;
        } else if (await pushOncePerDay(userId, `expiry-${daysLeft}`, {
          title: `Dedicated IP expires in ${daysLeft} day${daysLeft > 1 ? "s" : ""}`,
          body: consent.enabled
            ? `IP ${ip} renews automatically for ₹${IP_RENEWAL_FEE} from your wallet (balance ₹${balance.toFixed(0)}).`
            : `IP ${ip} expires on ${new Date(assignment.expiresAt).toLocaleDateString("en-IN")}. Renew now or switch on auto-renewal.`,
        })) result.reminders++;
        continue;
      }

      // ── Expired (or expiring today) ───────────────────────────────────
      if (daysLeft <= 0) {
        if (!consent.enabled) {
          if (await pushOncePerDay(userId, "expired", {
            title: "Dedicated IP subscription expired",
            body: `IP ${ip} has expired. Renew for ₹${IP_RENEWAL_FEE} to keep placing orders, or switch on auto-renewal.`,
          })) result.expired++;
          continue;
        }

        const debit = await debitWallet(
          userId,
          IP_RENEWAL_FEE,
          `Dedicated IP auto-renewal (₹${IP_RENEWAL_FEE}/month) — ${ip}`,
        );

        if (!debit.ok) {
          await kv.set(`${CONSENT_PREFIX}${userId}`, {
            ...consent,
            lastFailureAt: new Date().toISOString(),
            lastFailureReason: `Insufficient wallet balance (₹${debit.balance.toFixed(0)} of ₹${IP_RENEWAL_FEE})`,
          });
          if (await pushOncePerDay(userId, "lowbal-expired", {
            title: "Auto-renewal failed — add funds",
            body: `Wallet has ₹${debit.balance.toFixed(0)}, renewal needs ₹${IP_RENEWAL_FEE}. Add funds to restore IP ${ip}.`,
          })) result.lowBalance++;
          continue;
        }

        let renew: any;
        try {
          renew = await IPPoolManager.renewUserIPAssignment(userId, IP_RENEWAL_FEE, `wallet_auto_${Date.now()}`);
        } catch (e: any) {
          renew = { success: false, error: e?.message || String(e) };
        }

        if (!renew?.success) {
          // Renewal failed after the debit — put the money back so the daily job
          // can never drain the wallet on repeated failures.
          const restored = await refundWallet(
            userId,
            IP_RENEWAL_FEE,
            `Refund — dedicated IP auto-renewal failed (${ip})`,
          );
          await kv.set(`${CONSENT_PREFIX}${userId}`, {
            ...consent,
            lastFailureAt: new Date().toISOString(),
            lastFailureReason: `Renewal failed and ₹${IP_RENEWAL_FEE} was refunded: ${renew?.error || "unknown error"}`,
          });
          await pushOncePerDay(userId, "renew-failed", {
            title: "Auto-renewal could not complete",
            body: `We could not renew IP ${ip}. ₹${IP_RENEWAL_FEE} has been refunded to your wallet (balance ₹${restored.toFixed(0)}). Our team is on it.`,
          });
          result.errors.push(`${userId}: ${renew?.error || "renewal failed"} (refunded)`);
          continue;
        }

        await kv.set(`${CONSENT_PREFIX}${userId}`, {
          ...consent,
          lastRenewalAt: new Date().toISOString(),
          lastRenewalAmount: IP_RENEWAL_FEE,
          lastFailureAt: undefined,
          lastFailureReason: undefined,
        });

        const until = renew.assignment?.expiresAt
          ? new Date(renew.assignment.expiresAt).toLocaleDateString("en-IN")
          : "next month";
        await pushOncePerDay(userId, "renewed", {
          title: "Dedicated IP renewed",
          body: `₹${IP_RENEWAL_FEE} debited from your wallet. IP ${ip} is active until ${until}. Wallet balance ₹${debit.balance.toFixed(0)}.`,
        });
        result.renewed++;
      }
    } catch (e: any) {
      result.errors.push(`${userId}: ${e?.message || e}`);
    }
  }

  console.log("🔁 [IP AUTO-RENEW] daily job:", JSON.stringify(result));
  return result;
}
