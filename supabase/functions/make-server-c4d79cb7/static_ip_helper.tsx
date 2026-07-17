/**
 * 🚀 Dedicated IP Order Placement Helper
 *
 * Routes orders through the user's own dedicated static IP VPS for SEBI compliance.
 * Every user MUST have their own DigitalOcean VPS — there is NO shared fallback.
 *
 * Order flow:
 *   Frontend → Supabase Edge Function → this helper
 *   → User's dedicated VPS ({user-ip}:3000) → Dhan API
 */

import * as kv from "./kv_store.tsx";
import * as VPSPower from "./vps_power.tsx";

const REQUIRED_ORDER_SERVER_VERSION = "1.1.0";
const VPS_SELF_HEAL_COOLDOWN_MS = 5 * 60 * 1000;

type VpsServerInspection = {
  version: string;
  marketOnlyEnforced: boolean;
  isOutdated: boolean;
};

function compareSemver(a: string, b: string): number {
  const aParts = String(a || "0.0.0").split('.').map((part) => parseInt(part, 10) || 0);
  const bParts = String(b || "0.0.0").split('.').map((part) => parseInt(part, 10) || 0);
  const maxLength = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < maxLength; i++) {
    const aValue = aParts[i] || 0;
    const bValue = bParts[i] || 0;
    if (aValue > bValue) return 1;
    if (aValue < bValue) return -1;
  }

  return 0;
}

function buildMarketOnlyOrderDetails(
  credentials: { dhanClientId: string; dhanAccessToken: string },
  orderDetails: any
) {
  const normalizedQuantity = Math.max(1, Number(orderDetails.quantity) || 0);

  return {
    dhanClientId: credentials.dhanClientId,
    securityId: String(orderDetails.securityId || ""),
    transactionType: orderDetails.transactionType || "BUY",
    exchangeSegment: orderDetails.exchangeSegment || "NSE_FNO",
    productType: "INTRADAY",
    orderType: "MARKET",
    validity: "DAY",
    quantity: normalizedQuantity,
    correlationId:
      orderDetails.correlationId ||
      `ORDER_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    disclosedQuantity: 0,
    price: 0,
    triggerPrice: 0,
    afterMarketOrder: Boolean(orderDetails.afterMarketOrder),
    ...(orderDetails.afterMarketOrder && orderDetails.amoTime
      ? { amoTime: orderDetails.amoTime }
      : {}),
  };
}

async function inspectVpsOrderServer(ipAddress: string): Promise<VpsServerInspection> {
  const healthEndpoint = `http://${ipAddress}:3000/health`;

  try {
    const response = await fetch(healthEndpoint, {
      signal: AbortSignal.timeout(4000),
      headers: { "Cache-Control": "no-cache" },
    });

    if (!response.ok) {
      console.warn(
        `⚠️ [VPS HEALTH] ${ipAddress}:3000/health → HTTP ${response.status}. Proceeding anyway.`
      );
      return { version: "0.0.0", marketOnlyEnforced: false, isOutdated: true };
    }

    const healthData = await response.json().catch(() => ({}));
    const version = String(healthData?.version || "0.0.0");
    const marketOnlyEnforced = healthData?.marketOnlyEnforced === true;
    return {
      version,
      marketOnlyEnforced,
      isOutdated: !marketOnlyEnforced || compareSemver(version, REQUIRED_ORDER_SERVER_VERSION) < 0,
    };
  } catch (error: any) {
    // ⚡ NON-BLOCKING: /health probe failed (timeout / TCP / old server without /health).
    // Do NOT block the trade. /place-order has its own 8s timeout and will surface the
    // real error if the VPS is truly unreachable. Prevents false "VPS not running" skips
    // on a freshly provisioned droplet that accepts /place-order but not /health.
    console.warn(
      `⚠️ [VPS HEALTH] Cannot probe ${ipAddress}:3000/health (${error?.message || error}). Proceeding with order.`
    );
    return { version: "0.0.0", marketOnlyEnforced: false, isOutdated: true };
  }
}

function normalizeOrderPlacementResponse(result: any) {
  const correlationId =
    result?.correlationId ??
    result?.data?.correlationId ??
    result?.result?.correlationId ??
    result?.order?.correlationId ??
    result?.orderNo ??
    result?.data?.orderNo ??
    null;

  const orderId =
    result?.orderId ??
    result?.orderNo ??
    result?.order_id ??
    result?.exchangeOrderId ??
    result?.omsOrderId ??
    result?.clientOrderId ??
    result?.data?.orderId ??
    result?.data?.orderNo ??
    result?.data?.order_id ??
    result?.data?.exchangeOrderId ??
    result?.data?.omsOrderId ??
    result?.result?.orderId ??
    result?.result?.orderNo ??
    result?.order?.orderId ??
    result?.order?.orderNo ??
    null;

  const orderStatus =
    result?.orderStatus ??
    result?.status ??
    result?.data?.orderStatus ??
    result?.result?.orderStatus ??
    result?.order?.orderStatus ??
    null;

  const averagePrice =
    result?.averagePrice ??
    result?.price ??
    result?.averageTradedPrice ??
    result?.data?.averagePrice ??
    result?.data?.price ??
    result?.result?.averagePrice ??
    result?.result?.price ??
    null;

  const message =
    result?.message ??
    result?.remarks?.message ??
    (typeof result?.remarks === "string" ? result.remarks : null) ??
    (typeof result?.error === "string" ? result.error : null) ??
    (orderId ? "Order placed successfully via dedicated VPS" : "Order placement failed");

  const normalizedStatus = String(orderStatus ?? "").toUpperCase();
  const looksSuccessful =
    ["SUCCESS", "PLACED", "ACCEPTED", "TRANSIT", "PENDING", "TRADED", "EXECUTED"].includes(normalizedStatus) ||
    /success|placed|accepted|transit|pending|executed/i.test(message ?? "");

  return {
    ...result,
    success:
      typeof result?.success === "boolean"
        ? result.success || Boolean(orderId) || looksSuccessful
        : Boolean(orderId) || looksSuccessful,
    orderId,
    correlationId,
    orderStatus,
    averagePrice,
    message,
  };
}

// ─────────────────────────────────────────────────────────────
// PUBLIC: Place order via the user's dedicated static IP
// ─────────────────────────────────────────────────────────────

export async function placeOrderViaStaticIP(
  userId: string,
  credentials: { dhanClientId: string; dhanAccessToken: string },
  orderDetails: any
): Promise<any> {
  const ORDER_SERVER_API_KEY = Deno.env.get("ORDER_SERVER_API_KEY");

  if (!ORDER_SERVER_API_KEY) {
    throw new Error("ORDER_SERVER_API_KEY not configured in Supabase secrets");
  }

  // ── Step 1: Resolve the dedicated IP ───────────────────────
  // Throws if the user has no active dedicated VPS subscription.
  const userIP = await getUserOrderPlacementIP(userId);
  console.log(
    `📍 [ORDER ROUTING] User ${userId.substring(0, 8)} → Dedicated IP: ${userIP.ipAddress}`
  );

  const vpsInspection = await inspectVpsOrderServer(userIP.ipAddress);
  if (vpsInspection.isOutdated) {
    console.warn(
      `⚠️ [DEDICATED IP] Legacy VPS server detected at ${userIP.ipAddress} ` +
      `(version ${vpsInspection.version}, marketOnlyEnforced=${vpsInspection.marketOnlyEnforced}). ` +
      `Continuing with edge-enforced MARKET payload for automatic compatibility.`
    );
  }

  const endpoint = `http://${userIP.ipAddress}:3000/place-order`;

  // ── Step 2: Build the order payload ────────────────────────
  const dhanOrderDetails = buildMarketOnlyOrderDetails(credentials, orderDetails);

  console.log(
    `🛡️ [DEDICATED IP] Market-only payload enforced for ${userId.substring(0, 8)}:`,
    JSON.stringify({
      securityId: dhanOrderDetails.securityId,
      transactionType: dhanOrderDetails.transactionType,
      exchangeSegment: dhanOrderDetails.exchangeSegment,
      productType: dhanOrderDetails.productType,
      orderType: dhanOrderDetails.orderType,
      quantity: dhanOrderDetails.quantity,
      price: dhanOrderDetails.price,
      triggerPrice: dhanOrderDetails.triggerPrice,
      afterMarketOrder: dhanOrderDetails.afterMarketOrder,
      hasAmoTime: Boolean(dhanOrderDetails.amoTime),
      hasBracketFields: false,
    })
  );

  console.log(`📤 [DEDICATED IP] Sending to: ${endpoint}`);

  // ── Step 3: Send to VPS with smart retry logic ─────────────
  // Each fetch has a hard 8-second timeout. We do NOT retry IP-whitelist errors
  // (DH-905) because Dhan's propagation takes minutes, not seconds. Instead we
  // return a clear actionable message telling the user what to do.
  const VPS_FETCH_TIMEOUT_MS = 8000;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VPS_FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ORDER_SERVER_API_KEY}`,
        },
        body: JSON.stringify({
          userId,
          accessToken: credentials.dhanAccessToken,
          orderDetails: dhanOrderDetails,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    console.log(`📡 [IP ${userIP.ipAddress}] Response: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      let errorData: any;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }

      // 🔎 Log FULL raw Dhan response so we can diagnose real errors vs false positives
      console.log(`🔎 [IP ${userIP.ipAddress}] Dhan raw error response (status ${response.status}):`, errorText);

      const rawMsg = (
        errorData.error?.errorMessage ||
        errorData.remarks?.errorMessage ||
        errorData.message ||
        (typeof errorData.error === "string" ? errorData.error : "") ||
        errorText
      ).toString();

      const errorCode =
        errorData.error?.errorCode ||
        errorData.remarks?.errorCode ||
        errorData.errorCode ||
        "";

      // ── Detect Dhan Invalid Token (DH-908 / access token expired) ─
      const isTokenError =
        errorCode === "DH-908" ||
        rawMsg.toLowerCase() === "invalid token" ||
        rawMsg.toLowerCase().includes("invalid token") ||
        rawMsg.toLowerCase().includes("token expired") ||
        rawMsg.toLowerCase().includes("access token");

      if (isTokenError) {
        console.log(`⚠️ [IP ${userIP.ipAddress}] Dhan access token invalid or expired (DH-908).`);
        const tokenError = new Error(
          `TOKEN_EXPIRED:Your Dhan access token has expired or changed. ` +
          `Please go to Broker Setup → Dhan Credentials and update your access token with the latest one from your Dhan account.`
        );
        (tokenError as any).code = "TOKEN_EXPIRED";
        throw tokenError;
      }

      // ✅ TIGHTENED: only trigger IP-whitelist error on DH-905 OR very specific phrases.
      // Previously matched a bare `"ip address"` substring which produced false positives on many
      // unrelated Dhan errors (margin, product, symbol errors that happen to mention "IP address").
      const lowerMsg = rawMsg.toLowerCase();
      const isIPError =
        errorCode === "DH-905" ||
        lowerMsg.includes("ip not whitelisted") ||
        lowerMsg.includes("ip is not whitelisted") ||
        lowerMsg.includes("ip address is not whitelisted") ||
        lowerMsg.includes("static ip not") ||
        lowerMsg.includes("whitelist your ip") ||
        lowerMsg.includes("invalid ip address");

      if (isIPError) {
        console.log(`⚠️ [IP ${userIP.ipAddress}] Dhan IP whitelist not yet active (DH-905). User must wait for propagation.`);
        const ipError = new Error(
          `IP_WHITELIST_PENDING:Your VPS IP ${userIP.ipAddress} has not been activated by Dhan yet. ` +
          `After adding a new IP in Dhan's Static IP Settings, please wait 15–30 minutes before placing your first order. ` +
          `The IP you need to add is: ${userIP.ipAddress}`
        );
        (ipError as any).code = "IP_WHITELIST_PENDING";
        (ipError as any).vpsIP = userIP.ipAddress;
        throw ipError;
      }

      // Surface the REAL Dhan error to the user (with error code if present) so they know
      // what actually went wrong instead of being told to wait for IP propagation forever.
      const msg =
        errorData.error?.errorMessage ||
        errorData.remarks?.errorMessage ||
        (typeof errorData.error === "string" ? errorData.error : null) ||
        errorData.message ||
        `VPS server error: ${response.status}`;
      const finalMsg = errorCode ? `${errorCode}: ${msg}` : msg;
      throw new Error(finalMsg);
    }

    const rawResult = await response.json();
    const result = normalizeOrderPlacementResponse(rawResult);
    console.log(`✅ [IP ${userIP.ipAddress}] Order placed:`, result?.orderId || result);
    return result;
  } catch (err: any) {
    // Re-throw known structured errors immediately — retries won't help
    if (
      err.code === "IP_WHITELIST_PENDING" || err.message?.startsWith("IP_WHITELIST_PENDING:") ||
      err.code === "TOKEN_EXPIRED" || err.message?.startsWith("TOKEN_EXPIRED:")
    ) {
      throw err;
    }

    const isNetError =
      err.name === "AbortError" ||
      err.message?.includes("aborted") ||
      err.message?.includes("fetch") ||
      err.message?.includes("network") ||
      err.message?.includes("connect");

    if (isNetError) {
      const healKey = `vps_self_heal:${userId}:${userIP.ipAddress}`;
      const lastHeal = Number((await kv.get(healKey)) || 0);
      if (Date.now() - lastHeal > VPS_SELF_HEAL_COOLDOWN_MS) {
        await kv.set(healKey, Date.now());
        try {
          const heal = await VPSPower.userReboot(userId);
          console.warn(`🔧 [VPS SELF-HEAL] Reboot/power-on requested for ${userIP.ipAddress}: ${JSON.stringify(heal)}`);
        } catch (healErr: any) {
          console.warn(`⚠️ [VPS SELF-HEAL] Failed for ${userIP.ipAddress}: ${healErr?.message || healErr}`);
        }
      }
      throw new Error(
        `Cannot reach your dedicated VPS at ${userIP.ipAddress}:3000. ` +
        `Auto-recovery has been triggered; the backend will retry this signal automatically. If it keeps failing, SSH into your VPS and run: sudo systemctl restart orderserver`
      );
    }

    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// INTERNAL: Resolve the dedicated order-routing IP for a user
// Throws if the user has no active dedicated VPS — NO shared fallback.
// ─────────────────────────────────────────────────────────────

export async function getUserOrderPlacementIP(
  userId: string
): Promise<{ ipAddress: string; type: "dedicated" }> {
  try {
    const assignments: any[] = [];
    const currentAssignment = await kv.get(`user_ip_assignment:${userId}`);
    if (currentAssignment) {
      assignments.push({ value: currentAssignment });
    }

    const legacyRows = await kv.getByPrefix(`ip_assignment:${userId}:`);
    if (legacyRows?.length) {
      assignments.push(...legacyRows);
    }

    if (assignments.length > 0) {
      for (const row of assignments) {
        const data = row.value || row;

        const isActive =
          data.subscriptionStatus === "active" &&
          data.expiresAt &&
          new Date(data.expiresAt) > new Date();

        if (isActive && data.ipAddress) {
          console.log(`✅ [KV] Dedicated IP for ${userId.substring(0, 8)}: ${data.ipAddress}`);
          return { ipAddress: data.ipAddress, type: "dedicated" };
        }

        // Has a VPS entry but it's expired
        if (data.ipAddress) {
          console.log(`⚠️ [KV] VPS subscription expired for user ${userId.substring(0, 8)}`);
          throw new Error(
            "Your dedicated VPS subscription has expired. " +
            "Please renew from the Broker Setup page to continue placing orders."
          );
        }
      }
    }
  } catch (err: any) {
    // Re-throw our own meaningful errors
    if (err.message?.includes("expired") || err.message?.includes("dedicated VPS")) {
      throw err;
    }
    console.error(`❌ [KV] Lookup error for ${userId.substring(0, 8)}:`, err.message);
  }

  // No dedicated VPS found — user must purchase one
  throw new Error(
    "No dedicated VPS found for your account. " +
    "Please purchase a dedicated VPS from the Broker Setup page before placing orders. " +
    "Each user requires their own static IP for SEBI compliance."
  );
}

// ─────────────────────────────────────────────────────────────
// PUBLIC: Get user's dedicated IP info (for UI display)
// ─────────────────────────────────────────────────────────────

export async function getUserDedicatedIPInfo(userId: string): Promise<any> {
  try {
    const rows: any[] = [];
    const currentAssignment = await kv.get(`user_ip_assignment:${userId}`);
    if (currentAssignment) {
      rows.push({ value: currentAssignment });
    }

    const legacyRows = await kv.getByPrefix(`ip_assignment:${userId}:`);
    if (legacyRows?.length) {
      rows.push(...legacyRows);
    }

    if (!rows || rows.length === 0) {
      return {
        hasIP: false,
        type: "none",
        message: "No dedicated VPS found. Please purchase a dedicated VPS from the Broker Setup page.",
      };
    }

    const row = rows[0];
    const data = row.value || row;

    const isActive =
      data.subscriptionStatus === "active" &&
      data.expiresAt &&
      new Date(data.expiresAt) > new Date();

    if (isActive) {
      return {
        hasIP: true,
        type: "dedicated",
        ipAddress: data.ipAddress,
        provider: data.provider || "digitalocean",
        subscriptionStatus: data.subscriptionStatus,
        expiresAt: data.expiresAt,
        assignedAt: data.assignedAt,
        daysRemaining: Math.ceil(
          (new Date(data.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        ),
      };
    }

    return {
      hasIP: false,
      type: "expired",
      message: "Your dedicated VPS subscription has expired. Please renew to continue trading.",
      expiredIP: data.ipAddress,
    };
  } catch (err: any) {
    console.error("Error getting dedicated IP info:", err.message);
    return {
      hasIP: false,
      type: "error",
      error: err.message,
    };
  }
}
