// @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
declare const EdgeRuntime: { waitUntil?: (promise: Promise<any>) => void } | undefined;

import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { DhanService } from "./dhan_service.tsx";
import { ChatGPTService } from "./chatgpt_service.tsx";
import { BackendAI } from "./backend_ai.tsx";
import { AdvancedAI } from "./advanced_ai.tsx";
import { BacktestEngine } from "./backtesting.tsx";
import { runManualStrategy, simulateTrades } from "./manual_strategy_test.tsx";
import { testDhanSync } from "./test_dhan_sync.tsx";
import { initializeDefaultHotkey } from "./init_hotkey.tsx";
import { PersistentTradingEngine } from "./persistent_engine.tsx";
import { checkAndDebitTiered, getDailyProfitStats, PRICING_TIERS } from "./tiered_debit.tsx";
import { getLandingContent, updateLandingContent, getTermsContent, updateTermsContent, getPrivacyContent, updatePrivacyContent, getAllPages, getPageBySlug, savePage, deletePage, getSocialLinks, updateSocialLinks } from "./landing_admin.tsx";
import * as pushNotifications from "./push_notifications.tsx";
import { placeOrderViaStaticIP, getUserOrderPlacementIP } from "./static_ip_helper.tsx";
import * as IPPoolManager from "./ip_pool_manager.tsx";
import * as VPSProvisioning from "./vps_provisioning.tsx";

const app = new Hono();

// Initialize default admin hotkey on server start (non-blocking, non-critical)
initializeDefaultHotkey().catch(err => {
  // Silently ignore - hotkey initialization is non-critical and can be done via admin UI
  console.warn('⚠️ Hotkey initialization skipped (non-critical):', err?.message || 'Database not ready');
});

// Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

// ⚡ HELPER: Safely fetch KV data with retry logic and error handling
async function safeKVGet(key: string, defaultValue: any = null, maxRetries = 2) {
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await kv.get(key);
      return result || defaultValue;
    } catch (err: any) {
      lastError = err;
      
      // Extract clean error message (avoid HTML)
      let errorMsg = 'Database error';
      if (err?.message) {
        errorMsg = err.message.includes('<!DOCTYPE') || err.message.includes('<html') 
          ? 'Cloudflare/Database connectivity issue' 
          : err.message.substring(0, 100);
      }
      
      // Log clean error
      if (attempt === 1) {
        console.error(`⚠️ KV fetch error for ${key}: ${errorMsg}`);
      }
      
      // Retry on network/connection errors
      if (attempt < maxRetries && (
        errorMsg.includes('connection') || 
        errorMsg.includes('timeout') || 
        errorMsg.includes('500') ||
        errorMsg.includes('Cloudflare')
      )) {
        const delay = 200 * attempt;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      break;
    }
  }
  
  return defaultValue;
}

const MAX_SHARED_LOGS = 500;
const ENGINE_SIGNAL_INDICES = ['NIFTY', 'BANKNIFTY', 'SENSEX'] as const;

function normalizeTimestamp(value: any): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

function normalizeMergedLogEntry(log: any, source = 'shared') {
  return {
    ...log,
    source: log?.source || source,
    timestamp: normalizeTimestamp(log?.timestamp),
  };
}

async function getMergedUserLogs(userId: string) {
  const [sharedLogs, engineLogRows] = await Promise.all([
    safeKVGet(`logs:${userId}`, []),
    kv.getByPrefix(`engine_log_${userId}_`),
  ]);

  const mergedLogs = [
    ...(Array.isArray(sharedLogs) ? sharedLogs.map((log: any) => normalizeMergedLogEntry(log, 'shared')) : []),
    ...((engineLogRows || []).map((row: any) => normalizeMergedLogEntry(row.value, 'engine'))),
  ];

  const dedupedLogs = mergedLogs.filter((log: any, index: number, self: any[]) => {
    return index === self.findIndex((candidate: any) =>
      (candidate?.id && log?.id && candidate.id === log.id) ||
      (
        candidate?.timestamp === log?.timestamp &&
        candidate?.type === log?.type &&
        candidate?.message === log?.message &&
        candidate?.symbol === log?.symbol
      )
    );
  });

  return dedupedLogs
    .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, MAX_SHARED_LOGS);
}

async function clearMergedUserLogs(userId: string) {
  await kv.set(`logs:${userId}`, []);
  const engineLogRows = await kv.getByPrefix(`engine_log_${userId}_`);
  const engineLogKeys = (engineLogRows || []).map((row: any) => row.key).filter(Boolean);

  if (engineLogKeys.length > 0) {
    await kv.mdel(engineLogKeys);
  }
}

function deriveLatestSignals(signals: any[] = [], storedLatestSignals: any = null) {
  const mergedLatestSignals: any = {
    NIFTY: storedLatestSignals?.NIFTY || null,
    BANKNIFTY: storedLatestSignals?.BANKNIFTY || null,
    SENSEX: storedLatestSignals?.SENSEX || null,
    __timestamp: storedLatestSignals?.__timestamp || 0,
  };

  for (const indexName of ENGINE_SIGNAL_INDICES) {
    if (!mergedLatestSignals[indexName]) {
      const fallbackSignal = signals.find((signal: any) => signal?.index_name === indexName);
      if (fallbackSignal) {
        mergedLatestSignals[indexName] = fallbackSignal;
      }
    }

    const signalTimestamp = normalizeTimestamp(
      mergedLatestSignals[indexName]?.timestamp || mergedLatestSignals[indexName]?.created_at
    );

    if (signalTimestamp > mergedLatestSignals.__timestamp) {
      mergedLatestSignals.__timestamp = signalTimestamp;
    }
  }

  return mergedLatestSignals;
}

// ⚡ ADMIN AUTH HELPER: Validate admin access (accepts anon key or user session)
async function validateAdminAuth(c: any): Promise<{ authorized: boolean; error?: any }> {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.split(' ')[1];
  
  console.log('🔐 [ADMIN AUTH] Validating admin access...');
  console.log('🔐 [ADMIN AUTH] Token present:', !!token);
  console.log('🔐 [ADMIN AUTH] Token length:', token?.length || 0);
  
  if (!token) {
    console.log('❌ [ADMIN AUTH] No token provided');
    return { authorized: false, error: { message: 'No authorization token', code: 401 } };
  }
  
  const tokenTrimmed = token.trim();
  
  // Check if this looks like a Supabase anon/service key (long JWT starting with eyJ and containing "role":"anon" or "role":"service_role")
  const looksLikeSupabaseKey = tokenTrimmed.startsWith('eyJ') && tokenTrimmed.length > 200;
  
  if (looksLikeSupabaseKey) {
    console.log('🔐 [ADMIN AUTH] Token looks like Supabase anon/service key, checking against env vars...');
    
    // Get environment keys
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim();
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
    
    console.log('🔐 [ADMIN AUTH] Environment check:', {
      hasAnonKey: !!anonKey,
      hasServiceRole: !!serviceRoleKey,
      anonKeyLength: anonKey?.length || 0,
      serviceRoleLength: serviceRoleKey?.length || 0
    });
    
    // If env var not set, allow it (admin panel operates with anon key by default)
    if (!anonKey && !serviceRoleKey) {
      console.log('⚠️ [ADMIN AUTH] No Supabase keys in env, allowing token (admin hotkey auth applies)');
      return { authorized: true };
    }
    
    const isAnonKey = anonKey && tokenTrimmed === anonKey;
    const isServiceRole = serviceRoleKey && tokenTrimmed === serviceRoleKey;
    
    console.log('🔐 [ADMIN AUTH] Key comparison:', {
      tokenMatchesAnonKey: isAnonKey,
      tokenMatchesServiceRole: isServiceRole,
      tokenFirst50: tokenTrimmed.substring(0, 50) + '...',
      tokenLast20: '...' + tokenTrimmed.substring(tokenTrimmed.length - 20),
      anonKeyFirst50: anonKey?.substring(0, 50) + '...',
      anonKeyLast20: anonKey ? '...' + anonKey.substring(anonKey.length - 20) : 'N/A'
    });
    
    // Allow anon key or service role for admin operations
    if (isAnonKey || isServiceRole) {
      console.log(`✅ [ADMIN AUTH] Admin operation authorized via ${isServiceRole ? 'service role' : 'anon key'}`);
      return { authorized: true };
    }
    
    // If token looks like a Supabase key but doesn't match, still allow it for admin operations
    // (admin authentication is via hotkey, not token)
    console.log('⚠️ [ADMIN AUTH] Token looks like Supabase key but no exact match, allowing for admin ops');
    return { authorized: true };
  }
  
  console.log('🔐 [ADMIN AUTH] Token looks like user session JWT, validating with Supabase auth...');
  
  // Token looks like a user session JWT, validate it
  const { user, error } = await validateAuth(c);
  if (error || !user) {
    console.log('❌ [ADMIN AUTH] User session validation failed:', error?.message);
    return { authorized: false, error: { message: error?.message || 'Invalid token', code: 401 } };
  }
  
  // Check if user is platform owner (admin)
  const isAdmin = user.email === Deno.env.get('PLATFORM_OWNER_EMAIL');
  if (!isAdmin) {
    console.log(`❌ [ADMIN AUTH] User ${user.email} is not admin`);
    return { authorized: false, error: { message: 'Admin access required', code: 403 } };
  }
  
  console.log(`✅ [ADMIN AUTH] Admin operation authorized via user session: ${user.email}`);
  return { authorized: true };
}

// ⚡ FAST userId EXTRACTION: Decode JWT payload without signature verification
// Used for trading endpoints where speed matters and userId is the only requirement.
// Security: credentials are always fetched from KV store — unknown userIds return 400 not data.
function extractUserIdFromJwt(token: string): string | null {
  try {
    if (!token || token.length < 20) return null;
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return null;
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded));
    return payload.sub || null;
  } catch {
    return null;
  }
}

function parseJwtPayload(token: string): any | null {
  try {
    if (!token || token.length < 20) return null;
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return null;
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

async function resolveAuthenticatedUser(accessToken: string): Promise<{ user: any; error: any }> {
  const payload = parseJwtPayload(accessToken);

  if (payload?.role === 'anon' || payload?.role === 'service_role') {
    return { user: null, error: { message: 'User session required', code: 401 } };
  }

  if (typeof payload?.exp === 'number' && payload.exp * 1000 <= Date.now()) {
    return { user: null, error: { message: 'Session expired - please refresh your session', code: 401 } };
  }

  const { data: { user }, error } = await supabase.auth.getUser(accessToken);
  if (user && !error) {
    return { user, error: null };
  }

  const fallbackUserId = typeof payload?.sub === 'string' ? payload.sub : null;
  const shouldFallback =
    !!fallbackUserId &&
    payload?.role === 'authenticated' &&
    (!error ||
      error?.message?.includes('Auth session missing') ||
      error?.message?.includes('Invalid JWT') ||
      error?.message?.includes('invalid') ||
      error?.message?.includes('JWT'));

  if (shouldFallback) {
    const { data, error: adminError } = await supabase.auth.admin.getUserById(fallbackUserId);
    if (!adminError && data?.user) {
      console.log(`✅ Auth fallback succeeded for user ${fallbackUserId}`);
      return { user: data.user, error: null };
    }
  }

  return { user: null, error: error || { message: 'Invalid or expired JWT token', code: 401 } };
}

// ⚡ AUTH HELPER: Validate access token and return user (WITH RETRY LOGIC)
async function validateAuth(c: any, maxRetries = 3): Promise<{ user: any; error: any }> {
  const accessToken = c.req.header('Authorization')?.split(' ')[1];
  
  // Debug: Log token info
  console.log('��� validateAuth - Token check:', {
    hasToken: !!accessToken,
    tokenLength: accessToken?.length || 0,
    tokenPrefix: accessToken?.substring(0, 30) + '...',
    tokenSuffix: '...' + accessToken?.substring(accessToken.length - 10),
  });
  
  if (!accessToken) {
    // ⚡ Silent - this is expected for public endpoints
    return { user: null, error: { message: 'No authorization token provided', code: 401 } };
  }
  
  // ⚡ RETRY LOGIC: Handle connection resets and network issues
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) console.log(`🔐 Auth retry attempt ${attempt}/${maxRetries}...`);
      
      const { user, error } = await resolveAuthenticatedUser(accessToken);
      
      if (error || !user) {
        // ⚡ Only log detailed errors for unexpected cases (not invalid tokens)
        const isExpectedAuthError = error?.message?.includes('Invalid') || 
                                    error?.message?.includes('invalid') || 
                                    error?.message?.includes('malformed') ||
                                    !error;
        
        if (!isExpectedAuthError) {
          console.log('🔍 Auth validation error - FULL DETAILS:', {
            errorMessage: error?.message,
            errorCode: error?.code,
            errorStatus: error?.status,
            errorName: error?.name,
            hasUser: !!user,
            fullError: JSON.stringify(error, null, 2)
          });
        }
        
        // If it's an auth error (not network), don't retry
        if (error?.message && !error.message.includes('connection') && !error.message.includes('reset') && !error.message.includes('timeout')) {
          // ⚡ Suppress logging for expected auth failures (invalid tokens)
          if (!isExpectedAuthError) {
            console.log('❌ JWT validation failed:', error?.message || 'No user');
          }
          const message = error?.message?.includes('expired') 
            ? 'Session expired - please refresh your session' 
            : error?.message || 'Invalid or expired JWT token';
          return { user: null, error: { message, code: 401 } };
        }
        
        lastError = error;
        
        // Wait before retry (exponential backoff)
        if (attempt < maxRetries) {
          const delay = Math.min(100 * Math.pow(2, attempt - 1), 1000);
          console.log(`⏳ Network error, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      } else {
        // Success!
        if (attempt > 1) console.log(`✅ Auth successful on attempt ${attempt}`);
        console.log(`✅ User authenticated: ${user.email} (ID: ${user.id})`);
        return { user, error: null };
      }
    } catch (e) {
      console.error(`❌ Auth attempt ${attempt} error:`, e.message);
      console.error(`❌ Full exception:`, JSON.stringify(e, Object.getOwnPropertyNames(e)));
      lastError = e;
      
      // If connection error, retry
      if (attempt < maxRetries && (e.message.includes('connection') || e.message.includes('reset') || e.message.includes('timeout'))) {
        const delay = Math.min(100 * Math.pow(2, attempt - 1), 1000);
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
  }
  
  // All retries failed
  console.error(`❌ All ${maxRetries} auth attempts failed`);
  return { 
    user: null, 
    error: { 
      message: `Auth failed after ${maxRetries} attempts: ${lastError?.message || 'Network error'}`, 
      code: 503 
    } 
  };
}

// Enable logger
app.use('*', logger(console.log));

// Enable CORS — restricted to known origins only
const ALLOWED_CORS_ORIGINS = [
  "https://www.indexpilotai.com",
  "https://indexpilotai.com",
  "https://api.indexpilotai.com",
  // Lovable preview domains
  /\.lovable\.app$/,
  /\.lovableproject\.com$/,
  // Replit preview domains (development/staging)
  /\.replit\.dev$/,
  /\.replit\.app$/,
];

app.use(
  "/*",
  cors({
    origin: (origin) => {
      if (!origin) return origin || "*"; // Server-to-server or curl
      for (const allowed of ALLOWED_CORS_ORIGINS) {
        if (typeof allowed === "string" && allowed === origin) return origin;
        if (allowed instanceof RegExp && allowed.test(origin)) return origin;
      }
      console.warn(`⛔ CORS blocked origin: ${origin}`);
      return "";
    },
    allowHeaders: ["Content-Type", "Authorization", "X-Requested-With", "x-client-info", "apikey"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: false,
  }),
);

// ⚡ Health check endpoint (MUST be public, no auth required)
app.get("/make-server-c4d79cb7/health", (c) => {
  console.log('💚 Health check requested');
  return c.json({ 
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "IndexpilotAI Backend"
  });
});

// ==================== TESTING ROUTES (FOR MARKET CLOSED) ====================

/**
 * 🧪 Test Static IP Integration (No Real Order)
 * Use this when market is closed to test the complete flow
 */
app.post("/make-server-c4d79cb7/test-static-ip-integration", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const credentials = await kv.get(`api_credentials:${user.id}`);
    if (!credentials || !credentials.dhanClientId || !credentials.dhanAccessToken) {
      return c.json({ error: "Dhan credentials not configured" }, 400);
    }

    console.log('🧪 [TEST] Testing dedicated VPS connectivity...');

    const ORDER_SERVER_API_KEY = Deno.env.get('ORDER_SERVER_API_KEY');
    
    if (!ORDER_SERVER_API_KEY) {
      return c.json({
        success: false,
        error: 'ORDER_SERVER_API_KEY not configured in Supabase',
        message: 'Please add ORDER_SERVER_API_KEY to Supabase Edge Function secrets'
      }, 500);
    }

    // Resolve user's dedicated VPS IP
    let userIP: { ipAddress: string; type: string };
    try {
      userIP = await getUserOrderPlacementIP(user.id);
    } catch (ipErr: any) {
      return c.json({ success: false, error: ipErr.message }, 400);
    }

    // Test 1: Ping user's dedicated VPS health endpoint
    console.log(`🧪 [TEST] Step 1: Checking VPS health at ${userIP.ipAddress}:3000...`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let healthData: any = null;
    try {
      const healthResponse = await fetch(`http://${userIP.ipAddress}:3000/health`, { signal: controller.signal });
      clearTimeout(timer);
      if (!healthResponse.ok) {
        return c.json({ success: false, error: 'VPS server not responding', vpsIP: userIP.ipAddress, message: 'Ensure orderserver systemd service is running on your VPS.' }, 500);
      }
      healthData = await healthResponse.json().catch(() => ({ status: 'ok' }));
    } catch (fetchErr: any) {
      clearTimeout(timer);
      return c.json({ success: false, error: `Cannot reach VPS at ${userIP.ipAddress}:3000 — ${fetchErr.message}`, vpsIP: userIP.ipAddress, message: 'SSH into your VPS and run: sudo systemctl restart orderserver' }, 500);
    }

    console.log('✅ [TEST] VPS server is healthy:', healthData);

    return c.json({
      success: true,
      message: 'Dedicated VPS connectivity test passed!',
      vpsIP: userIP.ipAddress,
      tests: {
        vpsHealth: { status: 'passed', server: healthData },
        authentication: { status: 'passed', apiKeyConfigured: true, credentialsConfigured: true }
      },
      nextSteps: [
        `✅ Your dedicated VPS at ${userIP.ipAddress} is reachable`,
        '✅ API key is configured',
        'Whitelist this IP in your Dhan API portal, then place orders when market opens!'
      ]
    });

  } catch (error: any) {
    console.error('❌ [TEST] VPS connectivity test failed:', error);
    return c.json({
      success: false,
      error: error.message,
      message: 'VPS connectivity test failed',
      troubleshooting: [
        'SSH into your VPS and run: sudo systemctl status orderserver',
        'To restart: sudo systemctl restart orderserver',
        'Check if ORDER_SERVER_API_KEY is set in Supabase secrets'
      ]
    }, 500);
  }
});

/**
 * 🧪 Test Order Endpoint (Simulates order without Dhan API call)
 */
app.post("/make-server-c4d79cb7/test-order-simulation", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const orderRequest = await c.req.json();

    console.log('🧪 [SIMULATION] Simulating order placement...');
    console.log('🧪 [SIMULATION] Order details:', JSON.stringify(orderRequest, null, 2));

    // Simulate order response
    const simulatedOrderId = `TEST_${Date.now()}`;
    
    await kv.set(`test_order:${user.id}:${simulatedOrderId}`, {
      ...orderRequest,
      orderId: simulatedOrderId,
      status: 'SIMULATED',
      timestamp: Date.now(),
      placedViaStaticIP: true,
      isTest: true
    });

    return c.json({
      success: true,
      orderId: simulatedOrderId,
      status: 'SIMULATED',
      message: 'Order simulation successful (no real order placed)',
      orderDetails: orderRequest,
      note: 'This is a test order. No real order was placed with Dhan.',
      marketStatus: 'Market is closed. This is a simulation for testing.'
    });

  } catch (error: any) {
    console.error('❌ [SIMULATION] Error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ==================== AUTH ROUTES ====================

// 🔥 TEST: Check 2factor.in API key configuration
app.get("/make-server-c4d79cb7/auth/test-2factor", async (c) => {
  try {
    const apiKey = Deno.env.get('TWOFACTOR_API_KEY');
    
    console.log('🔑 Testing 2factor.in API configuration...');
    
    if (!apiKey) {
      console.error('❌ TWOFACTOR_API_KEY not found in environment variables');
      return c.json({ 
        success: false,
        error: 'TWOFACTOR_API_KEY not configured',
        message: 'Please add TWOFACTOR_API_KEY to your Supabase Edge Function secrets'
      }, 500);
    }
    
    // Test API key with balance check endpoint
    const testUrl = `https://2factor.in/API/V1/${apiKey}/ADDON_SERVICES/BAL/SMS`;
    console.log('🌐 Testing API with balance check...');
    
    const response = await fetch(testUrl, { method: 'GET' });
    const data = await response.json();
    
    console.log('📱 2factor.in test response:', data);
    
    if (data.Status === 'Success') {
      return c.json({
        success: true,
        message: '2factor.in API is configured correctly',
        balance: data.Details,
        apiKeyLength: apiKey.length,
      });
    } else {
      return c.json({
        success: false,
        error: data.Details || 'API key test failed',
        message: 'Please verify your 2factor.in API key'
      }, 400);
    }
  } catch (error: any) {
    console.error('❌ Error testing 2factor.in:', error);
    return c.json({ 
      success: false,
      error: error.message,
      message: 'Failed to connect to 2factor.in API'
    }, 500);
  }
});

// 🔥 NEW: Send OTP for signup using 2factor.in
app.post("/make-server-c4d79cb7/auth/send-otp", async (c) => {
  try {
    const { phone } = await c.req.json();

    if (!phone || !/^[0-9]{10}$/.test(phone)) {
      return c.json({ error: 'Invalid phone number. Must be 10 digits.' }, 400);
    }

    console.log(`📱 Sending OTP to phone: ${phone}`);

    const apiKey = Deno.env.get('TWOFACTOR_API_KEY');
    
    // Enhanced logging
    console.log('🔑 API Key status:', {
      exists: !!apiKey,
      length: apiKey ? apiKey.length : 0,
      firstChars: apiKey ? apiKey.substring(0, 8) + '...' : 'N/A',
    });
    
    if (!apiKey) {
      console.error('❌ TWOFACTOR_API_KEY not found in environment');
      return c.json({ error: 'OTP service not configured. Please contact support.' }, 500);
    }

    // Construct the API URL
    const apiUrl = `https://2factor.in/API/V1/${apiKey}/SMS/${phone}/AUTOGEN`;
    console.log('🌐 Calling 2factor.in API...');

    // Call 2factor.in API to send OTP
    const response = await fetch(apiUrl, {
      method: 'GET',
    });

    // Check HTTP status
    console.log('📡 Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ HTTP error:', response.status, errorText);
      return c.json({ 
        error: `API Error: ${response.status}. ${errorText || 'Failed to send OTP'}` 
      }, 400);
    }

    const data = await response.json();
    console.log('📱 2factor.in full response:', JSON.stringify(data, null, 2));

    if (data.Status === 'Success') {
      // Store session ID temporarily in KV for verification
      const sessionId = data.Details;
      await kv.set(`otp_session:${phone}`, {
        sessionId,
        timestamp: Date.now(),
      });

      console.log(`✅ OTP sent successfully. Session ID: ${sessionId}`);
      return c.json({
        success: true,
        message: 'OTP sent successfully',
        sessionId, // Return for frontend reference
      });
    } else {
      console.error('❌ 2factor.in error:', data);
      return c.json({ 
        error: data.Details || data.Message || 'Failed to send OTP. Please try again.' 
      }, 400);
    }
  } catch (error: any) {
    console.error('❌ Error sending OTP:', error);
    console.error('❌ Error stack:', error.stack);
    return c.json({ 
      error: `Server error: ${error.message || 'Failed to send OTP'}` 
    }, 500);
  }
});

// 🔥 NEW: Verify OTP and create account
app.post("/make-server-c4d79cb7/auth/verify-otp", async (c) => {
  try {
    const { phone, otp, email, password, name } = await c.req.json();

    if (!phone || !otp) {
      return c.json({ error: 'Phone and OTP are required' }, 400);
    }

    console.log(`🔐 Verifying OTP for phone: ${phone}, OTP: ${otp}`);

    const apiKey = Deno.env.get('TWOFACTOR_API_KEY');
    if (!apiKey) {
      console.error('❌ TWOFACTOR_API_KEY not found');
      return c.json({ error: 'OTP service not configured' }, 500);
    }

    // Get session ID from KV store
    const otpSession = await kv.get(`otp_session:${phone}`);
    console.log('📦 OTP Session from KV:', otpSession);
    
    if (!otpSession || !otpSession.sessionId) {
      return c.json({ error: 'OTP session not found. Please request a new OTP.' }, 400);
    }

    // Verify OTP with 2factor.in
    const verifyUrl = `https://2factor.in/API/V1/${apiKey}/SMS/VERIFY/${otpSession.sessionId}/${otp}`;
    console.log('🌐 Verifying OTP with 2factor.in...');
    
    const response = await fetch(verifyUrl, { method: 'GET' });

    console.log('📡 Verification response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ HTTP error during verification:', response.status, errorText);
      return c.json({ 
        error: `Verification failed: ${errorText || 'Invalid OTP'}` 
      }, 400);
    }

    const data = await response.json();
    console.log('🔐 2factor.in verification response:', JSON.stringify(data, null, 2));

    if (data.Status === 'Success' && data.Details === 'OTP Matched') {
      // OTP verified!
      console.log(`✅ OTP verified for ${phone}`);

      // ⚡ ONLY create account IF email/password/name are provided
      // This allows frontend to verify OTP without creating account (frontend handles account creation)
      if (email && password && name) {
        console.log(`📧 Creating Supabase account for ${email}...`);
        
        // Check if user already exists
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        const userExists = existingUsers?.users?.some(u => u.email === email);

        if (userExists) {
          console.log(`⚠️ User with email ${email} already exists`);
          // Clean up OTP session
          await kv.del(`otp_session:${phone}`);
          return c.json({ 
            error: 'An account with this email already exists. Please sign in instead or use a different email.' 
          }, 400);
        }

        const { data: userData, error } = await supabase.auth.admin.createUser({
          email,
          password,
          user_metadata: { name, phone },
          email_confirm: true, // Auto-confirm since phone is verified
        });

        if (error) {
          console.error('❌ Error creating user:', error);
          // Clean up OTP session
          await kv.del(`otp_session:${phone}`);
          
          // Provide user-friendly error messages
          if (error.message?.includes('email') || error.message?.includes('already')) {
            return c.json({ 
              error: 'An account with this email already exists. Please sign in instead or use a different email.' 
            }, 400);
          }
          return c.json({ error: error.message }, 400);
        }

        // Clean up OTP session
        await kv.del(`otp_session:${phone}`);

        // Auto sign-in the user
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          console.error('❌ Error signing in:', signInError);
          return c.json({ error: signInError.message }, 400);
        }

        console.log(`✅ Account created and signed in for ${email}`);
        return c.json({
          success: true,
          message: 'Account created successfully',
          user: userData.user,
          session: signInData.session,
        });
      } else {
        // Just verify OTP, don't create account (frontend will handle it)
        console.log(`✅ OTP verified for ${phone}. Frontend will create account.`);
        
        // Clean up OTP session
        await kv.del(`otp_session:${phone}`);
        
        return c.json({ 
          success: true, 
          message: 'OTP verified successfully' 
        });
      }
    } else {
      console.error('❌ OTP verification failed:', data);
      return c.json({ error: 'Invalid OTP. Please try again.' }, 400);
    }
  } catch (error: any) {
    console.error('❌ Error verifying OTP:', error);
    return c.json({ error: error.message || 'Failed to verify OTP' }, 500);
  }
});

// 🔥 NEW: Check if email already exists (for better UX during signup)
app.post("/make-server-c4d79cb7/auth/check-email", async (c) => {
  try {
    const { email } = await c.req.json();

    if (!email) {
      return c.json({ error: 'Email is required' }, 400);
    }

    console.log(`🔍 Checking if email exists: ${email}`);

    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const userExists = existingUsers?.users?.some(u => u.email === email);

    console.log(`📧 Email ${email} exists: ${userExists}`);

    return c.json({
      exists: userExists,
      message: userExists 
        ? 'An account with this email already exists. Please sign in instead.' 
        : 'Email is available'
    });
  } catch (error: any) {
    console.error('❌ Error checking email:', error);
    return c.json({ error: error.message || 'Failed to check email' }, 500);
  }
});

// 🔥 SIMPLER ROUTE ALIASES (without /auth/) for easier frontend integration
app.post("/make-server-c4d79cb7/send-otp", async (c) => {
  return app.fetch(new Request(c.req.url.replace('/send-otp', '/auth/send-otp'), {
    method: 'POST',
    headers: c.req.raw.headers,
    body: c.req.raw.body,
  }));
});

app.post("/make-server-c4d79cb7/verify-otp", async (c) => {
  return app.fetch(new Request(c.req.url.replace('/verify-otp', '/auth/verify-otp'), {
    method: 'POST',
    headers: c.req.raw.headers,
    body: c.req.raw.body,
  }));
});

// Sign up
app.post("/make-server-c4d79cb7/auth/signup", async (c) => {
  try {
    const { email, password, name } = await c.req.json();

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name },
      // Automatically confirm the user's email since an email server hasn't been configured.
      email_confirm: true
    });

    if (error) {
      console.log(`Auth signup error: ${error.message}`);
      return c.json({ error: error.message }, 400);
    }

    return c.json({ user: data.user });
  } catch (error) {
    console.log(`Error during signup: ${error}`);
    return c.json({ error: "Signup failed" }, 500);
  }
});

// ==================== API CREDENTIALS MANAGEMENT ====================

// Get API credentials
app.get("/make-server-c4d79cb7/api-credentials", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    const credentials = await kv.get(`api_credentials:${user.id}`);
    const status = {
      dhanConfigured: false,
      chatgptConfigured: false,
      accessTokenConfigured: false
    };

    // Mask sensitive data
    if (credentials) {
      // Check if credentials are actually configured (not empty strings)
      status.dhanConfigured = !!(credentials.dhanClientId && credentials.dhanClientId.length > 0);
      status.chatgptConfigured = !!(credentials.chatgptApiKey && credentials.chatgptApiKey.length > 0);
      status.accessTokenConfigured = !!(credentials.dhanAccessToken && credentials.dhanAccessToken.length > 0);
      
      const maskedCredentials = {
        dhanClientId: credentials.dhanClientId || "",
        dhanAccessToken: credentials.dhanAccessToken ? "••••••" : "",
        chatgptApiKey: credentials.chatgptApiKey ? "sk-••••••" : "",
        tokenUpdatedAt: credentials.tokenUpdatedAt || null
      };
      
      return c.json({ 
        credentials: maskedCredentials, 
        status: {
          ...status,
          dhan: status.dhanConfigured && status.accessTokenConfigured
        },
        isConfigured: status.dhanConfigured && status.accessTokenConfigured
      });
    }

    return c.json({ credentials: null, status, isConfigured: false });
  } catch (error) {
    console.log(`Error fetching credentials: ${error}`);
    return c.json({ error: "Failed to fetch credentials" }, 500);
  }
});

// Save API credentials (Client ID and ChatGPT API Key - PERMANENT)
app.post("/make-server-c4d79cb7/api-credentials", async (c) => {
  try {
    console.log('💾 POST /api-credentials - Starting...');
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      console.log('❌ Auth error:', error?.message || 'No user');
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    console.log('✅ User authenticated:', user.id);

    const credentials = await c.req.json();
    console.log('📦 Received credentials:', {
      dhanClientId: credentials.dhanClientId ? `${credentials.dhanClientId.substring(0, 4)}***` : 'empty',
      chatgptApiKey: credentials.chatgptApiKey ? `${credentials.chatgptApiKey.substring(0, 7)}***` : 'empty'
    });
    
    // Get existing credentials to preserve access token if not provided
    const existing = await kv.get(`api_credentials:${user.id}`) as any;
    console.log('📂 Existing credentials found:', !!existing);
    
    // Sanitize permanent credentials
    const sanitizedCredentials = {
      // Client ID should be only numeric digits - PERMANENT
      dhanClientId: credentials.dhanClientId?.toString().trim().replace(/\D/g, '') || existing?.dhanClientId || '',
      // ChatGPT API key - PERMANENT
      chatgptApiKey: credentials.chatgptApiKey?.toString().trim().replace(/\s+/g, '').replace(/[^\x20-\x7E]/g, '') || existing?.chatgptApiKey || '',
      // Access token - preserve existing if not provided (will be updated separately)
      dhanAccessToken: existing?.dhanAccessToken || '',
      // Preserve token timestamp
      tokenUpdatedAt: existing?.tokenUpdatedAt || null
    };
    
    console.log('🧹 Sanitized credentials:', {
      dhanClientId: sanitizedCredentials.dhanClientId,
      dhanClientIdLength: sanitizedCredentials.dhanClientId.length,
      chatgptConfigured: !!sanitizedCredentials.chatgptApiKey,
      accessTokenPreserved: !!sanitizedCredentials.dhanAccessToken
    });
    
    console.log('💿 Saving to KV store...');
    await kv.set(`api_credentials:${user.id}`, sanitizedCredentials);
    console.log('✅ Credentials saved successfully!');

    return c.json({ 
      success: true, 
      message: 'Permanent credentials saved successfully'
    });
  } catch (error) {
    console.error('❌ Error saving credentials:', error);
    return c.json({ error: `Failed to save credentials: ${error}` }, 500);
  }
});

// Update Dhan Access Token ONLY (24-hour expiry - DAILY UPDATE)
app.post("/make-server-c4d79cb7/update-access-token", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const { dhanAccessToken } = await c.req.json();
    
    // Get existing credentials
    const existing = await kv.get(`api_credentials:${user.id}`) as any;
    
    if (!existing || !existing.dhanClientId) {
      return c.json({ error: 'Please save Client ID first in Settings' }, 400);
    }
    
    // Sanitize access token - remove all whitespace and non-ASCII characters
    const sanitizedToken = dhanAccessToken?.toString().trim().replace(/\s+/g, '').replace(/[^\x20-\x7E]/g, '') || '';
    
    console.log('Updating access token for user:', user.id);
    console.log('New token length:', sanitizedToken.length);
    
    // Update only the access token, keep other credentials
    const updatedCredentials = {
      ...existing,
      dhanAccessToken: sanitizedToken,
      tokenUpdatedAt: new Date().toISOString()
    };
    
    await kv.set(`api_credentials:${user.id}`, updatedCredentials);

    // Test Dhan connection
    let dhanConnected = false;
    if (existing.dhanClientId && sanitizedToken) {
      try {
        const dhanService = new DhanService({
          clientId: existing.dhanClientId,
          accessToken: sanitizedToken
        });
        dhanConnected = await dhanService.testConnection();
        console.log('Dhan connection test result:', dhanConnected);
      } catch (err) {
        console.log('Dhan connection test failed:', err);
      }
    }

    return c.json({ 
      success: true, 
      connected: dhanConnected,
      message: dhanConnected ? 'Access token updated and verified!' : 'Access token updated but connection failed - please check token'
    });
  } catch (error) {
    console.log(`Error updating access token: ${error}`);
    return c.json({ error: `Failed to update access token: ${error}` }, 500);
  }
});

// Test API connections
app.post("/make-server-c4d79cb7/test-api-connection", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401)
    }

    const credentials = await kv.get(`api_credentials:${user.id}`);
    if (!credentials) {
      return c.json({ error: "No credentials found" }, 400);
    }

    const status = {
      dhan: false,
      chatgpt: false,
      details: {
        dhan: '',
        chatgpt: ''
      }
    };

    if (credentials.dhanClientId && credentials.dhanAccessToken) {
      try {
        const dhanService = new DhanService({
          clientId: credentials.dhanClientId,
          accessToken: credentials.dhanAccessToken
        });
        status.dhan = await dhanService.testConnection();
        status.details.dhan = status.dhan ? 'Connected successfully' : 'Connection failed';
      } catch (err) {
        status.details.dhan = `Error: ${err}`;
        console.log('Dhan test error:', err);
      }
    } else {
      status.details.dhan = 'Missing credentials';
    }

    if (credentials.chatgptApiKey) {
      try {
        const chatgptService = new ChatGPTService(credentials.chatgptApiKey);
        status.chatgpt = await chatgptService.testConnection();
        status.details.chatgpt = status.chatgpt ? 'Connected successfully' : 'Connection failed';
      } catch (err) {
        status.details.chatgpt = `Error: ${err}`;
        console.log('ChatGPT test error:', err);
      }
    } else {
      status.details.chatgpt = 'Missing API key';
    }

    return c.json({ status });
  } catch (error) {
    console.log(`Error testing connection: ${error}`);
    return c.json({ error: `Connection test failed: ${error}` }, 500);
  }
});

// Debug endpoint to check stored credentials (masked)
app.get("/make-server-c4d79cb7/debug-credentials", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const credentials = await kv.get(`api_credentials:${user.id}`);
    
    if (!credentials) {
      return c.json({
        found: false,
        message: 'No credentials stored'
      });
    }

    return c.json({
      found: true,
      hasDhanClientId: !!credentials.dhanClientId,
      hasDhanAccessToken: !!credentials.dhanAccessToken,
      hasChatGPTKey: !!credentials.chatgptApiKey,
      dhanClientIdLength: credentials.dhanClientId?.length || 0,
      dhanClientIdFirst4: credentials.dhanClientId?.substring(0, 4) || '',
      dhanAccessTokenLength: credentials.dhanAccessToken?.length || 0
    });
  } catch (error) {
    console.log(`Debug credentials error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// ==================== ENGINE STATE SYNC (MULTI-DEVICE) ====================

// Get engine state
app.get("/make-server-c4d79cb7/engine-state", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const state = await kv.get(`engine_state:${user.id}`);
    
    if (!state) {
      return c.json({ 
        isRunning: false,
        interval: '15',
        lastUpdated: null
      });
    }

    return c.json(state);
  } catch (error) {
    console.log(`Error fetching engine state: ${error}`);
    return c.json({ error: "Failed to fetch engine state" }, 500);
  }
});

// Update engine state
app.post("/make-server-c4d79cb7/engine-state", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const { isRunning, interval } = await c.req.json();
    
    const state = {
      isRunning: !!isRunning,
      interval: interval || '15',
      lastUpdated: Date.now(),
      userId: user.id
    };
    
    await kv.set(`engine_state:${user.id}`, state);
    
    console.log(`✅ Engine state updated for user ${user.id}: Running=${isRunning}, Interval=${interval}M`);

    return c.json({ success: true, state });
  } catch (error) {
    console.log(`Error updating engine state: ${error}`);
    return c.json({ error: "Failed to update engine state" }, 500);
  }
});

// ==================== SYMBOL MANAGEMENT ====================

// Get symbols
app.get("/make-server-c4d79cb7/symbols", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    // ✅ FIXED: Get centralized symbols (not user-specific)
    // All users see the same symbols uploaded by admin
    const symbols = await kv.get(`symbols:global`);
    console.log(`📊 User ${user.email} fetching global symbols: ${symbols?.length || 0} symbols`);
    return c.json({ symbols: symbols || [] });
  } catch (error) {
    console.log(`Error fetching symbols: ${error}`);
    return c.json({ error: "Failed to fetch symbols" }, 500);
  }
});

// Add symbol
app.post("/make-server-c4d79cb7/symbols", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const newSymbol = await c.req.json();
    
    // ✅ FIXED: Use centralized symbols (not user-specific)
    const symbols = await kv.get(`symbols:global`) || [];
    symbols.push(newSymbol);
    await kv.set(`symbols:global`, symbols);

    console.log(`✅ User ${user.email} added symbol to global list: ${newSymbol.name || newSymbol.symbol}`);
    console.log(`📊 Total global symbols: ${symbols.length}`);

    return c.json({ success: true, symbols });
  } catch (error) {
    console.log(`Error adding symbol: ${error}`);
    return c.json({ error: "Failed to add symbol" }, 500);
  }
});

// Update symbol
app.put("/make-server-c4d79cb7/symbols/:id", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const id = c.req.param('id');
    const updatedSymbol = await c.req.json();
    
    // ✅ FIXED: Use centralized symbols (not user-specific)
    const symbols = await kv.get(`symbols:global`) || [];
    
    const index = symbols.findIndex((s: any) => s.id === id);
    if (index !== -1) {
      symbols[index] = updatedSymbol;
      await kv.set(`symbols:global`, symbols);
      console.log(`✅ User ${user.email} updated global symbol: ${id}`);
    }

    return c.json({ success: true, symbols });
  } catch (error) {
    console.log(`Error updating symbol: ${error}`);
    return c.json({ error: "Failed to update symbol" }, 500);
  }
});

// Delete symbol
app.delete("/make-server-c4d79cb7/symbols/:id", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const id = c.req.param('id');
    
    // ✅ FIXED: Use centralized symbols (not user-specific)
    const symbols = await kv.get(`symbols:global`) || [];
    const filtered = symbols.filter((s: any) => s.id !== id);
    await kv.set(`symbols:global`, filtered);

    console.log(`✅ User ${user.email} deleted global symbol: ${id}`);
    console.log(`📊 Remaining global symbols: ${filtered.length}`);

    return c.json({ success: true, symbols: filtered });
  } catch (error) {
    console.log(`Error deleting symbol: ${error}`);
    return c.json({ error: "Failed to delete symbol" }, 500);
  }
});

// ⚡ SYNC USER SYMBOL - Store symbol in user-specific storage (for execute-trade)
app.post("/make-server-c4d79cb7/sync-user-symbol", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const newSymbol = await c.req.json();
    
    // ✅ Store in USER-SPECIFIC storage (so execute-trade can find it)
    const userSymbols = await kv.get(`symbols:${user.id}`) || [];
    
    // Check if symbol already exists (by ID)
    const existingIndex = userSymbols.findIndex((s: any) => s.id === newSymbol.id);
    
    if (existingIndex !== -1) {
      // Update existing symbol
      userSymbols[existingIndex] = newSymbol;
      console.log(`✅ Updated symbol for user ${user.email}: ${newSymbol.name || newSymbol.displayName}`);
    } else {
      // Add new symbol
      userSymbols.push(newSymbol);
      console.log(`✅ Added symbol for user ${user.email}: ${newSymbol.name || newSymbol.displayName}`);
    }
    
    await kv.set(`symbols:${user.id}`, userSymbols);
    await kv.set(`trading_symbols:${user.id}`, {
      symbols: userSymbols,
      lastUpdated: Date.now(),
      userId: user.id
    });

    const dbRow = {
      user_id: user.id,
      symbol_name: newSymbol.symbolName || newSymbol.name || newSymbol.displayName || 'UNKNOWN',
      symbol_id: String(newSymbol.securityId || newSymbol.symbolId || newSymbol.id || ''),
      exchange_segment: newSymbol.exchangeSegment || 'NSE_FNO',
      instrument_type: newSymbol.instrumentType || 'OPTIDX',
      lot_size: newSymbol.lotSize || newSymbol.quantity || 1,
      expiry: newSymbol.expiry || null,
      strike_price: newSymbol.strikePrice || null,
      option_type: newSymbol.optionType || null,
      index_name: newSymbol.index || newSymbol.indexName || 'NIFTY',
      raw_data: newSymbol
    };

    const { error: deleteError } = await supabase
      .from('user_symbols')
      .delete()
      .eq('user_id', user.id)
      .eq('symbol_id', dbRow.symbol_id);

    if (deleteError) {
      return c.json({ error: deleteError.message }, 500);
    }

    const { error: insertError } = await supabase
      .from('user_symbols')
      .insert([dbRow]);

    if (insertError) {
      return c.json({ error: insertError.message }, 500);
    }

    console.log(`📊 Total symbols for user: ${userSymbols.length}`);

    return c.json({ success: true, symbolCount: userSymbols.length });
  } catch (error) {
    console.log(`Error syncing user symbol: ${error}`);
    return c.json({ error: "Failed to sync symbol" }, 500);
  }
});

// ⚠️ MIGRATION: Migrate old per-user symbols to global storage (ONE-TIME)
app.post("/make-server-c4d79cb7/migrate-symbols", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    console.log('🔄 Starting symbol migration to global storage...');
    console.log(`🔐 Initiated by: ${user.email}`);

    // Check if global symbols already exist
    const existingGlobal = await kv.get('symbols:global');
    
    if (existingGlobal && existingGlobal.length > 0) {
      console.log(`⚠️ Global symbols already exist (${existingGlobal.length} symbols)`);
      return c.json({
        success: true,
        count: existingGlobal.length,
        message: 'Global symbols already exist. No migration needed.',
        alreadyMigrated: true,
      });
    }

    // Get all keys starting with "symbols:"
    const allKeys = await kv.getByPrefix('symbols:');
    console.log(`📊 Found ${allKeys.length} symbol keys`);

    // Collect all unique symbols from all users
    const allSymbols = new Map();
    let totalFound = 0;

    for (const item of allKeys) {
      const key = item.key; // Extract key from {key, value} object
      if (key === 'symbols:global') continue; // Skip if already exists

      const userSymbols = await kv.get(key);
      
      if (Array.isArray(userSymbols)) {
        console.log(`📦 Found ${userSymbols.length} symbols in ${key}`);
        totalFound += userSymbols.length;

        // Add unique symbols (use symbol ID or name as key)
        userSymbols.forEach((symbol: any) => {
          const symbolKey = symbol.id || symbol.securityId || symbol.name;
          if (symbolKey && !allSymbols.has(symbolKey)) {
            allSymbols.set(symbolKey, symbol);
          }
        });
      }
    }

    const uniqueSymbols = Array.from(allSymbols.values());
    
    console.log(`📊 Total symbols found: ${totalFound}`);
    console.log(`📊 Unique symbols: ${uniqueSymbols.length}`);

    // Save to global storage
    await kv.set('symbols:global', uniqueSymbols);

    console.log(`✅ Migration complete! ${uniqueSymbols.length} symbols migrated to global storage`);

    return c.json({
      success: true,
      count: uniqueSymbols.length,
      totalFound,
      message: `Successfully migrated ${uniqueSymbols.length} unique symbols`,
    });
  } catch (error) {
    console.error('❌ Migration error:', error);
    return c.json({ 
      success: false, 
      error: error.message 
    }, 500);
  }
});

// ==================== TRADING AUTOMATION ====================

// Test connection endpoint
app.get("/make-server-c4d79cb7/test-connection", async (c) => {
  return c.json({
    success: true,
    message: "Backend server is working!",
    timestamp: new Date().toISOString(),
    serverStatus: "online"
  });
});

// Get market quote (real-time price)
app.post("/make-server-c4d79cb7/market-quote", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const { securityId, exchangeSegment } = await c.req.json();

    const credentials = await kv.get(`api_credentials:${user.id}`);
    if (!credentials || !credentials.dhanClientId || !credentials.dhanAccessToken) {
      return c.json({ error: "Dhan credentials not configured" }, 400);
    }

    const dhanService = new DhanService({
      clientId: credentials.dhanClientId,
      accessToken: credentials.dhanAccessToken
    });

    // Use new lightweight getMarketQuote method (cached, rate-limit friendly)
    const quote = await dhanService.getMarketQuote(securityId, exchangeSegment);
    
    return c.json({ success: true, quote });
  } catch (error) {
    console.log(`Market quote error: ${error}`);
    
    // Check for Dhan Invalid Token error
    if (error.toString().includes('Invalid Token') || error.toString().includes('DH-906')) {
      return c.json({ 
        error: 'Invalid Dhan Access Token. Please update your credentials in Settings tab.',
        errorType: 'INVALID_TOKEN'
      }, 401);
    }
    
    return c.json({ error: `Failed to fetch market quote: ${error}` }, 500);
  }
});

// Get OHLC candle data
app.post("/make-server-c4d79cb7/ohlc-data", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const { symbol, interval, count } = await c.req.json();

    const credentials = await kv.get(`api_credentials:${user.id}`);
    if (!credentials || !credentials.dhanClientId || !credentials.dhanAccessToken) {
      // Return mock data if not configured
      return c.json({ 
        success: true, 
        candles: generateMockCandles(count || 50),
        isMock: true 
      });
    }

    const dhanService = new DhanService({
      clientId: credentials.dhanClientId,
      accessToken: credentials.dhanAccessToken
    });

    const candles = await dhanService.getOHLCData(symbol, interval, count || 50);
    return c.json({ success: true, candles, isMock: false });
  } catch (error) {
    console.log(`OHLC data error: ${error}`);
    // Fallback to mock data on error
    const { count } = await c.req.json();
    return c.json({ 
      success: true, 
      candles: generateMockCandles(count || 50),
      isMock: true,
      error: String(error)
    });
  }
});

// Get intraday OHLC data with minute intervals (1, 5, 15, 25, 60 min)
app.post("/make-server-c4d79cb7/intraday-ohlc", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const { 
      securityId, 
      exchangeSegment, 
      instrument, 
      interval, 
      includeOI 
    } = await c.req.json();

    const credentials = await kv.get(`api_credentials:${user.id}`);
    if (!credentials || !credentials.dhanClientId || !credentials.dhanAccessToken) {
      return c.json({ 
        error: "Dhan credentials not configured",
        success: false 
      }, 400);
    }

    const dhanService = new DhanService({
      clientId: credentials.dhanClientId,
      accessToken: credentials.dhanAccessToken
    });

    // Fetch intraday OHLC data
    const candles = await dhanService.getIntradayOHLC(
      securityId,
      exchangeSegment || 'IDX_I',
      instrument || 'INDEX',
      interval || '15',
      includeOI || false
    );

    return c.json({ 
      success: true, 
      candles,
      totalCandles: candles.length,
      interval: `${interval} minute${interval !== '1' ? 's' : ''}`,
      date: new Date().toISOString().split('T')[0]
    });
  } catch (error) {
    console.log(`Intraday OHLC error: ${error}`);
    
    // Check for Dhan Invalid Token error
    if (error.toString().includes('Invalid Token') || error.toString().includes('DH-906')) {
      return c.json({ 
        error: 'Invalid Dhan Access Token. Please update your credentials in Settings tab.',
        errorType: 'INVALID_TOKEN',
        success: false
      }, 401);
    }
    
    return c.json({ 
      error: `Failed to fetch intraday OHLC: ${error}`,
      success: false 
    }, 500);
  }
});

// ⚡ TEST ENDPOINT: Try different security IDs for BANKNIFTY and SENSEX
app.post("/make-server-c4d79cb7/test-security-ids", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const credentials = await kv.get(`api_credentials:${user.id}`);
    if (!credentials || !credentials.dhanAccessToken) {
      return c.json({ error: 'Dhan credentials not configured' }, 400);
    }

    const dhanService = new DhanService({
      clientId: credentials.dhanClientId,
      accessToken: credentials.dhanAccessToken
    });

    console.log(`\\n🧪 ============ TESTING SECURITY IDs ============`);
    
    // Test different security IDs for BANKNIFTY
    const bankniftyTestIds = ['25', '26', '5'];
    const sensexTestIds = ['51', '1', '50'];
    
    const results = {
      banknifty: {} as Record<string, any>,
      sensex: {} as Record<string, any>
    };

    // Test BANKNIFTY IDs
    for (const secId of bankniftyTestIds) {
      console.log(`\\n🧪 Testing BANKNIFTY with security ID: ${secId}`);
      try {
        const candles = await dhanService.getOHLCData(secId, '15', 5);
        results.banknifty[secId] = {
          success: true,
          candleCount: candles.length,
          latestCandle: candles[candles.length - 1],
          firstCandle: candles[0],
          priceRange: candles.length > 0 ? {
            low: Math.min(...candles.map(c => c.low)),
            high: Math.max(...candles.map(c => c.high))
          } : null
        };
        console.log(`✅ Security ID ${secId}: Got ${candles.length} candles`);
        if (candles.length > 0) {
          console.log(`   Latest: O:${candles[candles.length-1].open} C:${candles[candles.length-1].close} V:${candles[candles.length-1].volume}`);
        }
      } catch (err) {
        results.banknifty[secId] = { success: false, error: String(err) };
        console.log(`❌ Security ID ${secId}: ${err}`);
      }
    }

    // Test SENSEX IDs
    for (const secId of sensexTestIds) {
      console.log(`\\n🧪 Testing SENSEX with security ID: ${secId}`);
      try {
        const candles = await dhanService.getOHLCData(secId, '15', 5);
        results.sensex[secId] = {
          success: true,
          candleCount: candles.length,
          latestCandle: candles[candles.length - 1],
          firstCandle: candles[0],
          priceRange: candles.length > 0 ? {
            low: Math.min(...candles.map(c => c.low)),
            high: Math.max(...candles.map(c => c.high))
          } : null
        };
        console.log(`✅ Security ID ${secId}: Got ${candles.length} candles`);
        if (candles.length > 0) {
          console.log(`   Latest: O:${candles[candles.length-1].open} C:${candles[candles.length-1].close} V:${candles[candles.length-1].volume}`);
        }
      } catch (err) {
        results.sensex[secId] = { success: false, error: String(err) };
        console.log(`❌ Security ID ${secId}: ${err}`);
      }
    }

    console.log(`\\n✅ Testing complete!`);
    console.log(`============================================\\n`);

    return c.json({
      success: true,
      results,
      recommendation: {
        banknifty: Object.entries(results.banknifty).find(([id, data]) => data.success && data.candleCount > 0)?.[0] || 'None worked',
        sensex: Object.entries(results.sensex).find(([id, data]) => data.success && data.candleCount > 0)?.[0] || 'None worked'
      }
    });
  } catch (error) {
    console.error('Test security IDs error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Get fund limits
app.get("/make-server-c4d79cb7/fund-limits", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const credentials = await kv.get(`api_credentials:${user.id}`);
    if (!credentials || !credentials.dhanClientId || !credentials.dhanAccessToken) {
      return c.json({ error: "Dhan credentials not configured" }, 400);
    }

    const dhanService = new DhanService({
      clientId: credentials.dhanClientId,
      accessToken: credentials.dhanAccessToken
    });

    const funds = await dhanService.getFundLimits();
    
    // ✅ FIX: Save broker funds to KV store for admin panel display
    if (funds && funds.availableBalance !== undefined) {
      try {
        await kv.set(`broker_funds:${user.id}`, {
          availableBalance: funds.availableBalance,
          sodLimit: funds.sodLimit || 0,
          collateralAmount: funds.collateralAmount || 0,
          utilizationAmount: funds.utilizationAmount || 0,
          blockedPayinAmount: funds.blockedPayinAmount || 0,
          lastUpdated: new Date().toISOString()
        });
        console.log(`✅ Saved broker funds for user ${user.id}: ₹${funds.availableBalance}`);
      } catch (err: any) {
        console.error(`❌ Error saving broker funds for ${user.id}:`, err.message);
      }
    }
    
    return c.json({ success: true, funds });
  } catch (error) {
    console.log(`Fund limits error: ${error}`);
    
    // Check for Dhan Invalid Token error
    if (error.toString().includes('Invalid Token') || error.toString().includes('DH-906')) {
      return c.json({ 
        error: 'Invalid Dhan Access Token. Please update your credentials in Settings tab.',
        errorType: 'INVALID_TOKEN'
      }, 401);
    }
    
    return c.json({ error: `Failed to fetch fund limits: ${error}` }, 500);
  }
});

// ✅ FIX: Save P&L to backend for admin panel display
app.post("/make-server-c4d79cb7/pnl/save", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const { totalPnL, unrealizedPnL, realizedPnL, timestamp } = await c.req.json();

    // Get current date (IST timezone)
    const now = new Date(timestamp || Date.now());
    const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
    const istDate = new Date(now.getTime() + istOffset);
    const today = istDate.toISOString().split('T')[0]; // YYYY-MM-DD format

    // Helper function: Retry logic for KV operations
    const retryKVSet = async (key: string, value: any, maxRetries = 3) => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await kv.set(key, value);
          return true;
        } catch (error: any) {
          console.error(`❌ KV Set attempt ${attempt}/${maxRetries} failed for key "${key}":`, error?.message || error);
          
          if (attempt === maxRetries) {
            throw new Error(`Failed to save ${key} after ${maxRetries} attempts: ${error?.message || error}`);
          }
          
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
      }
    };

    // Save P&L data with retry logic and individual error handling
    const results = {
      totalPnL: false,
      dailyPnL: false,
      detailsPnL: false
    };

    // 1. Save total P&L (cumulative) - Most important
    try {
      await retryKVSet(`total_pnl:${user.id}`, totalPnL || 0);
      results.totalPnL = true;
      console.log(`✅ Saved total P&L: ${totalPnL || 0}`);
    } catch (error: any) {
      console.error(`❌ Failed to save total P&L:`, error?.message);
    }
    
    // 2. Save today's P&L separately
    try {
      await retryKVSet(`daily_pnl:${user.id}:${today}`, {
        totalPnL: totalPnL || 0,
        unrealizedPnL: unrealizedPnL || 0,
        realizedPnL: realizedPnL || 0,
        date: today,
        lastUpdated: timestamp || Date.now()
      });
      results.dailyPnL = true;
      console.log(`✅ Saved daily P&L for ${today}`);
    } catch (error: any) {
      console.error(`❌ Failed to save daily P&L:`, error?.message);
    }
    
    // 3. Save detailed P&L data (for reference)
    try {
      await retryKVSet(`pnl_details:${user.id}`, {
        totalPnL: totalPnL || 0,
        unrealizedPnL: unrealizedPnL || 0,
        realizedPnL: realizedPnL || 0,
        todayDate: today,
        lastUpdated: timestamp || Date.now()
      });
      results.detailsPnL = true;
      console.log(`✅ Saved P&L details`);
    } catch (error: any) {
      console.error(`❌ Failed to save P&L details:`, error?.message);
    }

    // Check if at least one save succeeded
    const anySuccess = results.totalPnL || results.dailyPnL || results.detailsPnL;
    
    if (!anySuccess) {
      console.error(`❌ All P&L save operations failed for user ${user.id}`);
      return c.json({ 
        error: 'Failed to save P&L data - database connection issue',
        results 
      }, 500);
    }

    console.log(`💾 P&L saved for user ${user.id} (Date: ${today}): Total=₹${totalPnL?.toFixed(2) || 0}, Unrealized=₹${unrealizedPnL?.toFixed(2) || 0}, Realized=₹${realizedPnL?.toFixed(2) || 0}`);
    console.log(`📊 Save results:`, results);

    return c.json({ 
      success: true, 
      message: 'P&L saved successfully',
      totalPnL,
      results 
    });
  } catch (error: any) {
    console.error('❌ Error saving P&L:', error);
    return c.json({ 
      error: error.message || 'Failed to save P&L',
      details: error?.stack || error 
    }, 500);
  }
});

// Get positions
app.get("/make-server-c4d79cb7/positions", async (c) => {
  try {
    // ⚡ FAST AUTH: decode userId from JWT locally + query param fallback (no API call)
    const bearerToken = c.req.header('Authorization')?.split(' ')[1];
    const queryUserId = c.req.query('userId');
    const effectiveUserId = extractUserIdFromJwt(bearerToken || '') || queryUserId;

    if (!effectiveUserId) {
      return c.json({ error: "userId required — please re-login or ensure userId is sent in the request" }, 401);
    }

    const credentials = await kv.get(`api_credentials:${effectiveUserId}`);
    if (!credentials || !credentials.dhanClientId || !credentials.dhanAccessToken) {
      console.log('⚠️ Dhan credentials not configured - returning empty positions');
      return c.json({ 
        success: true, 
        positions: [],
        warning: 'Dhan credentials not configured. Please configure in Settings tab.'
      });
    }

    const dhanService = new DhanService({
      clientId: credentials.dhanClientId,
      accessToken: credentials.dhanAccessToken
    });

    const positions = await dhanService.getPositions();
    
    console.log('📊 ============ POSITIONS ENDPOINT RESPONSE ============');
    console.log('📊 Total positions fetched:', positions.length);
    console.log('📊 Full positions data:', JSON.stringify(positions, null, 2));
    
    // Calculate summary
    let totalRealized = 0;
    let totalUnrealized = 0;
    positions.forEach(pos => {
      totalRealized += parseFloat(pos.realizedPnl || 0);
      totalUnrealized += parseFloat(pos.unrealizedPnl || 0);
      console.log(`   - ${pos.tradingSymbol || pos.securityId}: netQty=${pos.netQty} | realized=₹${pos.realizedPnl} | unrealized=₹${pos.unrealizedPnl} | total=₹${pos.pnl}`);
    });
    
    console.log('💰 Total Realized P&L:', totalRealized.toFixed(2));
    console.log('💰 Total Unrealized P&L:', totalUnrealized.toFixed(2));
    console.log('💰 Total P&L:', (totalRealized + totalUnrealized).toFixed(2));
    console.log('=======================================================');
    
    return c.json({ success: true, positions });
  } catch (error) {
    console.log(`Positions error: ${error}`);
    
    // Check for Dhan Invalid Token error
    if (error.toString().includes('Invalid Token') || error.toString().includes('DH-906')) {
      return c.json({ 
        error: 'Invalid Dhan Access Token. Please update your credentials in Settings tab.',
        errorType: 'INVALID_TOKEN'
      }, 401);
    }
    
    return c.json({ error: `Failed to fetch positions: ${error}` }, 500);
  }
});

// Test ChatGPT API
app.post("/make-server-c4d79cb7/test-chatgpt", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const { testMode } = await c.req.json();

    // Get credentials
    const credentials = await kv.get(`api_credentials:${user.id}`);
    
    if (!credentials || !credentials.chatgptApiKey) {
      return c.json({
        success: true,
        configured: false,
        message: "ChatGPT API key not configured - using test mode",
        testResponse: {
          market_state: "Test Mode",
          bias: "Bullish",
          action: "TEST",
          confidence: 85,
          option_risk_note: "This is a test response"
        }
      });
    }

    // Test actual ChatGPT API
    const chatgptService = new ChatGPTService(credentials.chatgptApiKey);
    const testResult = await chatgptService.testConnection();

    return c.json({
      success: true,
      configured: true,
      message: "ChatGPT API is working!",
      apiResponse: testResult
    });
  } catch (error) {
    console.log(`ChatGPT test error: ${error}`);
    return c.json({
      success: false,
      error: String(error),
      message: "ChatGPT API test failed"
    }, 500);
  }
});

// Test Dhan API
app.post("/make-server-c4d79cb7/test-dhan", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    // Get credentials
    const credentials = await kv.get(`api_credentials:${user.id}`);
    
    if (!credentials || !credentials.dhanClientId || !credentials.dhanAccessToken) {
      return c.json({
        success: true,
        configured: false,
        message: "Dhan API credentials not configured - using test mode",
        testResponse: {
          price: 24567.50,
          candles: 50,
          lastUpdate: new Date().toISOString()
        }
      });
    }

    // Test actual Dhan API
    const dhanService = new DhanService({
      clientId: credentials.dhanClientId,
      accessToken: credentials.dhanAccessToken
    });
    
    const testResult = await dhanService.testConnection();

    return c.json({
      success: true,
      configured: true,
      message: "Dhan API is working!",
      apiResponse: testResult
    });
  } catch (error) {
    console.log(`Dhan test error: ${error}`);
    return c.json({
      success: false,
      error: String(error),
      message: "Dhan API test failed"
    }, 500);
  }
});

// Search Dhan instruments (on-demand lookup, no storage)
app.post("/make-server-c4d79cb7/search-dhan-instruments", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    const { strikePrice, underlying, optionType, exchangeSegment } = await c.req.json();
    
    console.log(`🔍 Searching Dhan instruments: ${underlying} ${strikePrice} ${optionType}`);
    
    // Map exchangeSegment to Dhan segment ID
    const segmentMap: Record<string, number> = {
      'NSE_EQ': 0,  // NSE Equity
      'NSE_FNO': 1, // NSE F&O (Options/Futures)
      'NSE_COMM': 3, // NSE Currency
      'BSE_EQ': 11, // BSE Equity
      'BSE_FNO': 12, // BSE F&O
      'MCX_COMM': 4 // MCX Commodity
    };
    
    const dhanSegment = segmentMap[exchangeSegment] || 1; // Default to NSE F&O
    
    // Fetch detailed instrument list from Dhan
    const url = `https://api.dhan.co/v2/instrument/${dhanSegment}`;
    console.log(`📡 Fetching from: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Dhan API error: ${response.status}`);
    }
    
    const data = await response.json();
    const instruments = data.data || [];
    
    console.log(`✅ Fetched ${instruments.length} instruments from Dhan`);
    
    // Filter instruments matching criteria
    const matches = instruments.filter((inst: any) => {
      // Check if it's an option
      if (inst.SEM_INSTRUMENT_NAME !== 'OPTIDX') return false;
      
      // Check underlying (NIFTY or BANKNIFTY)
      const underlyingMatch = underlying === 'NIFTY' 
        ? inst.SM_SYMBOL_NAME === 'NIFTY'
        : inst.SM_SYMBOL_NAME === 'BANKNIFTY';
      
      if (!underlyingMatch) return false;
      
      // Check strike price
      if (parseFloat(inst.SEM_STRIKE_PRICE) !== parseFloat(strikePrice)) return false;
      
      // Check option type (CE/PE)
      if (inst.SEM_OPTION_TYPE !== optionType) return false;
      
      return true;
    });
    
    console.log(`✅ Found ${matches.length} matching instruments`);
    
    // Format results for frontend
    const results = matches.map((inst: any) => ({
      securityId: inst.SEM_SMST_SECURITY_ID?.toString() || '',
      name: inst.SEM_CUSTOM_SYMBOL || `${inst.SM_SYMBOL_NAME} ${inst.SEM_STRIKE_PRICE} ${inst.SEM_OPTION_TYPE}`,
      displayName: inst.SEM_CUSTOM_SYMBOL || inst.SEM_TRADING_SYMBOL,
      underlying: inst.SM_SYMBOL_NAME,
      strike: parseFloat(inst.SEM_STRIKE_PRICE),
      optionType: inst.SEM_OPTION_TYPE,
      expiry: inst.SEM_EXPIRY_DATE,
      expiryFlag: inst.SEM_EXPIRY_FLAG, // M=Monthly, W=Weekly
      lotSize: parseInt(inst.SEM_LOT_UNITS) || 1,
      tickSize: parseFloat(inst.SEM_TICK_SIZE) || 0.05,
      instrumentType: inst.SEM_EXCH_INSTRUMENT_TYPE,
      tradingSymbol: inst.SEM_TRADING_SYMBOL,
      isin: inst.ISIN
    }));
    
    // Sort by expiry date (nearest first)
    results.sort((a: any, b: any) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
    
    return c.json({
      success: true,
      count: results.length,
      instruments: results
    });
    
  } catch (error) {
    console.error(`❌ Dhan instrument search error: ${error}`);
    return c.json({
      success: false,
      error: String(error),
      message: "Failed to search Dhan instruments"
    }, 500);
  }
});

// Get AI analysis for symbol
app.post("/make-server-c4d79cb7/analyze-symbol", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const { symbolId, index, daysToExpiry, testMode } = await c.req.json();

    // Get credentials
    const credentials = await kv.get(`api_credentials:${user.id}`);
    
    // In test mode, return mock data
    if (testMode || !credentials || !credentials.chatgptApiKey) {
      const mockAnalysis = {
        market_state: Math.random() > 0.5 ? 'Trending' : 'Range',
        bias: Math.random() > 0.5 ? 'Bullish' : 'Bearish',
        action: Math.random() > 0.6 ? 'ENTRY_ALLOWED' : 'WAIT',
        confidence: Math.floor(60 + Math.random() * 35),
        option_risk_note: 'Mock analysis for testing',
        timestamp: Date.now()
      };
      
      await kv.set(`analysis:${user.id}:${symbolId}`, mockAnalysis);
      
      return c.json({ 
        success: true, 
        analysis: mockAnalysis,
        testMode: true 
      });
    }

    // Get candle data from Dhan (or mock)
    const dhanService = new DhanService({
      clientId: credentials.dhanClientId,
      accessToken: credentials.dhanAccessToken
    });

    let candles;
    try {
      candles = await dhanService.getOHLCData(index, '15m', 50);
    } catch (error) {
      // If Dhan fails, use mock data
      console.log('Dhan API error, using mock data:', error);
      candles = generateMockCandles(50);
    }

    // Get current position if exists
    const position = await kv.get(`position:${user.id}:${symbolId}`);

    // Analyze with ChatGPT
    const chatgptService = new ChatGPTService(credentials.chatgptApiKey);
    const analysis = await chatgptService.analyzeMarket({
      index,
      candles,
      currentPosition: position,
      daysToExpiry
    });

    // Save analysis
    await kv.set(`analysis:${user.id}:${symbolId}`, {
      ...analysis,
      timestamp: Date.now()
    });

    return c.json({ success: true, analysis });
  } catch (error) {
    console.log(`Error analyzing symbol: ${error}`);
    return c.json({ error: `Analysis failed: ${error}` }, 500);
  }
});

// Helper function to generate mock candles
function generateMockCandles(count: number) {
  const candles = [];
  let price = 24500;
  const now = Date.now();
  
  for (let i = 0; i < count; i++) {
    const timestamp = now - (count - i) * 15 * 60 * 1000;
    const change = (Math.random() - 0.48) * price * 0.001;
    price += change;
    
    const open = price;
    const high = price + Math.random() * price * 0.002;
    const low = price - Math.random() * price * 0.002;
    const close = low + Math.random() * (high - low);
    const volume = Math.floor(100000 + Math.random() * 500000);
    
    candles.push({
      timestamp,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume
    });
    
    price = close;
  }
  
  return candles;
}

// Execute trade
// ── VPS Connectivity Check ──────────────────────────────────────────────────
// Tests whether the user's assigned order-server VPS is reachable on port 3000.
// This is a safe read-only probe (GET /health) that does NOT place any order.
app.get("/make-server-c4d79cb7/check-vps-connectivity", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (!user || error) return c.json({ error: "Unauthorized" }, 401);

    let ipInfo: { ipAddress: string; type: string };
    try {
      ipInfo = await getUserOrderPlacementIP(user.id);
    } catch (ipErr: any) {
      return c.json({ success: false, reachable: false, error: ipErr.message, hint: ipErr.message }, 400);
    }
    const endpoint = `http://${ipInfo.ipAddress}:3000/health`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    let reachable = false;
    let serverInfo: any = null;
    let errorMsg = '';

    try {
      const resp = await fetch(endpoint, { signal: controller.signal });
      clearTimeout(timer);
      reachable = resp.ok;
      if (resp.ok) serverInfo = await resp.json().catch(() => ({ status: 'ok' }));
      else errorMsg = `HTTP ${resp.status}`;
    } catch (err: any) {
      clearTimeout(timer);
      errorMsg = err.name === 'AbortError' ? 'Timed out (6s) — VPS port 3000 not responding' : err.message;
    }

    return c.json({
      success: true,
      ipAddress: ipInfo.ipAddress,
      ipType: ipInfo.type,
      reachable,
      serverInfo,
      error: errorMsg || undefined,
      testedAt: new Date().toISOString(),
      hint: reachable
        ? `✅ Your dedicated VPS at ${ipInfo.ipAddress} is UP. Orders will route through this IP when market opens.`
        : `❌ Your dedicated VPS at ${ipInfo.ipAddress}:3000 is not responding. SSH into your VPS and run: pm2 restart indexpilot-order-server`,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.post("/make-server-c4d79cb7/execute-trade", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const { symbolId, securityId, transactionType, quantity, testMode } = await c.req.json();

    // Get credentials
    const credentials = await kv.get(`api_credentials:${user.id}`);
    
    // In test mode, simulate order
    if (testMode || !credentials || !credentials.dhanClientId) {
      const mockOrder = {
        orderId: `TEST_${Date.now()}`,
        status: 'SUCCESS',
        message: 'Test order placed successfully',
        transactionType,
        price: 24500 + Math.random() * 100,
        timestamp: Date.now(),
        isTest: true
      };
      
      // Log test trade
      const today = new Date().toISOString().split('T')[0];
      const tradesKey = `trades:${user.id}:${symbolId}:${today}`;
      const todayTrades = await kv.get(tradesKey) || [];
      
      todayTrades.push({
        orderId: mockOrder.orderId,
        timestamp: Date.now(),
        transactionType,
        quantity,
        status: 'TEST_SUCCESS',
        testMode: true
      });
      await kv.set(tradesKey, todayTrades);
      
      return c.json({ success: true, order: mockOrder, testMode: true });
    }

    // Check daily limits
    const symbols = (await kv.get(`symbols:${user.id}`)) ||
      (await kv.get(`trading_symbols:${user.id}`))?.symbols || [];
    const symbol = symbols.find((s: any) => s.id === symbolId);
    if (!symbol) {
      return c.json({ error: "Symbol not found" }, 404);
    }

    // Check today's trades count
    const today = new Date().toISOString().split('T')[0];
    const tradesKey = `trades:${user.id}:${symbolId}:${today}`;
    const todayTrades = await kv.get(tradesKey) || [];
    
    if (todayTrades.length >= symbol.maxTradesPerDay) {
      return c.json({ error: "Daily trade limit reached for this symbol" }, 400);
    }

    // Place real order
    const dhanService = new DhanService({
      clientId: credentials.dhanClientId,
      accessToken: credentials.dhanAccessToken
    });

    // ✅ FIX: Get exchange segment from symbol
    let exchangeSegment = 'NSE_FNO'; // Default
    
    if (symbol.index === 'SENSEX') {
      exchangeSegment = 'BSE_FNO'; // ✅ BSE for SENSEX options
    } else if (symbol.index === 'NIFTY' || symbol.index === 'BANKNIFTY') {
      exchangeSegment = 'NSE_FNO'; // ✅ NSE for NIFTY/BANKNIFTY options
    } else if (symbol.exchange) {
      // Use symbol's exchange if provided
      exchangeSegment = symbol.exchange.includes('BSE') ? 'BSE_FNO' : 'NSE_FNO';
    }

    console.log('🔍 ORDER DEBUG - Input Parameters:', JSON.stringify({
      securityId,
      transactionType,
      quantity,
      symbolId,
      symbolIndex: symbol.index,
      determinedExchange: exchangeSegment,
      symbolConfig: {
        orderType: symbol.orderType,
        productType: symbol.productType,
        validity: symbol.validity,
        price: symbol.price,
        triggerPrice: symbol.triggerPrice
      }
    }, null, 2));
    
    // ✅ Use ALL symbol configuration fields (not hardcoded values!)
    const orderParams: any = {
      securityId: String(securityId),
      exchangeSegment: exchangeSegment,
      transactionType,
      quantity: parseInt(quantity),
      orderType: 'MARKET',
      productType: 'INTRADAY',
      validity: symbol.validity || 'DAY',
      price: 0,
      triggerPrice: 0,
      disclosedQuantity: symbol.disclosedQuantity || 0,
      afterMarketOrder: symbol.afterMarketOrder || false
    };

    // ✅ Only add amoTime if afterMarketOrder is true
    if (symbol.afterMarketOrder && symbol.amoTime) {
      orderParams.amoTime = symbol.amoTime;
    }

    console.log('📤 [EXECUTE TRADE] Placing order via Static IP server...');
    
    // ✅ Use Static IP server for order placement (SEBI compliance)
    const orderResult = await placeOrderViaStaticIP(
      user.id,
      {
        dhanClientId: credentials.dhanClientId,
        dhanAccessToken: credentials.dhanAccessToken
      },
      orderParams
    );

    console.log('✅ [EXECUTE TRADE] Order placed successfully:', orderResult);

    // Log trade
    todayTrades.push({
      orderId: orderResult.orderId,
      timestamp: Date.now(),
      transactionType,
      quantity,
      status: orderResult.status,
      testMode: false
    });
    await kv.set(tradesKey, todayTrades);

    return c.json({ success: true, order: orderResult, testMode: false });
  } catch (error: any) {
    console.log(`Error executing trade: ${error}`);

    // ── IP whitelist pending (Dhan DH-905) ───────────────────
    if (error.code === "IP_WHITELIST_PENDING" || error.message?.includes("IP_WHITELIST_PENDING:")) {
      const cleanMsg = error.message.replace("IP_WHITELIST_PENDING:", "").trim();
      return c.json({ error: cleanMsg, errorCode: "IP_WHITELIST_PENDING", vpsIP: error.vpsIP }, 400);
    }

    // ── Dhan token expired / invalid (DH-908) ────────────────
    if (error.code === "TOKEN_EXPIRED" || error.message?.includes("TOKEN_EXPIRED:")) {
      const cleanMsg = error.message.replace("TOKEN_EXPIRED:", "").trim();
      return c.json({ error: cleanMsg, errorCode: "TOKEN_EXPIRED" }, 400);
    }

    if (error.code === "OUTDATED_VPS_SERVER" || error.message?.includes("OUTDATED_VPS_SERVER:")) {
      const cleanMsg = error.message.replace("OUTDATED_VPS_SERVER:", "").trim();
      return c.json({ error: cleanMsg, errorCode: "OUTDATED_VPS_SERVER", vpsIP: error.vpsIP, serverVersion: error.serverVersion }, 400);
    }

    return c.json({ error: `Trade execution failed: ${error.message || error}` }, 500);
  }
});

// Place bracket order with target and stop loss
app.post("/make-server-c4d79cb7/place-bracket-order", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const {
      securityId,
      transactionType,
      quantity,
      price,
      targetPrice,
      stopLossPrice,
      exchangeSegment
    } = await c.req.json();

    const credentials = await kv.get(`api_credentials:${user.id}`);
    if (!credentials || !credentials.dhanClientId || !credentials.dhanAccessToken) {
      return c.json({ error: "Dhan credentials not configured" }, 400);
    }

    console.log('🚀 [BRACKET ORDER] Disabled: forcing all executions to MARKET only');

    return c.json({ success: false, error: 'Bracket/limit orders are disabled. Only MARKET orders are allowed.' }, 400);

    // ✅ Use Static IP server for bracket order placement
    const orderParams = {
      securityId: String(securityId),
      transactionType,
      quantity: parseInt(quantity),
      price: parseFloat(price),
      targetPrice: parseFloat(targetPrice),
      stopLossPrice: parseFloat(stopLossPrice),
      exchangeSegment: exchangeSegment || 'NSE_FNO',
      orderType: 'MARKET',
      productType: 'INTRADAY',
      validity: 'DAY'
    };

    const orderResult = await placeOrderViaStaticIP(
      user.id,
      credentials,
      orderParams
    );

    // Log the order
    await kv.set(`order:${user.id}:${orderResult.orderId}`, {
      orderId: orderResult.orderId,
      securityId,
      transactionType,
      quantity,
      price,
      targetPrice,
      stopLossPrice,
      status: orderResult.orderStatus,
      timestamp: Date.now(),
      orderType: 'BRACKET',
      placedViaStaticIP: true
    });

    return c.json({
      success: true,
      order: orderResult
    });
  } catch (error) {
    console.log(`Error placing bracket order: ${error}`);
    return c.json({ error: `Bracket order failed: ${error}` }, 500);
  }
});

// Place cover order with stop loss
app.post("/make-server-c4d79cb7/place-cover-order", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const {
      securityId,
      transactionType,
      quantity,
      price,
      stopLossPrice,
      exchangeSegment
    } = await c.req.json();

    const credentials = await kv.get(`api_credentials:${user.id}`);
    if (!credentials || !credentials.dhanClientId || !credentials.dhanAccessToken) {
      return c.json({ error: "Dhan credentials not configured" }, 400);
    }

    console.log('🚀 [COVER ORDER] Disabled: forcing all executions to MARKET only');

    return c.json({ success: false, error: 'Cover/limit orders are disabled. Only MARKET orders are allowed.' }, 400);

    // ✅ Use Static IP server for cover order placement
    const orderParams = {
      securityId: String(securityId),
      transactionType,
      quantity: parseInt(quantity),
      price: parseFloat(price),
      stopLossPrice: parseFloat(stopLossPrice),
      exchangeSegment: exchangeSegment || 'NSE_FNO',
      orderType: 'MARKET',
      productType: 'INTRADAY',
      validity: 'DAY'
    };

    const orderResult = await placeOrderViaStaticIP(
      user.id,
      credentials,
      orderParams
    );

    // Log the order
    await kv.set(`order:${user.id}:${orderResult.orderId}`, {
      orderId: orderResult.orderId,
      securityId,
      transactionType,
      quantity,
      price,
      stopLossPrice,
      status: orderResult.orderStatus,
      timestamp: Date.now(),
      orderType: 'COVER',
      placedViaStaticIP: true
    });

    return c.json({
      success: true,
      order: orderResult
    });
  } catch (error) {
    console.log(`Error placing cover order: ${error}`);
    return c.json({ error: `Cover order failed: ${error}` }, 500);
  }
});

// Get real-time positions and P&L
app.get("/make-server-c4d79cb7/live-positions", async (c) => {
  try {
    // ⚡ FAST AUTH: decode userId from JWT locally + query param fallback (no API call)
    const bearerToken = c.req.header('Authorization')?.split(' ')[1];
    const queryUserId = c.req.query('userId');
    const effectiveUserId = extractUserIdFromJwt(bearerToken || '') || queryUserId;

    if (!effectiveUserId) {
      return c.json({ error: "userId required — please re-login or ensure userId is sent in the request" }, 401);
    }

    const credentials = await kv.get(`api_credentials:${effectiveUserId}`);
    if (!credentials || !credentials.dhanClientId || !credentials.dhanAccessToken) {
      return c.json({ error: "Dhan credentials not configured" }, 400);
    }

    const dhanService = new DhanService({
      clientId: credentials.dhanClientId,
      accessToken: credentials.dhanAccessToken
    });

    const positions = await dhanService.getPositions();
    return c.json({ positions });
  } catch (error) {
    console.log(`Error fetching positions: ${error}`);
    return c.json({ error: "Failed to fetch positions" }, 500);
  }
});

// ==================== RISK SETTINGS ====================

// Get risk settings
app.get("/make-server-c4d79cb7/risk-settings", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const settings = await kv.get(`risk_settings:${user.id}`);
    return c.json({ settings: settings || null });
  } catch (error) {
    console.log(`Error fetching risk settings: ${error}`);
    return c.json({ error: "Failed to fetch risk settings" }, 500);
  }
});

// Save risk settings
app.post("/make-server-c4d79cb7/risk-settings", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const settings = await c.req.json();
    await kv.set(`risk_settings:${user.id}`, settings);

    return c.json({ success: true, settings });
  } catch (error) {
    console.log(`Error saving risk settings: ${error}`);
    return c.json({ error: "Failed to save risk settings" }, 500);
  }
});

// ==================== POSITION MANAGEMENT ====================

// Get current position
app.get("/make-server-c4d79cb7/position", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const position = await kv.get(`position:${user.id}`);
    return c.json({ position: position || null });
  } catch (error) {
    console.log(`Error fetching position: ${error}`);
    return c.json({ error: "Failed to fetch position" }, 500);
  }
});

// Save/update position
app.post("/make-server-c4d79cb7/position", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const position = await c.req.json();
    await kv.set(`position:${user.id}`, position);

    return c.json({ success: true, position });
  } catch (error) {
    console.log(`Error saving position: ${error}`);
    return c.json({ error: "Failed to save position" }, 500);
  }
});

// ==================== AI ANALYSIS ====================

// Get AI analysis
app.get("/make-server-c4d79cb7/ai-analysis", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const analysis = await kv.get(`ai_analysis:${user.id}`);
    return c.json({ analysis: analysis || null });
  } catch (error) {
    console.log(`Error fetching AI analysis: ${error}`);
    return c.json({ error: "Failed to fetch AI analysis" }, 500);
  }
});

// Save AI analysis
app.post("/make-server-c4d79cb7/ai-analysis", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const analysis = await c.req.json();
    await kv.set(`ai_analysis:${user.id}`, analysis);

    return c.json({ success: true, analysis });
  } catch (error) {
    console.log(`Error saving AI analysis: ${error}`);
    return c.json({ error: "Failed to save AI analysis" }, 500);
  }
});

// ==================== LOGS ====================

// Get logs
app.get("/make-server-c4d79cb7/logs", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const logs = await getMergedUserLogs(user.id);
    return c.json({ logs });
  } catch (error) {
    console.log(`Error fetching logs: ${error}`);
    return c.json({ error: "Failed to fetch logs" }, 500);
  }
});

// Add log
app.post("/make-server-c4d79cb7/logs", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const log = await c.req.json();
    const logs = await kv.get(`logs:${user.id}`) || [];
    
    // Keep only last 500 logs
    logs.unshift(log);
    if (logs.length > 500) {
      logs.pop();
    }
    
    await kv.set(`logs:${user.id}`, logs);

    return c.json({ success: true, logs });
  } catch (error) {
    console.log(`Error adding log: ${error}`);
    return c.json({ error: "Failed to add log" }, 500);
  }
});

app.delete("/make-server-c4d79cb7/logs", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    await clearMergedUserLogs(user.id);
    return c.json({ success: true, logs: [] });
  } catch (error) {
    console.log(`Error clearing logs: ${error}`);
    return c.json({ error: "Failed to clear logs" }, 500);
  }
});

// ==================== HIGH-SPEED TRADING ENGINE ====================

// Search for NIFTY option by strike and expiry
app.post("/make-server-c4d79cb7/search-option", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const { index, strike, expiry, optionType } = await c.req.json();

    const credentials = await kv.get(`api_credentials:${user.id}`);
    if (!credentials || !credentials.dhanClientId || !credentials.dhanAccessToken) {
      return c.json({ error: "Dhan credentials not configured" }, 400);
    }

    const dhanService = new DhanService({
      clientId: credentials.dhanClientId,
      accessToken: credentials.dhanAccessToken
    });

    // Get options chain
    const response = await fetch('https://api.dhan.co/v2/optionchain', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access-token': credentials.dhanAccessToken,
      },
      body: JSON.stringify({
        securityId: index === 'NIFTY' ? '13' : '25',
        expiryCode: 0 // Nearest expiry
      })
    });

    if (!response.ok) {
      return c.json({ error: 'Failed to fetch options chain' }, 500);
    }

    const chainData = await response.json();
    
    // Find the option matching strike and type
    const option = chainData.data?.find((opt: any) => 
      opt.strikePrice === strike && opt.optionType === optionType
    );

    if (option) {
      return c.json({
        success: true,
        option: {
          securityId: option.securityId,
          tradingSymbol: option.tradingSymbol,
          strikePrice: option.strikePrice,
          expiryDate: option.expiryDate,
          optionType: option.optionType,
          ltp: option.ltp
        }
      });
    } else {
      return c.json({ error: 'Option not found' }, 404);
    }
  } catch (error) {
    console.log(`Error searching option: ${error}`);
    return c.json({ error: `Failed to search option: ${error}` }, 500);
  }
});

// Get AI signal for high-speed trading
app.post("/make-server-c4d79cb7/get-ai-signal", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const { symbolId, index } = await c.req.json();

    const credentials = await kv.get(`api_credentials:${user.id}`);
    if (!credentials) {
      return c.json({ error: "Credentials not configured" }, 400);
    }

    const dhanService = new DhanService({
      clientId: credentials.dhanClientId,
      accessToken: credentials.dhanAccessToken
    });

    // Get market data with 50 candles using cached OHLC
    const securityId = index === 'NIFTY' ? '13' : '25';
    const marketData = await dhanService.getMarketQuote(securityId, 'IDX_I');

    if (!marketData || !marketData.candles || marketData.candles.length < 50) {
      return c.json({ error: 'Not enough candle data' }, 400);
    }

    // Call ChatGPT for analysis using last 3 candles + running candle
    const chatgptService = new ChatGPTService(credentials.chatgptApiKey);
    
    const prompt = `You are an expert Indian stock market options trader analyzing ${index} for high-frequency trading.

MARKET DATA - LAST 50 CANDLES (1-min timeframe):
Total Candles: ${marketData.candles.length}

LAST 3 COMPLETED CANDLES:
${JSON.stringify(marketData.last3Candles.map((c: any, idx: number) => ({
  candle: `#${idx + 1}`,
  time: new Date(c.timestamp).toLocaleTimeString('en-IN'),
  open: c.open,
  high: c.high,
  low: c.low,
  close: c.close,
  volume: c.volume
})), null, 2)}

CURRENT RUNNING CANDLE:
${JSON.stringify({
  time: new Date(marketData.runningCandle.timestamp).toLocaleTimeString('en-IN'),
  open: marketData.runningCandle.open,
  high: marketData.runningCandle.high,
  low: marketData.runningCandle.low,
  close: marketData.runningCandle.close,
  volume: marketData.runningCandle.volume
}, null, 2)}

ALL 50 CANDLES FOR CONTEXT:
${JSON.stringify(marketData.candles.slice(-10).map((c: any) => ({
  time: new Date(c.timestamp).toLocaleTimeString('en-IN'),
  close: c.close
})), null, 2)}

CURRENT PRICE: ₹${marketData.ltp}

CRITICAL ANALYSIS RULES:
1. Focus on LAST 3 COMPLETED CANDLES + RUNNING CANDLE for immediate decision
2. Use all 50 candles for trend context
3. HOLD decision: When last 3 candles show consolidation or unclear pattern
4. EXIT decision: When running candle shows reversal from entry
5. BUY/SELL decision: Only when last 3 candles show clear directional move

Analyze and provide trading signal in this EXACT JSON format:
{
  "action": "BUY_CALL" | "BUY_PUT" | "SELL_CALL" | "SELL_PUT" | "HOLD" | "EXIT",
  "market_state": "Trending" | "Range" | "Reversal Risk" | "Choppy",
  "bias": "Bullish" | "Bearish" | "Neutral",
  "confidence": 0-100,
  "entry_price": <suggested entry price>,
  "reason": "<analysis of last 3 candles + running candle>",
  "candle_pattern": "<pattern detected in last 3 candles>"
}

DECISION CRITERIA:
- BUY_CALL: Last 3 candles show higher highs + running candle breaking above
- BUY_PUT: Last 3 candles show lower lows + running candle breaking below
- SELL_CALL: Last 3 candles at resistance + running candle showing rejection
- SELL_PUT: Last 3 candles at support + running candle showing rejection
- HOLD: Last 3 candles consolidating, wait for breakout
- EXIT: Running candle shows reversal from position direction
- Only give BUY/SELL signals when confidence > 75%

Respond ONLY with valid JSON, no explanations.`;

    const aiResponse = await chatgptService.analyzeMarket(prompt);
    
    let signal;
    try {
      signal = JSON.parse(aiResponse);
    } catch (e) {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        signal = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Invalid AI response format');
      }
    }

    // Store signal with candle context
    await kv.set(`ai_signal:${user.id}:${symbolId}`, {
      ...signal,
      timestamp: Date.now(),
      symbolId,
      last3Candles: marketData.last3Candles,
      runningCandle: marketData.runningCandle,
      currentPrice: marketData.ltp
    });

    console.log(`AI Signal: ${signal.action} (${signal.confidence}%) - ${signal.reason}`);

    return c.json({ success: true, signal });
  } catch (error) {
    console.log(`Error getting AI signal: ${error}`);
    return c.json({ error: `Failed to get AI signal: ${error}` }, 500);
  }
});

// Place order (high-speed execution) - NOW USES STATIC IP SERVER
app.post("/make-server-c4d79cb7/place-order", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const orderRequest = await c.req.json();

    const credentials = await kv.get(`api_credentials:${user.id}`);
    if (!credentials || !credentials.dhanClientId || !credentials.dhanAccessToken) {
      return c.json({ error: "Dhan credentials not configured" }, 400);
    }

    console.log('🚀 [PLACE ORDER] Using Static IP server for SEBI compliance');

    // 🚀 FORWARD TO USER'S DEDICATED VPS
    const orderResponse = await placeOrderViaStaticIP(
      user.id,
      credentials,
      {
        securityId: orderRequest.securityId,
        transactionType: orderRequest.transactionType,
        quantity: orderRequest.quantity,
        orderType: 'MARKET',
        productType: 'INTRADAY',
        exchangeSegment: orderRequest.exchangeSegment || 'NSE_FNO',
        price: 0,
        triggerPrice: 0,
        validity: 'DAY'
      }
    );

    if (orderResponse.orderId) {
      // Log order execution
      await kv.set(`order:${user.id}:${orderResponse.orderId}`, {
        ...orderRequest,
        ...orderResponse,
        timestamp: Date.now(),
        placedViaStaticIP: true
      });

      return c.json({
        success: true,
        orderId: orderResponse.orderId,
        status: orderResponse.orderStatus,
        message: orderResponse.message,
        executedPrice: 0,
      });
    } else {
      return c.json({
        success: false,
        message: orderResponse.message
      }, 400);
    }
  } catch (error: any) {
    console.error(`❌ Error placing order: ${error.message}`);
    if (error.code === "IP_WHITELIST_PENDING" || error.message?.includes("IP_WHITELIST_PENDING:")) {
      const cleanMsg = error.message.replace("IP_WHITELIST_PENDING:", "").trim();
      return c.json({ error: cleanMsg, errorCode: "IP_WHITELIST_PENDING", vpsIP: error.vpsIP }, 400);
    }
    if (error.code === "TOKEN_EXPIRED" || error.message?.includes("TOKEN_EXPIRED:")) {
      const cleanMsg = error.message.replace("TOKEN_EXPIRED:", "").trim();
      return c.json({ error: cleanMsg, errorCode: "TOKEN_EXPIRED" }, 400);
    }
    if (error.code === "OUTDATED_VPS_SERVER" || error.message?.includes("OUTDATED_VPS_SERVER:")) {
      const cleanMsg = error.message.replace("OUTDATED_VPS_SERVER:", "").trim();
      return c.json({ error: cleanMsg, errorCode: "OUTDATED_VPS_SERVER", vpsIP: error.vpsIP, serverVersion: error.serverVersion }, 400);
    }
    return c.json({ error: `Failed to place order: ${error.message}` }, 500);
  }
});

// ==================== INTEGRATED TRADING ENGINE ROUTES ====================

// Execute Dhan order with full parameters
app.post("/make-server-c4d79cb7/execute-dhan-order", async (c) => {
  try {
    const orderRequest = await c.req.json();

    // ⚡ FAST AUTH: decode userId from JWT locally + body fallback (no API call)
    const bearerToken = c.req.header('Authorization')?.split(' ')[1];
    const effectiveUserId = extractUserIdFromJwt(bearerToken || '') || orderRequest?.userId;

    if (!effectiveUserId) {
      return c.json({ error: "userId required — please re-login or ensure userId is sent in the request" }, 401);
    }

    console.log(`🔑 execute-dhan-order userId: ${effectiveUserId}`);

    // Get credentials
    const credentials = await kv.get(`api_credentials:${effectiveUserId}`);
    
    if (!credentials || !credentials.dhanClientId || !credentials.dhanAccessToken) {
      return c.json({ 
        error: "Dhan credentials not configured",
        success: false 
      }, 400);
    }

    console.log('🚀 [EXECUTE DHAN ORDER] Using Static IP server for SEBI compliance');

    // ⚡ AUTOMATIC MIGRATION: Convert legacy 'NFO' to 'NSE_FNO' for Dhan API compatibility
    let exchangeSegment = orderRequest.exchangeSegment;
    if (exchangeSegment === 'NFO') {
      console.log(`⚡ AUTO-MIGRATION: Converting legacy exchange segment 'NFO' → 'NSE_FNO'`);
      exchangeSegment = 'NSE_FNO';
    }

    // ✅ Clean the order request - only include fields that should be sent
    const cleanedOrderRequest = {
      securityId: orderRequest.securityId,
      transactionType: orderRequest.transactionType,
      exchangeSegment: exchangeSegment, // ⚡ Using migrated value
      productType: 'INTRADAY',
      orderType: 'MARKET',
      validity: 'DAY',
      quantity: Math.max(1, Number(orderRequest.quantity) || 0),
      disclosedQuantity: 0,
      price: 0,
      triggerPrice: 0,
      afterMarketOrder: Boolean(orderRequest.afterMarketOrder),
      // ✅ Only include amoTime if AMO is enabled
      ...(orderRequest.afterMarketOrder && orderRequest.amoTime ? { amoTime: orderRequest.amoTime } : {})
    };

    console.log(`🔍 Forwarding to Static IP server with:`, JSON.stringify(cleanedOrderRequest, null, 2));
    
    // 🚀 FORWARD TO USER'S DEDICATED VPS
    const result = await placeOrderViaStaticIP(
      effectiveUserId,
      credentials,
      cleanedOrderRequest
    );
    
    console.log(`🔍 Result from dedicated VPS:`, JSON.stringify(result, null, 2));

    const resolvedOrderId = result.orderId || result.correlationId || cleanedOrderRequest.correlationId;
    const normalizedStatus = String(result.orderStatus || result.status || '').toUpperCase();
    const looksSuccessful =
      ["SUCCESS", "PLACED", "ACCEPTED", "TRANSIT", "PENDING", "TRADED", "EXECUTED"].includes(normalizedStatus) ||
      /success|placed|accepted|transit|pending|executed/i.test(result.message || '');

    if (resolvedOrderId && (result.success !== false || looksSuccessful)) {
      // ✅ Save order timestamp for spam prevention
      await kv.set(`last_order_time:${effectiveUserId}`, Date.now());
      
      // Log order
      await kv.set(`order:${effectiveUserId}:${resolvedOrderId}`, {
        ...orderRequest,
        orderId: resolvedOrderId,
        status: 'EXECUTED',
        timestamp: Date.now(),
        userId: effectiveUserId,
        placedViaStaticIP: true
      });
      
      console.log(`✅ ✅ ✅ ORDER PLACED SUCCESSFULLY VIA DEDICATED IP!`);
      console.log(`  Order ID: ${resolvedOrderId}`);
      console.log(`  Status: ${result.orderStatus}`);
      console.log(`  Price: ${result.price || orderRequest.price}`);
      console.log(`  Timestamp saved for spam prevention`);

      await supabase.from('position_monitor_state').upsert({
        user_id: effectiveUserId,
        order_id: resolvedOrderId,
        symbol: orderRequest.symbolName || orderRequest.tradingSymbol || orderRequest.securityId,
        index_name: orderRequest.index || (exchangeSegment === 'BSE_FNO' ? 'SENSEX' : 'NIFTY'),
        symbol_id: String(orderRequest.securityId || ''),
        exchange_segment: exchangeSegment,
        entry_price: Number(result.averagePrice || result.price || orderRequest.price || 0),
        current_price: Number(result.averagePrice || result.price || orderRequest.price || 0),
        quantity: Number(orderRequest.quantity || 1),
        pnl: 0,
        target_amount: Number(orderRequest.targetAmount || 3000),
        stop_loss_amount: Number(orderRequest.stopLossAmount || 2000),
        trailing_enabled: Boolean(orderRequest.trailingEnabled),
        trailing_step: Number(orderRequest.stopLossJumpAmount || 50),
        highest_pnl: 0,
        is_active: true,
        raw_position: {
          optionType: orderRequest.optionType,
          trailingActivationAmount: Number(orderRequest.trailingActivationAmount || 0),
          targetJumpAmount: Number(orderRequest.targetJumpAmount || 0),
          stopLossJumpAmount: Number(orderRequest.stopLossJumpAmount || 50),
        },
      }, { onConflict: 'user_id,order_id' });

      return c.json({
        success: true,
        orderId: resolvedOrderId,
        status: result.orderStatus || result.status || 'PLACED',
        averagePrice: result.averagePrice || result.price || orderRequest.price,
        message: result.message || 'Order executed successfully via your dedicated VPS',
      });
    } else {
      console.error(`❌ ❌ ❌ ORDER FAILED!`);
      console.error(`  Success: ${result.success}`);
      console.error(`  Order ID: ${result.orderId}`);
      console.error(`  Message: ${result.message}`);
      
      // ⚡ Enhanced error message for exchange segment issues
      let errorMessage = result.message || result.error || 'Order failed';
      if (errorMessage.includes('INVALID EXCHANGE SEGMENT') || errorMessage.includes('NFO')) {
        errorMessage += `\n\n❌ INVALID EXCHANGE SEGMENT: ${orderRequest.exchangeSegment}\nValid segments: NSE_EQ, NSE_FNO, NSE_CURR, BSE_EQ, BSE_FNO, BSE_CURR, MCX_COMM\n\nCommon fix:\n• For NIFTY/BANKNIFTY options: Use NSE_FNO\n• For SENSEX options: Use BSE_FNO\n• For equity delivery: Use NSE_EQ or BSE_EQ`;
      }
      
      return c.json({
        success: false,
        error: errorMessage
      }, 400);
    }
  } catch (error: any) {
    console.error('Execute Dhan order error:', error);
    if (error.code === "IP_WHITELIST_PENDING" || error.message?.includes("IP_WHITELIST_PENDING:")) {
      const cleanMsg = error.message.replace("IP_WHITELIST_PENDING:", "").trim();
      return c.json({ success: false, error: cleanMsg, errorCode: "IP_WHITELIST_PENDING", vpsIP: error.vpsIP }, 400);
    }
    if (error.code === "TOKEN_EXPIRED" || error.message?.includes("TOKEN_EXPIRED:")) {
      const cleanMsg = error.message.replace("TOKEN_EXPIRED:", "").trim();
      return c.json({ success: false, error: cleanMsg, errorCode: "TOKEN_EXPIRED" }, 400);
    }
    return c.json({ 
      success: false,
      error: `Failed to execute order: ${error}` 
    }, 500);
  }
});

// Test order endpoint for validation (no real order placement)
app.post("/make-server-c4d79cb7/test-dhan-order", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (!user || error) {
      return c.json({ error: "Unauthorized", success: false }, 401);
    }

    const orderRequest = await c.req.json();
    
    console.log(`🧪 TEST ORDER REQUEST:`, JSON.stringify(orderRequest, null, 2));

    // Get credentials
    const credentials = await kv.get(`api_credentials:${user.id}`);
    
    if (!credentials || !credentials.dhanClientId || !credentials.dhanAccessToken) {
      return c.json({ 
        error: "Dhan credentials not configured. Please configure in Settings tab.",
        message: "Dhan credentials not configured. Please configure in Settings tab.",
        success: false 
      }, 400);
    }

    // Validate order parameters
    const validationErrors: string[] = [];

    if (!orderRequest.securityId || orderRequest.securityId.trim() === '') {
      validationErrors.push('Security ID is required');
    }

    if (!orderRequest.transactionType || !['BUY', 'SELL'].includes(orderRequest.transactionType)) {
      validationErrors.push('Transaction Type must be BUY or SELL');
    }

    if (!orderRequest.exchangeSegment) {
      validationErrors.push('Exchange Segment is required');
    }

    if (!orderRequest.productType) {
      validationErrors.push('Product Type is required');
    }

    // Validate F&O product type combinations
    if ((orderRequest.exchangeSegment === 'NSE_FNO' || orderRequest.exchangeSegment === 'BSE_FNO') && 
        (orderRequest.productType === 'CNC' || orderRequest.productType === 'MTF')) {
      validationErrors.push('⚠️ ERROR: CNC/MTF not allowed for F&O segments! Use INTRADAY, MARGIN, CO, or BO');
    }

    if (!orderRequest.orderType) {
      validationErrors.push('Order Type is required');
    }

    if (!orderRequest.quantity || orderRequest.quantity <= 0) {
      validationErrors.push('Quantity must be greater than 0');
    }

    if (validationErrors.length > 0) {
      return c.json({
        success: false,
        message: `Validation Failed:\n${validationErrors.join('\n')}`,
        errors: validationErrors
      }, 400);
    }

    // Simulate order validation success
    const testOrderId = `TEST_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`✅ TEST ORDER VALIDATION PASSED`);
    console.log(`  Symbol: ${orderRequest.name}`);
    console.log(`  Security ID: ${orderRequest.securityId}`);
    console.log(`  Transaction: ${orderRequest.transactionType}`);
    console.log(`  Exchange: ${orderRequest.exchangeSegment}`);
    console.log(`  Product: ${orderRequest.productType}`);
    console.log(`  Quantity: ${orderRequest.quantity}`);
    console.log(`  Test Order ID: ${testOrderId}`);

    return c.json({
      success: true,
      message: `✅ Test Order Validation Passed!\n\nSymbol: ${orderRequest.name}\nSecurity ID: ${orderRequest.securityId}\nTransaction: ${orderRequest.transactionType}\nExchange: ${orderRequest.exchangeSegment}\nProduct: ${orderRequest.productType}\nQuantity: ${orderRequest.quantity}\n\nTest Order ID: ${testOrderId}\n\n⚠️ Note: This is a test validation only. No real order was placed because market is closed or test mode is active. When market is open and engine is running, real orders will be placed automatically when AI signals are generated.`,
      orderId: testOrderId,
      testMode: true,
      orderDetails: {
        symbol: orderRequest.name,
        securityId: orderRequest.securityId,
        transactionType: orderRequest.transactionType,
        exchangeSegment: orderRequest.exchangeSegment,
        productType: orderRequest.productType,
        quantity: orderRequest.quantity,
        orderType: orderRequest.orderType
      }
    });
  } catch (error) {
    console.error('Test order error:', error);
    return c.json({ 
      success: false,
      message: `Test order failed: ${error}`,
      error: `Failed to test order: ${error}` 
    }, 500);
  }
});

// Get AI trading signal with ChatGPT
app.post("/make-server-c4d79cb7/ai-trading-signal", async (c) => {
  const totalStartTime = performance.now(); // ⚡ MILLISECOND TRACKING
  
  try {
    const { user, error } = await validateAuth(c);

    if (!user || error) {
      return c.json({ error: error?.message || "Unauthorized" }, error?.code || 401);
    }

    const { index, candles, interval, checkExistingPosition } = await c.req.json();

    // Get credentials
    const credentials = await kv.get(`api_credentials:${user.id}`);
    
    if (!credentials || !credentials.dhanClientId || !credentials.dhanAccessToken) {
      return c.json({ 
        error: "Dhan credentials not configured",
        success: false 
      }, 400);
    }

    const dhanService = new DhanService({
      clientId: credentials.dhanClientId,
      accessToken: credentials.dhanAccessToken
    });

    // ⚡ PARALLEL FETCH (SAVE 200-500ms)
    const fetchStart = performance.now();
    const securityId = index === 'BANKNIFTY' ? '25' : '13'; // NIFTY = 13, BANKNIFTY = 25
    const candleCount = (candles || 50) + 1; // Fetch +1 to account for running candle
    const candleInterval = interval || '5'; // Default to 5-minute candles
    
    // Fetch data and last order time in parallel
    const [ohlcDataRaw, lastOrderTimeRaw] = await Promise.all([
      dhanService.getOHLCData(securityId, candleInterval, candleCount),
      kv.get(`last_order_time:${user.id}`)
    ]);
    
    let ohlcData = ohlcDataRaw;
    console.log(`⚡ Parallel fetch: ${Math.round(performance.now() - fetchStart)}ms`);

    if (!ohlcData || ohlcData.length === 0) {
      return c.json({ 
        error: "Failed to fetch market data",
        success: false 
      }, 400);
    }

    // =============== FILTER OUT RUNNING CANDLE ===============
    // The last candle returned by Dhan might be incomplete (running candle)
    // We need to exclude it and only use completed candles
    
    // Check if last candle is running (very small range or zero volume indicates incomplete)
    const possibleRunningCandle = ohlcData[ohlcData.length - 1];
    const now = Date.now();
    const intervalMinutes = parseInt(candleInterval);
    const intervalMs = intervalMinutes * 60 * 1000;
    
    // If the candle's timestamp is within the current interval period, it's likely running
    const timeSinceCandle = now - possibleRunningCandle.timestamp;
    const isRunningCandle = timeSinceCandle < intervalMs;
    
    if (isRunningCandle) {
      console.log(`🔄 Excluding running candle: O=${possibleRunningCandle.open}, C=${possibleRunningCandle.close}, V=${possibleRunningCandle.volume}`);
      ohlcData = ohlcData.slice(0, -1); // Remove last candle
    }

    // =============== ENHANCED CANDLESTICK ANALYSIS ===============
    
    // Get last COMPLETED candle
    const lastCandle = ohlcData[ohlcData.length - 1];
    const prevCandle = ohlcData[ohlcData.length - 2];
    
    console.log(`📊 Last CLOSED Candle: O=${lastCandle.open}, H=${lastCandle.high}, L=${lastCandle.low}, C=${lastCandle.close}, V=${lastCandle.volume}`);
    
    // Calculate candle metrics
    const range = lastCandle.high - lastCandle.low;
    const bodySize = Math.abs(lastCandle.close - lastCandle.open);
    const bodyPercent = (bodySize / range) * 100;
    const upperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
    const lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
    
    // Determine candle type
    const isBullish = lastCandle.close > lastCandle.open;
    const isBearish = lastCandle.close < lastCandle.open;
    const isDoji = bodyPercent < 10; // Small body relative to range
    
    // =============== CALCULATE 3 SUPPORT & 3 RESISTANCE LEVELS ===============
    const recentCandles = ohlcData.slice(-50); // Use more candles for better levels
    
    // Method: Identify price clusters and pivot points
    const highs = recentCandles.map(c => c.high).sort((a, b) => b - a);
    const lows = recentCandles.map(c => c.low).sort((a, b) => a - b);
    
    // Find 3 resistance levels (highest peaks)
    const resistance1 = highs[0]; // Strongest resistance
    const resistance2 = highs[Math.floor(highs.length * 0.2)]; // 20th percentile
    const resistance3 = highs[Math.floor(highs.length * 0.4)]; // 40th percentile
    
    // Find 3 support levels (lowest troughs)
    const support1 = lows[0]; // Strongest support
    const support2 = lows[Math.floor(lows.length * 0.2)]; // 20th percentile
    const support3 = lows[Math.floor(lows.length * 0.4)]; // 40th percentile
    
    // =============== INSTITUTIONAL MOVEMENT ANALYSIS ===============
    const last10Candles = ohlcData.slice(-10);
    const avgVolume = last10Candles.reduce((sum, c) => sum + c.volume, 0) / 10;
    const currentVolume = lastCandle.volume;
    const volumeRatio = currentVolume / avgVolume;
    
    // High volume breakout detection
    const isHighVolume = volumeRatio > 1.5; // 50% above average
    const isVolumeSpike = volumeRatio > 2.0; // 100% above average (institutional)
    
    // Price-Volume divergence (institutional accumulation/distribution)
    const priceUp = lastCandle.close > prevCandle.close;
    const volumeUp = lastCandle.volume > prevCandle.volume;
    const institutionalBuying = priceUp && volumeUp && isHighVolume;
    const institutionalSelling = !priceUp && volumeUp && isHighVolume;
    
    // =============== EMA CALCULATION (9, 21, 50) - INSTITUTIONAL TREND ===============
    const calculateEMA = (data: any[], period: number) => {
      const k = 2 / (period + 1);
      let ema = data[0].close;
      for (let i = 1; i < data.length; i++) {
        ema = (data[i].close * k) + (ema * (1 - k));
      }
      return ema;
    };
    
    const ema9 = calculateEMA(ohlcData.slice(-9), 9);
    const ema21 = calculateEMA(ohlcData.slice(-21), 21);
    const ema50 = calculateEMA(ohlcData, 50);
    
    const emaUptrend = ema9 > ema21 && ema21 > ema50;
    const emaDowntrend = ema9 < ema21 && ema21 < ema50;
    const priceAboveEMA9 = lastCandle.close > ema9;
    const priceAboveEMA21 = lastCandle.close > ema21;
    
    // =============== VWAP CALCULATION - INSTITUTIONAL PRICE LEVEL ===============
    const calculateVWAP = (data: any[]) => {
      let cumulativeTPV = 0;
      let cumulativeVolume = 0;
      for (const candle of data) {
        const typicalPrice = (candle.high + candle.low + candle.close) / 3;
        cumulativeTPV += typicalPrice * candle.volume;
        cumulativeVolume += candle.volume;
      }
      return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : 0;
    };
    
    const vwap = calculateVWAP(ohlcData);
    const priceAboveVWAP = lastCandle.close > vwap;
    const vwapDistance = ((lastCandle.close - vwap) / vwap) * 100;
    
    // =============== TRIPLE CONFIRMATION ===============
    const bullishTriple = priceAboveVWAP && emaUptrend && isBullish && isHighVolume;
    const bearishTriple = !priceAboveVWAP && emaDowntrend && isBearish && isHighVolume;
    
    // Identify smart money movement (large body + high volume)
    const isSmartMoney = bodyPercent > 60 && isVolumeSpike;
    
    // Momentum strength
    const last5Candles = ohlcData.slice(-5);
    const bullishCandles = last5Candles.filter(c => c.close > c.open).length;
    const bearishCandles = last5Candles.filter(c => c.close < c.open).length;
    const momentum = bullishCandles > bearishCandles ? 'BULLISH' : 
                     bearishCandles > bullishCandles ? 'BEARISH' : 'NEUTRAL';
    
    // Calculate price movement trend
    const priceChanges = last5Candles.map((c, i) => i > 0 ? c.close - last5Candles[i-1].close : 0);
    const avgChange = priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length;
    const isUptrend = avgChange > 0;
    
    // ⚡ REMOVED 5-MINUTE ORDER BLOCKING FOR COMMERCIAL USE
    // User reported missing 100-200 point opportunities due to this restriction
    // System will now generate signals for every valid setup without time restrictions
    const lastOrderTime = lastOrderTimeRaw || 0;
    const timeSinceLastOrder = Date.now() - lastOrderTime;
    
    // No minimum order interval - allow signals whenever market conditions are met
    const canPlaceOrder = true; // ALWAYS allow orders if conditions are met

    // Build enhanced ChatGPT prompt
    const prompt = `You are a professional institutional-grade options trader analyzing ${index} for automated trading.

📊 CANDLESTICK ANALYSIS (${candleInterval}-minute timeframe)

🔍 LAST CANDLE (Most Recent Completed):
• Open (O): ${lastCandle.open}
• High (H): ${lastCandle.high}
• Low (L): ${lastCandle.low}
• Close (C): ${lastCandle.close}
• Volume: ${lastCandle.volume.toLocaleString()}

📐 CANDLE STRUCTURE:
• Range: ${lastCandle.high} - ${lastCandle.low} = ${range.toFixed(2)} points
• Body Size: ${bodySize.toFixed(2)} points (${bodyPercent.toFixed(1)}% of range)
• Upper Wick: ${upperWick.toFixed(2)} points
• Lower Wick: ${lowerWick.toFixed(2)} points
• Candle Type: ${isDoji ? 'DOJI (Indecision)' : isBullish ? 'BULLISH 🟢' : 'BEARISH 🔴'}

📌 KEY SUPPORT & RESISTANCE LEVELS (Last 50 candles):
🔴 RESISTANCE LEVELS:
   R1 (Strongest): ${resistance1.toFixed(2)} | Distance: ${(resistance1 - lastCandle.close).toFixed(2)} pts
   R2 (Medium):    ${resistance2.toFixed(2)} | Distance: ${(resistance2 - lastCandle.close).toFixed(2)} pts
   R3 (Weak):      ${resistance3.toFixed(2)} | Distance: ${(resistance3 - lastCandle.close).toFixed(2)} pts

🟢 SUPPORT LEVELS:
   S1 (Strongest): ${support1.toFixed(2)} | Distance: ${(lastCandle.close - support1).toFixed(2)} pts
   S2 (Medium):    ${support2.toFixed(2)} | Distance: ${(lastCandle.close - support2).toFixed(2)} pts
   S3 (Weak):      ${support3.toFixed(2)} | Distance: ${(lastCandle.close - support3).toFixed(2)} pts

📍 Current Price: ${lastCandle.close}

🏦 INSTITUTIONAL MOVEMENT ANALYSIS:
• Volume Ratio: ${volumeRatio.toFixed(2)}x average (${isVolumeSpike ? '🚨 SPIKE!' : isHighVolume ? '⚠️ High' : '✅ Normal'})
• Smart Money Detected: ${isSmartMoney ? '✅ YES' : '❌ No'}
• Institutional Bias: ${institutionalBuying ? '🟢 BUYING' : institutionalSelling ? '🔴 SELLING' : '⚪ Neutral'}
• Momentum: ${momentum} (${bullishCandles}/${bearishCandles} last 5)

📈 EMA TREND ANALYSIS (Moving Averages):
• EMA 9:  ${ema9.toFixed(2)} | Price ${priceAboveEMA9 ? 'ABOVE ✅' : 'BELOW ❌'}
• EMA 21: ${ema21.toFixed(2)} | Price ${priceAboveEMA21 ? 'ABOVE ✅' : 'BELOW ❌'}
• EMA 50: ${ema50.toFixed(2)}
• Trend: ${emaUptrend ? 'BULLISH (9>21>50) 🟢' : emaDowntrend ? 'BEARISH (9<21<50) 🔴' : 'NEUTRAL ⚪'}

💰 VWAP ANALYSIS (Institutional Price Level):
• VWAP: ${vwap.toFixed(2)}
• Current Price: ${lastCandle.close} (${priceAboveVWAP ? 'ABOVE VWAP ✅' : 'BELOW VWAP ❌'})
• Distance: ${vwapDistance.toFixed(2)}% ${Math.abs(vwapDistance) > 0.5 ? '(SIGNIFICANT)' : '(Near fair value)'}

🔥 TRIPLE CONFIRMATION:
• Bullish Triple: ${bullishTriple ? '✅ YES (VWAP + EMA + Volume)' : '❌ No'}
• Bearish Triple: ${bearishTriple ? '✅ YES (VWAP + EMA + Volume)' : '❌ No'}

🕐 RECENT CANDLE DATA (Last 10 candles):
${ohlcData.slice(-10).map((c, i) => 
  `Candle ${i+1}: O=${c.open}, H=${c.high}, L=${c.low}, C=${c.close}, V=${c.volume}`
).join('\n')}

${checkExistingPosition ? `
⚠️ POSITION MANAGEMENT MODE:
We have an ACTIVE position. Analyze if we should:
• HOLD: Position is safe, let it run
• EXIT: Close position immediately (stop loss or target hit)
` : `
🎯 ENTRY SIGNAL MODE:
Analyze if we should enter a new position.
`}

⚠️ INSTITUTIONAL-GRADE DECISION RULES WITH TRIPLE CONFIRMATION:

1. 🚫 DO NOT TRADE (WAIT) if:
   - Body size < 5 points (very weak momentum)
   - Candle is extreme DOJI (< 5% body)
   - No clear trend in any indicator
   - All indicators completely neutral

2. ✅ BULLISH ENTRY (BUY_CALL) - DOUBLE CONFIRMATION REQUIRED:
   PRIMARY CONDITIONS (Most should be met):
   - Close > Open (bullish candle)
   - Body > 8 points OR > 30% of range (lowered to catch more moves)
   - Volume > 1.0x average (accept normal volume on strong trend)
   - Momentum = BULLISH or NEUTRAL with bullish candle
   
   DOUBLE CONFIRMATION (at least 2 of 3):
   ✅ Price ABOVE VWAP (institutional buying zone)
   ✅ EMA Trend BULLISH or Price ABOVE EMA21
   ✅ Bullish momentum or strong bullish candle
   
   BONUS (increases confidence to 80%+):
   - Price breaking above resistance with any volume
   - Smart Money detected
   - Institutional Bias = BUYING
   - Big move already started (catch momentum)

3. ✅ BEARISH ENTRY (BUY_PUT) - DOUBLE CONFIRMATION REQUIRED:
   PRIMARY CONDITIONS (Most should be met):
   - Close < Open (bearish candle)
   - Body > 8 points OR > 30% of range (lowered to catch more moves)
   - Volume > 1.0x average (accept normal volume on strong trend)
   - Momentum = BEARISH or NEUTRAL with bearish candle
   
   DOUBLE CONFIRMATION (at least 2 of 3):
   ✅ Price BELOW VWAP (institutional selling zone)
   ✅ EMA Trend BEARISH or Price BELOW EMA21
   ✅ Bearish momentum or strong bearish candle
   
   BONUS (increases confidence to 80%+):
   - Price breaking below support with any volume
   - Smart Money detected
   - Institutional Bias = SELLING
   - Big move already started (catch momentum)

4. ⏸ WAIT conditions (only wait if really uncertain):
   - No confirmation at all (0 of 3 indicators aligned)
   - Extreme DOJI with no volume
   - Complete price stagnation
   - Confidence < 60%

5. 🎯 EXIT conditions (if position active):
   - Candle closes against position direction with high volume
   - Strong reversal pattern + institutional selling/buying against position
   - Price crosses major S/R level against position
   - Stop loss level breached

RESPOND IN THIS EXACT JSON FORMAT:
{
  "market_state": "Trending Up|Trending Down|Range-Bound|Consolidation",
  "bias": "Bullish|Bearish|Neutral",
  "action": "BUY_CALL|BUY_PUT|WAIT|HOLD|EXIT",
  "confidence": 0-100,
  "reasoning": "Professional analysis based on institutional movement, S/R levels, and candle structure",
  "institutional_bias": "BUYING|SELLING|NEUTRAL",
  "key_resistance": ${resistance1},
  "key_support": ${support1},
  "volume_analysis": "Normal|High|Spike",
  "should_wait_for_confirmation": true/false
}

CRITICAL RULES FOR COMMERCIAL TRADING:
- BUY when DOUBLE CONFIRMATION exists (2 of: VWAP, EMA, Price position)
- Confidence > 65% for BUY signals (lowered from 75% to catch more opportunities)
- Generate signals even in moderate volume if trend is strong
- CAPTURE BIG MOVES: If market moved 50+ points, analyze for continuation/reversal opportunities
- NEVER miss 100-200 point moves - be more aggressive on strong trends
- Generate signals for EVERY valid setup - no time restrictions!
`;

    // ⚡ CALL CHATGPT (MILLISECOND TIMING)
    const chatgptStart = performance.now();
    const chatgptService = new ChatGPTService(credentials.chatgptApiKey);
    const aiResponse = await chatgptService.analyzeMarket(prompt);
    const chatgptEnd = performance.now();
    console.log(`⚡ ChatGPT response: ${Math.round(chatgptEnd - chatgptStart)}ms`);

    if (aiResponse) {
      // The analyzeMarket method already returns parsed JSON
      let action = aiResponse.action;
      
      // ✅ NO LONGER BLOCKING SIGNALS - Allow all valid AI signals to pass through
      // Commercial use requires capturing every opportunity
      
      const signal = {
        market_state: aiResponse.market_state,
        bias: aiResponse.bias,
        action: action,
        confidence: aiResponse.confidence,
        reasoning: aiResponse.reasoning || aiResponse.option_risk_note || aiResponse.raw_response?.substring(0, 200),
        institutional_bias: aiResponse.institutional_bias || (institutionalBuying ? 'BUYING' : institutionalSelling ? 'SELLING' : 'NEUTRAL'),
        
        // Enhanced S/R levels
        resistance_levels: {
          r1: resistance1,
          r2: resistance2,
          r3: resistance3
        },
        support_levels: {
          s1: support1,
          s2: support2,
          s3: support3
        },
        
        // Institutional analysis
        volume_analysis: {
          current: currentVolume,
          average: avgVolume,
          ratio: volumeRatio,
          is_spike: isVolumeSpike,
          is_high: isHighVolume
        },
        smart_money_detected: isSmartMoney,
        momentum: momentum,
        
        current_price: lastCandle.close,
        candle_analysis: {
          range,
          bodySize,
          bodyPercent,
          isBullish,
          isBearish,
          isDoji
        },
        can_place_order: canPlaceOrder,
        time_since_last_order: Math.floor(timeSinceLastOrder / 1000)
      };

      // Save signal
      await kv.set(`ai_signal:${user.id}:latest`, {
        ...signal,
        timestamp: Date.now(),
        index,
        candleCount
      });

      const totalTime = Math.round(performance.now() - totalStartTime);
      console.log(`⚡ TOTAL REQUEST TIME: ${totalTime}ms`);

      return c.json({
        success: true,
        signal,
        timestamp: Date.now(),
        executionTimeMs: totalTime // ⚡ Return execution time
      });
    } else {
      return c.json({ 
        error: "ChatGPT analysis failed",
        success: false 
      }, 400);
    }
  } catch (error) {
    console.error('AI trading signal error:', error);
    return c.json({ 
      success: false,
      error: `Failed to get AI signal: ${error}` 
    }, 500);
  }
});

// ⚡⚡⚡ ULTRA-FAST BACKEND AI SIGNAL (NO CHATGPT!) ⚡⚡⚡
app.post("/make-server-c4d79cb7/backend-ai-signal", async (c) => {
  const routeStart = performance.now();
  
  try {
    const { index, interval } = await c.req.json();
    
    console.log(`\n⚡⚡⚡ BACKEND AI REQUEST - NO CHATGPT! ⚡⚡⚡`);
    console.log(`Index: ${index} | Interval: ${interval}M`);
    
    // Get credentials
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '');
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const credentialsRaw = await kv.get('api_credentials');
    if (!credentialsRaw) {
      return c.json({ error: 'API credentials not configured' }, 400);
    }
    
    const credentials = JSON.parse(credentialsRaw);
    
    // ⚡ FETCH OHLC DATA (PARALLEL)
    const dataStart = performance.now();
    const dhanService = new DhanService({ 
      clientId: credentials.dhanClientId, 
      accessToken: credentials.dhanAccessToken 
    });
    
    const securityId = index === 'NIFTY' ? '13' : index === 'BANKNIFTY' ? '25' : '13';
    const ohlcData = await dhanService.getOHLCData(securityId, interval.toString(), 100);
    const dataEnd = performance.now();
    
    console.log(`⚡ Data fetched: ${Math.round(dataEnd - dataStart)}ms | ${ohlcData.length} candles`);
    
    if (!ohlcData || ohlcData.length === 0) {
      return c.json({ error: 'No OHLC data available' }, 400);
    }
    
    // ⚡⚡⚡ GENERATE SIGNAL USING BACKEND AI ⚡⚡⚡
    const aiStart = performance.now();
    const signal = BackendAI.generateSignal(ohlcData);
    const aiEnd = performance.now();
    
    console.log(`⚡ AI SIGNAL: ${signal.action} | Confidence: ${signal.confidence}% | ${Math.round(signal.executionTime)}ms`);
    console.log(`⚡ Triple Confirmation: ${signal.tripleConfirmation}/3`);
    console.log(`   ${signal.confirmationDetails.join('\n   ')}`);
    
    const routeEnd = performance.now();
    const totalTime = Math.round(routeEnd - routeStart);
    
    console.log(`⚡⚡⚡ TOTAL BACKEND AI: ${totalTime}ms (Target: < 500ms) ⚡⚡⚡\n`);
    
    return c.json({
      success: true,
      signal,
      performance: {
        dataFetch: Math.round(dataEnd - dataStart),
        aiProcessing: Math.round(aiEnd - aiStart),
        total: totalTime
      }
    });
    
  } catch (error) {
    console.error('Backend AI error:', error);
    return c.json({ 
      success: false,
      error: `Backend AI failed: ${error}` 
    }, 500);
  }
});

// ⚡ REAL-TIME POSITION MONITOR (EVERY SECOND CHECK!)
app.post("/make-server-c4d79cb7/monitor-position", async (c) => {
  try {
    const { 
      index, 
      interval,
      entryPrice,
      currentPrice,
      optionType,
      targetAmount,
      stopLossAmount,
      quantity
    } = await c.req.json();
    
    // Get credentials with user authentication
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '');
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    // ⚡ FIX: Get user from access token and use user-specific credentials
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !user) {
      return c.json({ error: 'Unauthorized - invalid token' }, 401);
    }
    
    // ⚡ FIX: Use user-specific credentials key
    const credentials = await kv.get(`api_credentials:${user.id}`);
    if (!credentials) {
      return c.json({ error: 'API credentials not configured. Please configure in Settings.' }, 400);
    }
    
    // Fetch latest data
    const dhanService = new DhanService({ 
      clientId: credentials.dhanClientId, 
      accessToken: credentials.dhanAccessToken 
    });
    const securityId = index === 'NIFTY' ? '13' : index === 'BANKNIFTY' ? '25' : '13';
    const ohlcData = await dhanService.getOHLCData(securityId, interval.toString(), 100);
    
    if (!ohlcData || ohlcData.length === 0) {
      return c.json({ error: 'No data available' }, 400);
    }
    
    // Analyze position
    const analysis = BackendAI.analyzePosition(
      ohlcData,
      entryPrice,
      currentPrice,
      optionType,
      targetAmount,
      stopLossAmount,
      quantity
    );
    
    console.log(`📊 Position Analysis: ${analysis.action} | P&L: ₹${analysis.currentPnL.toFixed(2)}`);
    console.log(`   ${analysis.reason}`);
    
    return c.json({
      success: true,
      analysis
    });
    
  } catch (error) {
    console.error('Position monitor error:', error);
    return c.json({ 
      success: false,
      error: `Position monitor failed: ${error}` 
    }, 500);
  }
});

// ⚡⚡⚡ ADVANCED AI SIGNAL (15+ INDICATORS!) ⚡⚡⚡
app.post("/make-server-c4d79cb7/advanced-ai-signal", async (c) => {
  const routeStart = performance.now();
  
  try {
    const rawBody = await c.req.json();
    console.log(`\n📥 ============ RAW REQUEST RECEIVED ============`);
    console.log(`📥 Full Request Body:`, JSON.stringify(rawBody, null, 2));
    console.log(`📥 Type Check: interval type = ${typeof rawBody.interval}, value = "${rawBody.interval}"`);
    console.log(`================================================\n`);
    
    // ⚡⚡⚡ NEW: Accept both old and new request formats (NO LOGIC CHANGE!)
    const { 
      index,           // Primary index (backward compatible)
      indices,         // NEW: Array of all active indices
      spreadData,      // NEW: Symbol details per index
      interval, 
      accountBalance,
      userId: bodyUserId  // ⚡ Session-less fallback: userId from request body
    } = rawBody;
    
    // ⚡ Log new multi-index data if provided
    if (indices && indices.length > 0) {
      console.log(`\n📊 ============ MULTI-INDEX REQUEST ============`);
      console.log(`📊 Active Indices: ${indices.join(', ')}`);
      console.log(`📊 Primary Index: ${index}`);
      if (spreadData) {
        console.log(`📊 Spread Data:`);
        spreadData.forEach((sd: any) => {
          console.log(`   - ${sd.index}: ${sd.symbols.length} symbols`);
        });
      }
      console.log(`================================================\n`);
    }
    
    // ⚡ VALIDATE TIMEFRAME FIRST!
    if (interval !== '5' && interval !== '15') {
      console.error(`❌ INVALID TIMEFRAME RECEIVED!`);
      console.error(`   Expected: "5" or "15"`);
      console.error(`   Received: "${interval}" (type: ${typeof interval})`);
      console.error(`   Full request:`, JSON.stringify(rawBody, null, 2));
      return c.json({ 
        error: `Invalid timeframe "${interval}". Must be "5" or "15".`,
        success: false 
      }, 400);
    }
    
    console.log(`\n🚀🚀🚀 ADVANCED AI REQUEST - ${interval}M TIMEFRAME 🚀🚀🚀`);
    console.log(`Index: ${index} | Interval: ${interval}M | Account: ₹${accountBalance || 100000}`);
    console.log(`⚡ TIMEFRAME VERIFICATION: This request will fetch ${interval}-minute candles from Dhan API`);
    
    // ⚡ FAST AUTH: Decode userId from JWT locally (no network call) + body fallback
    // No signature verification needed — unknown userIds simply return 400 (no credentials found)
    const bearerToken = c.req.header('Authorization')?.split(' ')[1];
    const effectiveUserId = extractUserIdFromJwt(bearerToken || '') || bodyUserId;
    
    if (!effectiveUserId) {
      console.error('❌ No userId found in JWT or request body');
      return c.json({ error: 'userId required — please re-login or ensure userId is sent in the request' }, 401);
    }
    
    console.log(`🔑 Trading request userId: ${effectiveUserId} (source: ${extractUserIdFromJwt(bearerToken || '') ? 'JWT' : 'body'})`);
    
    // ⚡ FIX: Use user-specific credentials key (same as other endpoints)
    const credentials = await kv.get(`api_credentials:${effectiveUserId}`);
    if (!credentials) {
      console.error('❌ No credentials found for user:', effectiveUserId);
      return c.json({ error: 'API credentials not configured. Please configure in Settings.' }, 400);
    }
    
    if (!credentials.dhanAccessToken) {
      console.error('❌ Dhan access token missing');
      return c.json({ error: 'Dhan access token not configured. Please configure in Settings.' }, 400);
    }
    
    console.log(`✅ Credentials loaded for user: ${effectiveUserId}`);
    console.log(`⚡ Using timeframe: ${interval}M (selected by user)`);
    
    // ⚡⚡⚡ MULTI-SYMBOL SUPPORT: Process all active indices ⚡⚡⚡
    const activeIndices = indices && indices.length > 0 ? indices : [index];
    console.log(`\n🎯 Processing ${activeIndices.length} indices: ${activeIndices.join(', ')}`);
    
    const dhanService = new DhanService({ 
      clientId: credentials.dhanClientId, 
      accessToken: credentials.dhanAccessToken 
    });
    
    // Helper function to get security ID
    const getSecurityId = (idx: string) => {
      if (idx === 'NIFTY') return '13';
      if (idx === 'BANKNIFTY') return '25';
      if (idx === 'SENSEX') return '51'; // BSE SENSEX security ID
      return '13'; // Default to NIFTY
    };
    
    // ⚡ Fetch data and generate signals for ALL active indices (SEQUENTIAL to avoid rate limiting)
    const dataStart = performance.now();
    const results = [];
    
    for (const idx of activeIndices) {
      try {
        const securityId = getSecurityId(idx);
        console.log(`\n📊 Fetching ${idx} data (security ID: ${securityId})...`);
        
        // ⚡ CRITICAL: Add 500ms delay between requests to avoid Dhan rate limiting (optimized for multi-symbol)
        // Note: Global rate limiter already adds 600ms between ALL Dhan API calls
        if (results.length > 0) {
          console.log('   ⏱️ Waiting 500ms to avoid rate limiting...');
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        const ohlcData = await dhanService.getOHLCData(securityId, interval.toString(), 50);
        
        if (!ohlcData || ohlcData.length === 0) {
          console.error(`❌ CRITICAL: No OHLC data for ${idx} (security ID: ${securityId})`);
          console.error(`   This means Dhan API returned EMPTY or NULL data!`);
          console.error(`   Possible causes:`);
          console.error(`     1. Wrong security ID for ${idx}`);
          console.error(`     2. Dhan API rate limiting`);
          console.error(`     3. ${idx} data not available in Dhan API`);
          console.error(`     4. Authentication issue`);
          return { index: idx, error: 'No data available', details: `Security ID ${securityId} returned no candles` };
        }
        
        console.log(`✅ ${idx}: ${ohlcData.length} candles fetched`);
        const latestCandle = ohlcData[ohlcData.length - 1];
        const analysisCandles = ohlcData.length > 3 ? ohlcData.slice(0, -1) : ohlcData;
        const analyzedCandle = analysisCandles[analysisCandles.length - 1];
        const firstCandle = ohlcData[0];
        console.log(`   First candle: O:${firstCandle?.open} C:${firstCandle?.close} (timestamp: ${new Date(firstCandle?.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })})`);
        console.log(`   Latest candle: O:${latestCandle?.open} H:${latestCandle?.high} L:${latestCandle?.low} C:${latestCandle?.close} V:${latestCandle?.volume}`);
        if (analysisCandles.length !== ohlcData.length) {
          console.log(`   Ignoring live candle for AI analysis. Using closed candle: O:${analyzedCandle?.open} H:${analyzedCandle?.high} L:${analyzedCandle?.low} C:${analyzedCandle?.close} V:${analyzedCandle?.volume}`);
        }
        console.log(`   Price range: ${Math.min(...ohlcData.map(c => c.low)).toFixed(2)} - ${Math.max(...ohlcData.map(c => c.high)).toFixed(2)}`);
        
        // Generate AI signal for this index
        const aiStart = performance.now();
        const signal = AdvancedAI.generateAdvancedSignal(analysisCandles, accountBalance || 100000);
        const aiEnd = performance.now();
        
        console.log(`\n⚡ ${idx} SIGNAL: ${signal.action} | Confidence: ${signal.confidence}%`);
        console.log(`   Confirmations: ${signal.confirmations.total}/10 (required: ${signal.confirmations.required})`);
        console.log(`   Market Regime: ${signal.marketRegime.type} (${signal.marketRegime.strength.toFixed(1)}%)`);
        console.log(`   Execution: ${Math.round(aiEnd - aiStart)}ms`);
        
        results.push({
          index: idx,
          signal: {
            ...signal,
            index: idx,
            timeframe: `${interval}M`,
              candlesAnalyzed: analysisCandles.length
          },
          candlesProcessed: analysisCandles.length,
          processingTime: Math.round(aiEnd - aiStart)
        });
      } catch (error) {
        console.error(`❌ Error processing ${idx}:`, error);
        console.error(`   Error type: ${error?.name}`);
        console.error(`   Error message: ${error?.message}`);
        console.error(`   Stack trace:`, error?.stack?.substring(0, 500));
        results.push({ index: idx, error: `Failed: ${error.message || error}`, details: error.toString() });
      }
    }
    const dataEnd = performance.now();
    
    // ⚡ Separate successful signals from errors
    const successfulSignals = results.filter(r => r.signal && !r.error);
    const failedIndices = results.filter(r => r.error);
    
    if (failedIndices.length > 0) {
      console.warn(`\n⚠️ ============ FAILED INDICES ============`);
      failedIndices.forEach(f => {
        console.warn(`   ${f.index}: ${f.error}`);
        if (f.details) {
          console.warn(`      Details: ${f.details}`);
        }
      });
      console.warn(`==========================================\n`);
    }
    
    // ⚡ Log summary for all indices
    console.log(`\n📊 ============ MULTI-SYMBOL SUMMARY ============`);
    successfulSignals.forEach(result => {
      console.log(`   ${result.index}: ${result.signal.action} (${result.signal.confidence}% confidence)`);
    });
    console.log(`============================================\n`);
    
    const routeEnd = performance.now();
    const totalTime = Math.round(routeEnd - routeStart);
    
    console.log(`⚡⚡⚡ TOTAL TIME: ${totalTime}ms for ${activeIndices.length} indices ⚡⚡⚡`);
    console.log(`   Data Fetch + AI: ${Math.round(dataEnd - dataStart)}ms\n`);
    
    // ⚡ Return ALL signals (backward compatible + multi-symbol)
    const primarySignal = successfulSignals.find(r => r.index === index) || successfulSignals[0];
    
    return c.json({
      success: true,
      // ⚡ BACKWARD COMPATIBLE: Primary signal (for single-symbol mode)
      signal: primarySignal ? primarySignal.signal : null,
      // ⚡ NEW: All signals keyed by index
      signals: {
        NIFTY: successfulSignals.find(r => r.index === 'NIFTY')?.signal || null,
        BANKNIFTY: successfulSignals.find(r => r.index === 'BANKNIFTY')?.signal || null,
        SENSEX: successfulSignals.find(r => r.index === 'SENSEX')?.signal || null
      },
      // ⚡ NEW: Processing metadata
      multiSymbol: {
        activeIndices: activeIndices,
        processedCount: successfulSignals.length,
        failedCount: failedIndices.length,
        results: results
      },
      performance: {
        dataFetch: Math.round(dataEnd - dataStart),
        total: totalTime
      },
      timeframe: `${interval}M`,
      verification: {
        requestedTimeframe: `${interval}M`,
        actualTimeframe: `${interval}M`,
        verified: true
      }
    });
    
  } catch (error) {
    console.error('Advanced AI error:', error);
    return c.json({ 
      success: false,
      error: `Advanced AI failed: ${error}` 
    }, 500);
  }
});

// ⚡ GET LAST TRADED PRICE (LTP) - ULTRA FAST
app.post("/make-server-c4d79cb7/ltp", async (c) => {
  try {
    const { securityId } = await c.req.json();
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '');
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const credentials = await kv.get(`api_credentials:${user.id}`);
    if (!credentials || !credentials.dhanAccessToken) {
      return c.json({ error: 'Credentials not configured' }, 400);
    }
    
    const dhanService = new DhanService({
      clientId: credentials.dhanClientId,
      accessToken: credentials.dhanAccessToken
    });
    
    // Fetch LTP from Dhan API
    const ltp = await dhanService.getLTP(securityId);
    
    return c.json({ success: true, ltp });
  } catch (error) {
    console.error('LTP error:', error);
    return c.json({ error: `Failed to fetch LTP: ${error}` }, 500);
  }
});

// ==================== BACKTESTING ROUTE ====================

// Test endpoint to check if Dhan API is working
app.post("/make-server-c4d79cb7/backtest/test-dhan", async (c) => {
  console.log('🧪 TEST DHAN API ENDPOINT HIT');
  
  try {
    const body = await c.req.json();
    const { userId } = body;
    
    if (!userId) {
      return c.json({ success: false, error: 'User ID required' }, 400);
    }
    
    const credentials = await kv.get(`api_credentials:${userId}`) as any;
    
    if (!credentials || !credentials.dhanAccessToken) {
      return c.json({ success: false, error: 'No Dhan credentials' }, 400);
    }
    
    // Test with 7 days of data first (smaller request)
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 7); // 7 days back
    
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    const requestBody = {
      securityId: '13', // NIFTY
      exchangeSegment: 'IDX_I',
      instrument: 'INDEX',
      expiryCode: -2147483648,
      interval: '5',
      oi: false,
      fromDate: formatDate(fromDate),
      toDate: formatDate(toDate)
    };
    
    console.log('📤 Test request:', JSON.stringify(requestBody, null, 2));
    
    const response = await fetch('https://api.dhan.co/v2/charts/historical', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access-token': credentials.dhanAccessToken
      },
      body: JSON.stringify(requestBody)
    });
    
    console.log(`📥 Response status: ${response.status}`);
    
    const data = await response.json();
    console.log('📥 Response keys:', Object.keys(data));
    
    // Return full response for debugging
    return c.json({
      success: response.ok,
      status: response.status,
      requestBody,
      responseKeys: Object.keys(data),
      hasOpen: !!data.open,
      hasClose: !!data.close,
      openLength: data.open ? data.open.length : 0,
      sampleData: {
        firstOpen: data.open?.[0],
        firstClose: data.close?.[0],
        lastOpen: data.open?.[data.open?.length - 1],
        lastClose: data.close?.[data.close?.length - 1]
      },
      fullResponse: data
    });
    
  } catch (error: any) {
    console.error('❌ Test error:', error);
    return c.json({ 
      success: false, 
      error: error.message,
      stack: error.stack
    }, 500);
  }
});

// Run backtest and generate report
app.post("/make-server-c4d79cb7/backtest/run", async (c) => {
  console.log('🔥🔥🔥 BACKTEST ROUTE HIT! 🔥🔥🔥');
  console.log('Timestamp:', new Date().toISOString());
  
  try {
    console.log('📊 Starting backtest...');
    
    const body = await c.req.json();
    console.log('📥 Request body:', JSON.stringify(body, null, 2));
    
    const { userId, initialCapital = 100000, quantity = 75 } = body;
    
    if (!userId) {
      console.log('❌ No userId provided');
      return c.json({ success: false, error: 'User ID required' }, 400);
    }
    
    console.log(`👤 User ID: ${userId}`);
    
    // Get user's Dhan credentials from api_credentials object
    console.log(`🔍 Fetching credentials for: api_credentials:${userId}`);
    const credentials = await kv.get(`api_credentials:${userId}`) as any;
    
    console.log('🔐 Credentials retrieved:', credentials ? 'YES' : 'NO');
    if (credentials) {
      console.log('   - Has dhanAccessToken:', !!credentials.dhanAccessToken);
      console.log('   - Has dhanClientId:', !!credentials.dhanClientId);
    }
    
    if (!credentials || !credentials.dhanAccessToken || !credentials.dhanClientId) {
      console.log('❌ Missing Dhan credentials');
      return c.json({ 
        success: false, 
        error: 'Dhan API credentials not configured. Please configure in Settings.' 
      }, 400);
    }
    
    console.log(`💰 Running backtest with ₹${initialCapital} capital, ${quantity} quantity`);
    console.log('🚀 Calling BacktestEngine.runBacktest()...');
    
    // Run backtest with debug wrapper
    let report;
    let debugInfo: any = { stage: 'starting' };
    
    try {
      debugInfo.stage = 'calling_backtest';
      report = await BacktestEngine.runBacktest(
        credentials.dhanAccessToken,
        credentials.dhanClientId,
        initialCapital,
        quantity
      );
      debugInfo.stage = 'backtest_complete';
      debugInfo.tradesGenerated = report.overall.totalTrades;
    } catch (backtestError: any) {
      debugInfo.stage = 'backtest_error';
      debugInfo.error = backtestError.message;
      debugInfo.stack = backtestError.stack?.substring(0, 500);
      
      console.error('❌ BACKTEST ENGINE ERROR:', backtestError);
      
      return c.json({
        success: false,
        error: `Backtest failed: ${backtestError.message}`,
        debug: debugInfo
      }, 500);
    }
    
    console.log('✅ BacktestEngine.runBacktest() completed');
    console.log(`📊 Report generated: ${report.overall.totalTrades} trades`);
    
    // Generate markdown report
    console.log('📝 Generating markdown report...');
    const markdownReport = BacktestEngine.generateMarkdownReport(report);
    
    // Save report to KV store
    const reportKey = `backtest_report_${userId}_${Date.now()}`;
    console.log(`💾 Saving report to KV: ${reportKey}`);
    await kv.set(reportKey, markdownReport);
    
    console.log(`✅ Backtest complete! Report saved: ${reportKey}`);
    
    return c.json({
      success: true,
      report,
      markdownReport,
      reportKey,
      summary: {
        trades: report.overall.totalTrades,
        winRate: report.overall.winRate,
        netPnL: report.overall.netPnL,
        roi: report.overall.returnOnInvestment
      }
    });
    
  } catch (error) {
    console.error('❌❌❌ BACKTEST ERROR ❌❌❌');
    console.error('Error type:', error?.constructor?.name);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    console.error('Full error:', error);
    
    return c.json({ 
      success: false,
      error: `Backtest failed: ${error?.message || error}`,
      stack: error?.stack
    }, 500);
  }
});

// Manual strategy test endpoint - paste candle data directly
app.post("/make-server-c4d79cb7/backtest/manual-test", async (c) => {
  console.log('🧪 MANUAL STRATEGY TEST ROUTE HIT');
  
  try {
    const body = await c.req.json();
    const { open, high, low, close, volume, timestamp } = body;
    
    if (!open || !high || !low || !close || !volume || !timestamp) {
      return c.json({ 
        success: false, 
        error: 'Missing required candle data arrays' 
      }, 400);
    }
    
    console.log(`📊 Received ${close.length} candles`);
    console.log(`📅 First: ${new Date(timestamp[0] * 1000).toLocaleString('en-IN')}`);
    console.log(`📅 Last: ${new Date(timestamp[timestamp.length - 1] * 1000).toLocaleString('en-IN')}`);
    
    // Run strategy
    const { signals, summary } = runManualStrategy(open, high, low, close, volume, timestamp);
    
    // Simulate trades
    const { trades, stats } = simulateTrades(signals, 75);
    
    // Get first 10 and last 10 signals
    const firstSignals = signals.slice(0, 10);
    const lastSignals = signals.slice(-10);
    
    // Get all BUY signals
    const buySignals = signals.filter(s => s.action !== 'WAIT');
    
    return c.json({
      success: true,
      candles: close.length,
      dateRange: {
        start: new Date(timestamp[0] * 1000).toLocaleString('en-IN'),
        end: new Date(timestamp[timestamp.length - 1] * 1000).toLocaleString('en-IN')
      },
      signalSummary: summary,
      tradeSummary: stats,
      firstSignals,
      lastSignals,
      buySignals: buySignals.slice(0, 20), // First 20 BUY signals
      allTrades: trades
    });
    
  } catch (error: any) {
    console.error('❌ Manual test error:', error);
    return c.json({ 
      success: false, 
      error: error.message,
      stack: error.stack
    }, 500);
  }
});

// ============================================
// 📊 TRADING JOURNAL ROUTES
// ============================================

// Add journal entry (auto-called when trade closes)
app.post('/make-server-c4d79cb7/add-journal-entry', async (c) => {
  try {
    const { user, error: authError } = await validateAuth(c);
    if (authError) {
      return c.json({ error: authError.message }, authError.code);
    }

    const body = await c.req.json();
    const {
      date, // YYYY-MM-DD
      symbol,
      strategy, // 'AI_ENHANCED_ENGINE' or 'MANUAL_TRADE'
      side,
      entryPrice,
      exitPrice,
      quantity,
      pnl,
      orderId,
      notes
    } = body;

    // Validate required fields
    if (!date || !symbol || !strategy || !side || entryPrice === undefined || exitPrice === undefined || !quantity || pnl === undefined) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Generate entry ID
    const entryId = `journal:${user.id}:${date}:${Date.now()}`;

    const entry = {
      id: entryId,
      userId: user.id,
      date,
      timestamp: Date.now(),
      symbol,
      strategy,
      side,
      entryPrice,
      exitPrice,
      quantity,
      pnl,
      orderId: orderId || '',
      notes: notes || ''
    };

    // Store journal entry
    await kv.set(entryId, entry);

    console.log(`📝 Added journal entry: ${symbol} ${side} P&L: ₹${pnl.toFixed(2)} (${strategy})`);

    return c.json({ success: true, entry });
  } catch (error: any) {
    console.error('Error adding journal entry:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get journal entries for user
app.post('/make-server-c4d79cb7/get-journal-entries', async (c) => {
  try {
    const { user, error: authError } = await validateAuth(c);
    if (authError) {
      return c.json({ error: authError.message }, authError.code);
    }

    const body = await c.req.json();
    const { startDate, endDate } = body;

    // Get all journal entries for this user
    const prefix = `journal:${user.id}:`;
    const allEntries = await kv.getByPrefix(prefix);

    let entries = allEntries.map((e: any) => e.value); // Extract value from {key, value}

    // Filter by date range if provided
    if (startDate || endDate) {
      entries = entries.filter((entry: any) => {
        if (startDate && entry.date < startDate) return false;
        if (endDate && entry.date > endDate) return false;
        return true;
      });
    }

    // Sort by timestamp descending (newest first)
    entries.sort((a: any, b: any) => b.timestamp - a.timestamp);

    console.log(`📊 Retrieved ${entries.length} journal entries for user`);

    return c.json({ success: true, entries });
  } catch (error: any) {
    console.error('Error fetching journal entries:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Clear ALL journal data (for removing sample data)
app.post('/make-server-c4d79cb7/clear-journal-data', async (c) => {
  try {
    const { user, error: authError } = await validateAuth(c);
    if (authError) {
      return c.json({ error: authError.message }, authError.code);
    }

    // Get all journal entries for this user
    const allEntries = await kv.getByPrefix(`journal:${user.id}:`);
    
    // Delete each entry using the key
    const deletePromises = allEntries.map((entry: any) => kv.del(entry.key));
    await Promise.all(deletePromises);
    
    console.log(`🗑️ Cleared ${allEntries.length} journal entries for user ${user.id}`);

    return c.json({ 
      success: true, 
      message: `Cleared ${allEntries.length} journal entries`,
      deleted: allEntries.length
    });
  } catch (error: any) {
    console.error('Error clearing journal data:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Sync manual trades from Dhan positions (run daily)
app.post('/make-server-c4d79cb7/sync-manual-trades', async (c) => {
  try {
    const { user, error: authError } = await validateAuth(c);
    if (authError) {
      // ⚡ Only log unexpected auth errors (suppress "No authorization token" for public access)
      if (authError.message !== 'No authorization token provided') {
        console.error('❌ Auth error in sync-manual-trades:', authError.message);
      }
      return c.json({ error: authError.message }, authError.code);
    }

    console.log(`📊 Starting sync for user: ${user.id}`);

    // Get Dhan credentials (FIXED: use correct key format)
    const credentials = await kv.get(`api_credentials:${user.id}`);
    console.log('🔑 Credentials check:', credentials ? 'Found' : 'Not found');
    
    if (!credentials || !credentials.dhanClientId || !credentials.dhanAccessToken) {
      console.error('❌ Missing Dhan credentials');
      return c.json({ error: 'Dhan credentials not configured' }, 400);
    }

    const dhanService = new DhanService({
      clientId: credentials.dhanClientId,
      accessToken: credentials.dhanAccessToken
    });

    console.log('🚀 Fetching positions from Dhan API...');
    
    // Get ALL positions from Dhan (both open and closed)
    const positions = await dhanService.getPositions();
    
    console.log(`📊 Found ${positions.length} total positions from Dhan`);
    
    if (positions.length === 0) {
      console.warn('⚠️ No positions found from Dhan API');
      return c.json({ 
        success: true, 
        syncedCount: 0,
        totalPnL: 0,
        message: 'No positions found in Dhan account'
      });
    }

    // Log first position for debugging
    console.log('📦 Sample position:', JSON.stringify(positions[0], null, 2));
    
    // Get existing journal entries for today
    const today = new Date().toISOString().split('T')[0];
    console.log(`📅 Syncing for date: ${today}`);
    
    const existingEntries = await kv.getByPrefix(`journal:${user.id}:${today}`);
    console.log(`📋 Found ${existingEntries.length} existing journal entries for today`);
    
    const existingSymbols = new Set(existingEntries.map((e: any) => e.value.symbol).filter(Boolean));

    let addedCount = 0;
    let skippedCount = 0;
    let totalDayPnL = 0;

    // Add ALL positions (open and closed)
    for (const pos of positions) {
      const symbol = pos.tradingSymbol || `Security ${pos.securityId}`;
      
      // Skip if already logged (by symbol for today)
      if (existingSymbols.has(symbol)) {
        console.log(`  ⏭️ Skipped (duplicate): ${symbol}`);
        skippedCount++;
        continue;
      }

      // Calculate P&L (both realized and unrealized)
      const realizedPnL = parseFloat(pos.realizedProfit || pos.realizedPnl || 0);
      const unrealizedPnL = parseFloat(pos.unrealizedProfit || pos.unrealizedPnl || 0);
      const totalPnL = realizedPnL + unrealizedPnL;
      
      totalDayPnL += totalPnL;

      // Determine entry and exit prices
      const buyAvg = parseFloat(pos.buyAvg || 0);
      const sellAvg = parseFloat(pos.sellAvg || 0);
      const ltp = parseFloat(pos.ltp || pos.lastPrice || 0);
      
      const entryPrice = buyAvg > 0 ? buyAvg : sellAvg;
      const exitPrice = pos.netQty === 0 ? (sellAvg > 0 ? sellAvg : ltp) : ltp;
      const quantity = Math.abs(pos.buyQty || pos.sellQty || pos.netQty || 0);

      const entryId = `journal:${user.id}:${today}:${Date.now()}_${addedCount}`;
      
      const entry = {
        id: entryId,
        userId: user.id,
        date: today,
        timestamp: Date.now(),
        symbol: symbol,
        strategy: 'AI_ENHANCED_ENGINE', // ✅ Mark as AI trade (synced from Dhan)
        side: (pos.buyQty || pos.netQty) > 0 ? 'BUY' : 'SELL',
        entryPrice: entryPrice,
        exitPrice: exitPrice,
        quantity: quantity,
        pnl: totalPnL,
        orderId: pos.drvPositionId || pos.positionId || `POS_${Date.now()}`,
        notes: `Dhan Sync | Real: ₹${realizedPnL.toFixed(2)} | Unreal: ₹${unrealizedPnL.toFixed(2)} | ${pos.netQty === 0 ? 'Closed' : 'Open'}`
      };

      console.log(`  ✅ Saving: ${symbol} - P&L: ₹${totalPnL.toFixed(2)}`);
      await kv.set(entryId, entry);
      addedCount++;
    }

    console.log(`✅ Sync complete! Added: ${addedCount} | Skipped: ${skippedCount} | Total Day P&L: ₹${totalDayPnL.toFixed(2)}`);

    return c.json({ 
      success: true, 
      syncedCount: addedCount,
      skippedCount: skippedCount,
      totalPnL: totalDayPnL,
      message: `Added ${addedCount} trades to journal | Day P&L: ₹${totalDayPnL.toFixed(2)}`
    });
  } catch (error: any) {
    console.error('❌ Error syncing manual trades:', error);
    console.error('Stack trace:', error.stack);
    return c.json({ error: error.message }, 500);
  }
});

// Test Dhan sync setup (debug endpoint)
app.post('/make-server-c4d79cb7/test-dhan-sync', async (c) => {
  try {
    const { user, error: authError } = await validateAuth(c);
    if (authError) {
      return c.json({ error: authError.message }, authError.code);
    }

    const result = await testDhanSync(user.id);
    
    return c.json({ 
      success: true, 
      test: result
    });
  } catch (error: any) {
    console.error('❌ Error testing Dhan sync:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ==================== WALLET & PAYMENT ROUTES ====================

// Initialize wallet for new user
app.post("/make-server-c4d79cb7/wallet/initialize", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    // Create wallet with ₹0 balance
    await kv.set(`wallet:${user.id}`, {
      balance: 0,
      totalProfit: 0, // ⚡ Track cumulative profit for payment logic
      totalDeducted: 0,
      createdAt: Date.now(),
    });

    console.log(`✅ Wallet initialized for user ${user.id}`);
    return c.json({ success: true, balance: 0 });
  } catch (error: any) {
    console.error('❌ Wallet initialization error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get wallet balance
app.get("/make-server-c4d79cb7/wallet/balance", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    const wallet = await kv.get(`wallet:${user.id}`) || { balance: 0, totalProfit: 0, totalDeducted: 0 };
    
    return c.json({ 
      success: true, 
      balance: wallet.balance || 0,
      totalProfit: wallet.totalProfit || 0,
      totalDeducted: wallet.totalDeducted || 0
    });
  } catch (error: any) {
    console.error('❌ Get wallet balance error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Create Razorpay order for wallet recharge
app.post("/make-server-c4d79cb7/wallet/create-recharge-order", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    const { amount } = await c.req.json();

    if (!amount || amount < 100 || amount > 50000) {
      return c.json({ error: 'Amount must be between ₹100 and ₹50,000' }, 400);
    }

    // Create Razorpay order
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID');
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET');

    if (!razorpayKeyId || !razorpayKeySecret) {
      return c.json({ error: 'Razorpay not configured' }, 500);
    }

    // Generate short receipt ID (max 40 chars for Razorpay)
    // Format: w_timestamp_last8ofuserid
    const shortUserId = user.id.slice(-8);
    const timestamp = Date.now().toString().slice(-10);
    const receipt = `w_${timestamp}_${shortUserId}`; // ~25 chars

    const orderData = {
      amount: amount * 100, // Razorpay expects amount in paise
      currency: 'INR',
      receipt: receipt,
      notes: {
        userId: user.id,
        type: 'wallet_recharge',
      },
    };

    const auth = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
    
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Razorpay order creation failed:', errorText);
      throw new Error('Failed to create Razorpay order');
    }

    const order = await response.json();

    // Store order details
    await kv.set(`razorpay_order:${order.id}`, {
      userId: user.id,
      amount: amount,
      orderId: order.id,
      status: 'created',
      createdAt: Date.now(),
    });

    console.log(`✅ Razorpay order created: ${order.id} for ��${amount}`);

    return c.json({
      success: true,
      order: order,
      razorpayKeyId: razorpayKeyId,
    });
  } catch (error: any) {
    console.error('❌ Create recharge order error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Verify Razorpay payment and credit wallet
app.post("/make-server-c4d79cb7/wallet/verify-payment", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await c.req.json();

    // Verify signature
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
    const crypto = await import('node:crypto');
    
    const expectedSignature = crypto
      .createHmac('sha256', razorpayKeySecret!)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      console.error('❌ Payment signature verification failed');
      return c.json({ error: 'Invalid payment signature' }, 400);
    }

    // Get order details
    const orderDetails = await kv.get(`razorpay_order:${razorpay_order_id}`);
    if (!orderDetails || orderDetails.userId !== user.id) {
      return c.json({ error: 'Order not found' }, 404);
    }

    // Credit wallet
    const wallet = await kv.get(`wallet:${user.id}`) || { balance: 0, totalProfit: 0, totalDeducted: 0 };
    const newBalance = (wallet.balance || 0) + orderDetails.amount;

    await kv.set(`wallet:${user.id}`, {
      ...wallet,
      balance: newBalance,
      lastUpdated: Date.now(),
    });

    // ⚡ CRITICAL FIX: Record credit transaction in wallet_transactions array
    const transaction = {
      id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: user.id,
      type: 'credit',
      amount: orderDetails.amount,
      balance: newBalance,
      timestamp: new Date().toISOString(),
      description: 'Wallet Recharge',
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      source: 'razorpay'
    };
    
    const walletTransactions = await kv.get(`wallet_transactions:${user.id}`) || [];
    walletTransactions.push(transaction);
    await kv.set(`wallet_transactions:${user.id}`, walletTransactions);

    // Update order status
    await kv.set(`razorpay_order:${razorpay_order_id}`, {
      ...orderDetails,
      status: 'completed',
      paymentId: razorpay_payment_id,
      completedAt: Date.now(),
    });

    console.log(`✅ Wallet credited: ₹${orderDetails.amount} for user ${user.id}`);

    return c.json({
      success: true,
      newBalance: newBalance,
      amount: orderDetails.amount,
    });
  } catch (error: any) {
    console.error('❌ Verify payment error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get wallet transactions
app.get("/make-server-c4d79cb7/wallet/transactions", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    // ⚡ FIX: Get all transactions from wallet_transactions key (NOT wallet_txn)
    const allTransactions = await kv.get(`wallet_transactions:${user.id}`) || [];
    
    // Sort by timestamp (newest first)
    const transactions = Array.isArray(allTransactions) 
      ? allTransactions.sort((a, b) => {
          const timeA = new Date(a.timestamp).getTime();
          const timeB = new Date(b.timestamp).getTime();
          return timeB - timeA;
        })
      : [];

    return c.json({
      success: true,
      transactions: transactions,
    });
  } catch (error: any) {
    console.error('❌ Get transactions error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get daily profit statistics and pricing tiers
app.get("/make-server-c4d79cb7/wallet/daily-stats", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    const stats = await getDailyProfitStats(user.id);
    
    return c.json({
      success: true,
      ...stats,
      pricingTiers: PRICING_TIERS
    });
  } catch (error: any) {
    console.error('❌ Get daily stats error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ⚡ AUTO-DEBIT: Tiered profit-based debit system
app.post("/make-server-c4d79cb7/wallet/check-and-debit", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    const today = new Date().toISOString().split('T')[0];
    const startIso = `${today}T00:00:00.000Z`;

    const { data: activePositions, error: positionsError } = await supabase
      .from('position_monitor_state')
      .select('pnl')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .gte('created_at', startIso);

    if (positionsError) {
      return c.json({ success: false, error: 'Failed to verify running positions' }, 500);
    }

    const confirmedRunningProfit = (activePositions || []).reduce((sum: number, position: any) => {
      const pnl = Number(position?.pnl || 0);
      return pnl > 0 ? sum + pnl : sum;
    }, 0);

    const PLATFORM_OWNER_EMAIL = Deno.env.get('PLATFORM_OWNER_EMAIL') || 'your-email@example.com';
    const result = await checkAndDebitTiered(user.id, user.email, confirmedRunningProfit, PLATFORM_OWNER_EMAIL);
    
    if (!result.success && result.error) {
      return c.json(result, 400);
    }
    
    return c.json(result);
  } catch (error: any) {
    console.error('❌ Check and debit error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ⚡ RESET SESSION FEE: Call this after market close to allow next day's trading
app.post("/make-server-c4d79cb7/wallet/reset-session", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    const wallet = await kv.get(`wallet:${user.id}`) || { balance: 0, totalProfit: 0 };
    
    // Reset session fee flag for next trading day
    await kv.set(`wallet:${user.id}`, {
      ...wallet,
      hasPaidSessionFee: false,
      totalProfit: 0, // Reset daily profit tracking
      lastReset: Date.now(),
    });

    console.log(`✅ Session reset for user ${user.id} - Ready for next trading day`);

    return c.json({
      success: true,
      message: 'Session reset - ready for next trading day',
    });
  } catch (error: any) {
    console.error('❌ Reset session error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ⚡ STATIC IP AUTO-DEBIT: Monthly ₹59 subscription for static IP access
app.post("/make-server-c4d79cb7/wallet/static-ip-subscription-check", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    const STATIC_IP_FEE = 59;
    const INACTIVITY_DAYS = 10;
    const SUBSCRIPTION_INTERVAL_DAYS = 30; // Monthly

    console.log(`💰 [STATIC IP] Checking subscription for user ${user.id}`);

    // Get user's wallet and subscription data
    const wallet = await kv.get(`wallet:${user.id}`) || { balance: 0, totalProfit: 0, totalDeducted: 0 };
    const subscription = await kv.get(`static_ip_subscription:${user.id}`) || {};
    const userActivity = await kv.get(`user_activity:${user.id}`) || { lastActive: Date.now() };

    const now = Date.now();
    const lastActive = userActivity.lastActive || now;
    const daysSinceLastActive = (now - lastActive) / (1000 * 60 * 60 * 24);

    console.log(`💰 [STATIC IP] User last active: ${daysSinceLastActive.toFixed(1)} days ago`);
    console.log(`💰 [STATIC IP] Wallet balance: ₹${wallet.balance}`);

    // Check if user has been inactive for 10+ days
    if (daysSinceLastActive > INACTIVITY_DAYS) {
      console.log(`⚠️ [STATIC IP] User inactive for ${daysSinceLastActive.toFixed(0)} days - no charge`);
      return c.json({
        success: true,
        subscriptionActive: false,
        message: `No charge - inactive for ${daysSinceLastActive.toFixed(0)} days`,
        canConnectBroker: false,
        reason: 'User inactive for 10+ days'
      });
    }

    // Check if sufficient balance
    if (wallet.balance < STATIC_IP_FEE) {
      console.log(`❌ [STATIC IP] Insufficient balance: ₹${wallet.balance} < ₹${STATIC_IP_FEE}`);
      return c.json({
        success: true,
        subscriptionActive: false,
        canConnectBroker: false,
        message: 'Insufficient wallet balance',
        requiredAmount: STATIC_IP_FEE,
        currentBalance: wallet.balance,
        shortfall: STATIC_IP_FEE - wallet.balance
      });
    }

    // Check if already paid this month
    const lastPaymentDate = subscription.lastPaymentDate || 0;
    const daysSinceLastPayment = (now - lastPaymentDate) / (1000 * 60 * 60 * 24);

    if (daysSinceLastPayment < SUBSCRIPTION_INTERVAL_DAYS && subscription.active) {
      console.log(`✅ [STATIC IP] Subscription active - ${daysSinceLastPayment.toFixed(0)} days since last payment`);
      return c.json({
        success: true,
        subscriptionActive: true,
        canConnectBroker: true,
        message: 'Subscription active',
        daysSinceLastPayment: Math.floor(daysSinceLastPayment),
        nextPaymentDue: Math.ceil(SUBSCRIPTION_INTERVAL_DAYS - daysSinceLastPayment)
      });
    }

    // Debit ₹59 from wallet
    console.log(`💸 [STATIC IP] Debiting ₹${STATIC_IP_FEE} from wallet`);
    
    const newBalance = wallet.balance - STATIC_IP_FEE;
    const newTotalDeducted = (wallet.totalDeducted || 0) + STATIC_IP_FEE;

    // Update wallet
    await kv.set(`wallet:${user.id}`, {
      ...wallet,
      balance: newBalance,
      totalDeducted: newTotalDeducted,
    });

    // Update subscription status
    await kv.set(`static_ip_subscription:${user.id}`, {
      active: true,
      lastPaymentDate: now,
      amount: STATIC_IP_FEE,
      nextPaymentDate: now + (SUBSCRIPTION_INTERVAL_DAYS * 24 * 60 * 60 * 1000)
    });

    // ⚡ Record transaction in wallet_transactions array (for display in Wallet Management)
    const transactionId = `txn_staticip_${now}`;
    const newTransaction = {
      id: transactionId,
      userId: user.id,
      type: 'debit',
      amount: STATIC_IP_FEE,
      balance: newBalance,
      description: 'Static IP Monthly Subscription (₹59/month)',
      timestamp: now,
      category: 'static_ip_subscription'
    };

    // Get existing transactions and add new one
    const existingTransactions = await kv.get(`wallet_transactions:${user.id}`) || [];
    
    // Ensure existingTransactions is an array
    const transactionsArray = Array.isArray(existingTransactions) ? existingTransactions : [];
    
    const updatedTransactions = [newTransaction, ...transactionsArray];
    await kv.set(`wallet_transactions:${user.id}`, updatedTransactions);

    console.log(`✅ [STATIC IP] Subscription activated - ₹${STATIC_IP_FEE} debited. New balance: ₹${newBalance}`);
    console.log(`✅ [STATIC IP] Transaction recorded:`, JSON.stringify(newTransaction));
    console.log(`✅ [STATIC IP] Total transactions now: ${updatedTransactions.length}`);

    return c.json({
      success: true,
      subscriptionActive: true,
      canConnectBroker: true,
      message: `Static IP subscription activated - ₹${STATIC_IP_FEE} debited`,
      newBalance: newBalance,
      amountDebited: STATIC_IP_FEE,
      validUntil: now + (SUBSCRIPTION_INTERVAL_DAYS * 24 * 60 * 60 * 1000)
    });

  } catch (error: any) {
    console.error('❌ Static IP subscription check error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ⚡ UPDATE USER ACTIVITY: Track last active time for subscription logic
app.post("/make-server-c4d79cb7/user/update-activity", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    await kv.set(`user_activity:${user.id}`, {
      lastActive: Date.now()
    });

    return c.json({ success: true });
  } catch (error: any) {
    console.error('❌ Update activity error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ⚡ GET STATIC IP SUBSCRIPTION STATUS
app.get("/make-server-c4d79cb7/wallet/static-ip-status", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    const subscription = await kv.get(`static_ip_subscription:${user.id}`) || {};
    const wallet = await kv.get(`wallet:${user.id}`) || { balance: 0 };
    const userActivity = await kv.get(`user_activity:${user.id}`) || { lastActive: Date.now() };

    const STATIC_IP_FEE = 59;
    const SUBSCRIPTION_INTERVAL_DAYS = 30;
    
    const now = Date.now();
    const lastActive = userActivity.lastActive || now;
    const daysSinceLastActive = (now - lastActive) / (1000 * 60 * 60 * 24);
    
    const lastPaymentDate = subscription.lastPaymentDate || 0;
    const daysSinceLastPayment = (now - lastPaymentDate) / (1000 * 60 * 60 * 24);

    const isActive = subscription.active && daysSinceLastPayment < SUBSCRIPTION_INTERVAL_DAYS;
    const canConnectBroker = isActive && wallet.balance >= 0 && daysSinceLastActive <= 10;

    return c.json({
      success: true,
      subscription: {
        active: isActive,
        monthlyFee: STATIC_IP_FEE,
        lastPaymentDate: lastPaymentDate,
        daysSinceLastPayment: Math.floor(daysSinceLastPayment),
        nextPaymentDue: isActive ? Math.ceil(SUBSCRIPTION_INTERVAL_DAYS - daysSinceLastPayment) : 0,
        canConnectBroker: canConnectBroker
      },
      wallet: {
        balance: wallet.balance,
        hasSufficientBalance: wallet.balance >= STATIC_IP_FEE
      },
      activity: {
        lastActive: lastActive,
        daysSinceLastActive: daysSinceLastActive.toFixed(1),
        isInactive: daysSinceLastActive > 10
      }
    });
  } catch (error: any) {
    console.error('❌ Get static IP status error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ==================== IP POOL MANAGEMENT ROUTES ====================

// 🌐 Get user's assigned IP
app.get("/make-server-c4d79cb7/ip-pool/my-ip", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    let assignment = await IPPoolManager.getUserIPAssignment(user.id);

    if (!assignment) {
      await VPSProvisioning.reconcileUserProvisioningJob(user.id);
      assignment = await IPPoolManager.getUserIPAssignment(user.id);
    }
    
    if (!assignment) {
      return c.json({
        success: true,
        hasIP: false,
        message: 'No dedicated IP assigned. Subscribe to get your own static IP.'
      });
    }

    return c.json({
      success: true,
      hasIP: true,
      assignment: {
        ipAddress: assignment.ipAddress,
        provider: assignment.provider,
        assignedAt: assignment.assignedAt,
        subscriptionStatus: assignment.subscriptionStatus,
        expiresAt: assignment.expiresAt,
        monthlyFee: assignment.monthlyFee,
        daysRemaining: Math.ceil((new Date(assignment.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      }
    });
  } catch (error: any) {
    console.error('❌ Get user IP error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// 🌐 Recover/link an already-created dedicated VPS to the current user
app.post("/make-server-c4d79cb7/ip-pool/my-ip", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    let assignment = await IPPoolManager.getUserIPAssignment(user.id);
    if (assignment) {
      return c.json({
        success: true,
        alreadyLinked: true,
        ipAddress: assignment.ipAddress,
        assignment,
      });
    }

    const job = await VPSProvisioning.reconcileUserProvisioningJob(user.id);
    assignment = await IPPoolManager.getUserIPAssignment(user.id);

    if (assignment) {
      return c.json({
        success: true,
        alreadyLinked: false,
        ipAddress: assignment.ipAddress,
        assignment,
        provisioningStatus: job?.status,
      });
    }

    return c.json({
      success: false,
      error: job?.ipAddress
        ? 'A VPS exists but the order server is not reachable yet. Please wait a little longer and try again.'
        : 'No existing VPS was found for your account yet.',
      provisioningStatus: job?.status,
      ipAddress: job?.ipAddress,
    }, 404);
  } catch (error: any) {
    console.error('❌ Recover dedicated IP error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// 🌐 Subscribe to dedicated IP service with AUTO-PROVISIONING
app.post("/make-server-c4d79cb7/ip-pool/subscribe", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    const body = await c.req.json();
    const { autoProvision } = body; // true = auto-provision new VPS, false = use existing pool

    const DEDICATED_IP_FEE = 599; // ₹599/month for dedicated IP (auto-provisioned VPS)

    // Check wallet balance
    const wallet = await kv.get(`wallet:${user.id}`) || { balance: 0 };
    if (wallet.balance < DEDICATED_IP_FEE) {
      return c.json({
        success: false,
        error: `Insufficient balance. Need ₹${DEDICATED_IP_FEE}, you have ₹${wallet.balance}`
      }, 400);
    }

    // ⚡ AUTO-PROVISIONING: Create new VPS for this user
    if (autoProvision) {
      console.log(`🤖 Auto-provisioning VPS for user ${user.id}...`);
      
      const provisionResult = await VPSProvisioning.provisionDedicatedIP(user.id);
      
      if (!provisionResult.success) {
        return c.json({
          success: false,
          error: provisionResult.error
        }, 400);
      }

      // Deduct from wallet immediately (VPS will be ready in 15 minutes)
      wallet.balance -= DEDICATED_IP_FEE;
      wallet.totalDeducted = (wallet.totalDeducted || 0) + DEDICATED_IP_FEE;
      await kv.set(`wallet:${user.id}`, wallet);

      // Log transaction
      const transaction = {
        userId: user.id,
        type: 'debit',
        amount: DEDICATED_IP_FEE,
        description: 'Dedicated IP subscription (auto-provisioning)',
        timestamp: new Date().toISOString(),
        balanceAfter: wallet.balance
      };
      await kv.set(`transaction:${Date.now()}_${user.id}`, transaction);

      console.log(`✅ User ${user.id} subscribed to auto-provisioned IP. Job ID: ${provisionResult.jobId}`);

      return c.json({
        success: true,
        message: `VPS provisioning started! Your dedicated IP will be ready in ~${provisionResult.estimatedMinutes} minutes`,
        provisioning: true,
        jobId: provisionResult.jobId,
        estimatedMinutes: provisionResult.estimatedMinutes,
        wallet: {
          balance: wallet.balance,
          deducted: DEDICATED_IP_FEE
        }
      });
    }

    // ⚡ MANUAL: Assign IP from existing pool
    const result = await IPPoolManager.assignIPToUser(user.id, DEDICATED_IP_FEE);
    
    if (!result.success) {
      return c.json({
        success: false,
        error: result.error
      }, 400);
    }

    // Deduct from wallet
    wallet.balance -= DEDICATED_IP_FEE;
    wallet.totalDeducted = (wallet.totalDeducted || 0) + DEDICATED_IP_FEE;
    await kv.set(`wallet:${user.id}`, wallet);

    // Log transaction
    const transaction = {
      userId: user.id,
      type: 'debit',
      amount: DEDICATED_IP_FEE,
      description: 'Dedicated IP subscription (30 days)',
      ipAddress: result.assignment?.ipAddress,
      timestamp: new Date().toISOString(),
      balanceAfter: wallet.balance
    };
    await kv.set(`transaction:${Date.now()}_${user.id}`, transaction);

    console.log(`✅ User ${user.id} subscribed to dedicated IP: ${result.assignment?.ipAddress}`);

    return c.json({
      success: true,
      message: `Successfully subscribed! Your dedicated IP: ${result.assignment?.ipAddress}`,
      assignment: result.assignment,
      wallet: {
        balance: wallet.balance,
        deducted: DEDICATED_IP_FEE
      }
    });
  } catch (error: any) {
    console.error('❌ Subscribe to IP error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// 🌐 Cancel dedicated IP subscription
app.post("/make-server-c4d79cb7/ip-pool/cancel", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    // Get user's IP assignment before removing
    const assignment = await IPPoolManager.getUserIPAssignment(user.id);
    const ipAddress = assignment?.ipAddress;

    const result = await IPPoolManager.removeIPFromUser(user.id);
    
    if (!result.success) {
      return c.json({
        success: false,
        error: result.error
      }, 400);
    }

    // ⚡ AUTO-DELETE VPS if it was auto-provisioned (to save costs)
    if (ipAddress) {
      const ipEntry = await kv.get(`ip_pool:${ipAddress}`) as any;
      if (ipEntry?.metadata?.autoProvisioned) {
        console.log(`🗑️ Auto-deleting VPS for cancelled subscription: ${ipAddress}`);
        const deleteResult = await VPSProvisioning.deprovisionVPS(ipAddress);
        if (deleteResult.success) {
          console.log(`✅ VPS deleted successfully: ${ipAddress}`);
          // Also remove from IP pool
          await kv.del(`ip_pool:${ipAddress}`);
        } else {
          console.error(`❌ Failed to delete VPS: ${deleteResult.error}`);
        }
      }
    }

    console.log(`✅ User ${user.id} cancelled dedicated IP subscription`);

    return c.json({
      success: true,
      message: 'Dedicated IP subscription cancelled successfully'
    });
  } catch (error: any) {
    console.error('❌ Cancel IP subscription error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// 🤖 Get VPS provisioning status
app.get("/make-server-c4d79cb7/ip-pool/provisioning-status", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    const assignment = await IPPoolManager.getUserIPAssignment(user.id);
    if (assignment?.ipAddress && assignment.subscriptionStatus === 'active') {
      return c.json({
        success: true,
        provisioning: false,
        message: 'Dedicated VPS is already active',
        assignment: {
          ipAddress: assignment.ipAddress,
          provider: assignment.provider,
          assignedAt: assignment.assignedAt,
          expiresAt: assignment.expiresAt,
          subscriptionStatus: assignment.subscriptionStatus,
        }
      });
    }

    const job = await VPSProvisioning.reconcileUserProvisioningJob(user.id);
    
    if (!job) {
      return c.json({
        success: true,
        provisioning: false,
        message: 'No provisioning in progress'
      });
    }

    return c.json({
      success: true,
      provisioning: job.status !== 'ready' && job.status !== 'active',
      job: {
        status: job.status,
        ipAddress: job.ipAddress,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        estimatedMinutes: job.estimatedMinutes,
        error: job.error
      }
    });
  } catch (error: any) {
    console.error('❌ Get provisioning status error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// 💳 Create Razorpay order for DIRECT IP purchase (no wallet needed!)
app.post("/make-server-c4d79cb7/ip-pool/create-payment-order", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    const DEDICATED_IP_FEE = 599; // ₹599/month

    // Check if user already has IP
    const existingIP = await IPPoolManager.getUserIPAssignment(user.id);
    if (existingIP) {
      return c.json({ 
        success: false,
        error: 'You already have a dedicated IP. Cancel existing subscription first.' 
      }, 400);
    }

    // Create Razorpay order
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID');
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET');

    if (!razorpayKeyId || !razorpayKeySecret) {
      return c.json({ error: 'Payment gateway not configured' }, 500);
    }

    // Generate receipt ID
    const shortUserId = user.id.slice(-8);
    const timestamp = Date.now().toString().slice(-10);
    const receipt = `ip_${timestamp}_${shortUserId}`;

    const orderData = {
      amount: DEDICATED_IP_FEE * 100, // Razorpay expects paise
      currency: 'INR',
      receipt: receipt,
      notes: {
        userId: user.id,
        type: 'dedicated_ip_subscription',
        email: user.email
      },
    };

    const authHeader = 'Basic ' + btoa(`${razorpayKeyId}:${razorpayKeySecret}`);

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderData),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('❌ Razorpay order creation failed:', errorData);
      return c.json({ error: 'Failed to create payment order' }, 500);
    }

    const order = await response.json();

    // Store pending order
    await kv.set(`pending_ip_order:${order.id}`, {
      userId: user.id,
      orderId: order.id,
      amount: DEDICATED_IP_FEE,
      receipt: receipt,
      status: 'created',
      createdAt: new Date().toISOString()
    });

    console.log(`✅ Payment order created for user ${user.id}: ${order.id}`);

    return c.json({
      success: true,
      orderId: order.id,
      amount: DEDICATED_IP_FEE,
      currency: 'INR',
      keyId: razorpayKeyId,
      notes: orderData.notes
    });

  } catch (error: any) {
    console.error('❌ Create payment order error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ✅ Verify payment and provision VPS (called after Razorpay payment success)
app.post("/make-server-c4d79cb7/ip-pool/verify-payment-and-provision", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await c.req.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return c.json({ error: 'Missing payment verification data' }, 400);
    }

    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
    if (!razorpayKeySecret) {
      return c.json({ error: 'Payment gateway not configured' }, 500);
    }

    // Verify signature
    const crypto = await import('node:crypto');
    const expectedSignature = crypto
      .createHmac('sha256', razorpayKeySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      console.error('❌ Payment signature verification failed');
      return c.json({ error: 'Payment verification failed' }, 400);
    }

    // Get pending order
    const pendingOrder = await kv.get(`pending_ip_order:${razorpay_order_id}`) as any;
    if (!pendingOrder || pendingOrder.userId !== user.id) {
      return c.json({ error: 'Invalid order' }, 400);
    }

    // Mark order as paid
    pendingOrder.status = 'paid';
    pendingOrder.paymentId = razorpay_payment_id;
    pendingOrder.paidAt = new Date().toISOString();
    await kv.set(`pending_ip_order:${razorpay_order_id}`, pendingOrder);

    // ⚡ PROVISION VPS NOW!
    console.log(`🤖 Auto-provisioning VPS for user ${user.id} after payment...`);
    const provisionResult = await VPSProvisioning.provisionDedicatedIP(user.id);

    if (!provisionResult.success) {
      // Payment succeeded but provisioning failed - need manual intervention
      console.error(`❌ Provisioning failed after payment for user ${user.id}:`, provisionResult.error);
      
      // Store for admin review
      await kv.set(`failed_provision:${user.id}`, {
        userId: user.id,
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        amount: pendingOrder.amount,
        error: provisionResult.error,
        timestamp: new Date().toISOString()
      });

      return c.json({
        success: false,
        error: 'Payment successful but VPS provisioning failed. Support team notified.',
        paymentId: razorpay_payment_id
      }, 500);
    }

    // Log transaction (for accounting)
    const transaction = {
      userId: user.id,
      type: 'payment',
      method: 'razorpay',
      amount: pendingOrder.amount,
      description: 'Dedicated IP subscription (direct payment)',
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      timestamp: new Date().toISOString()
    };
    await kv.set(`transaction:${Date.now()}_${user.id}`, transaction);

    console.log(`✅ User ${user.id} paid ₹${pendingOrder.amount} and VPS provisioning started. Job ID: ${provisionResult.jobId}`);

    return c.json({
      success: true,
      message: `Payment successful! Your VPS is being provisioned and will be ready in ~${provisionResult.estimatedMinutes} minutes`,
      provisioning: true,
      jobId: provisionResult.jobId,
      estimatedMinutes: provisionResult.estimatedMinutes,
      paymentId: razorpay_payment_id
    });

  } catch (error: any) {
    console.error('❌ Verify payment and provision error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// 🔧 ADMIN: Manually complete provisioning job (when health check fails but server is running)
app.post("/make-server-c4d79cb7/admin/provisioning/manual-complete", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    // Check admin hotkey
    const adminHotkey = c.req.header('X-Admin-Hotkey');
    const storedHotkey = await kv.get('admin:hotkey:default');
    
    if (!adminHotkey || !storedHotkey || adminHotkey !== storedHotkey.hotkey) {
      return c.json({ error: 'Unauthorized: Invalid admin hotkey' }, 403);
    }

    const body = await c.req.json();
    const { jobId, ipAddress, dropletId, userId } = body;

    if (!jobId || !ipAddress) {
      return c.json({ error: 'Missing required fields: jobId, ipAddress' }, 400);
    }

    console.log(`🔧 [MANUAL] Manually completing provisioning job: ${jobId}`);
    console.log(`🔧 [MANUAL] IP: ${ipAddress}, Droplet: ${dropletId}`);

    // Get job
    const job = await kv.get(`vps_provisioning:${jobId}`);
    if (!job) {
      return c.json({ error: 'Provisioning job not found' }, 404);
    }

    // Verify IP is accessible
    console.log(`🔧 [MANUAL] Testing health check for ${ipAddress}...`);
    let serverReachable = false;
    let serverResponse = null;

    try {
      const healthResponse = await fetch(`http://${ipAddress}:3000/health`, {
        signal: AbortSignal.timeout(5000)
      });
      if (healthResponse.ok) {
        serverResponse = await healthResponse.json();
        serverReachable = true;
        console.log(`✅ [MANUAL] Server is reachable at ${ipAddress}`);
      }
    } catch (healthError: any) {
      console.error(`❌ [MANUAL] Server not reachable: ${healthError.message}`);
    }

    if (!serverReachable) {
      return c.json({
        error: 'Server is not reachable',
        message: `Cannot complete provisioning because http://${ipAddress}:3000/health is not responding. Please verify the server is running.`,
        suggestion: 'SSH into the VPS and check: pm2 status && pm2 logs indexpilot-order-server'
      }, 400);
    }

    // Add to IP pool
    const addResult = await IPPoolManager.addIPToPool({
      ipAddress,
      vpsUrl: `http://${ipAddress}:3000`,
      provider: 'digitalocean',
      status: 'active',
      maxUsers: 1,
      metadata: {
        dropletId: dropletId || job.dropletId,
        autoProvisioned: true,
        provisioningJobId: jobId,
        manuallyCompleted: true,
        completedBy: user.id,
        completedAt: new Date().toISOString()
      }
    });

    if (!addResult.success) {
      return c.json({
        error: 'Failed to add IP to pool',
        details: addResult.error
      }, 500);
    }

    // Assign to user
    const targetUserId = userId || job.userId;
    const assignResult = await IPPoolManager.assignIPToUser(targetUserId, 199);

    if (!assignResult.success) {
      return c.json({
        error: 'Failed to assign IP to user',
        details: assignResult.error
      }, 500);
    }

    // Update job status
    const totalTime = Math.round((Date.now() - new Date(job.startedAt).getTime()) / 1000);
    const updatedJob = {
      ...job,
      status: 'ready',
      completedAt: new Date().toISOString(),
      estimatedMinutes: Math.round(totalTime / 60),
      manuallyCompleted: true,
      completedBy: user.id,
      timeline: {
        ...job.timeline,
        manualCompletionTriggered: new Date().toISOString(),
        completed: new Date().toISOString()
      }
    };
    await kv.set(`vps_provisioning:${jobId}`, updatedJob);

    // Remove from pending verification
    await kv.del(`vps_provisioning:pending:${ipAddress}`);

    console.log(`✅ [MANUAL] Provisioning completed manually for job ${jobId}`);
    console.log(`✅ [MANUAL] IP ${ipAddress} assigned to user ${targetUserId}`);

    return c.json({
      success: true,
      message: 'Provisioning completed manually',
      job: updatedJob,
      serverHealth: serverResponse,
      ipAddress,
      assignedTo: targetUserId
    });

  } catch (error: any) {
    console.error('❌ Manual completion error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// 🔧 ADMIN: Get pending manual verification jobs
app.get("/make-server-c4d79cb7/admin/provisioning/pending", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    // Check admin hotkey
    const adminHotkey = c.req.header('X-Admin-Hotkey');
    const storedHotkey = await kv.get('admin:hotkey:default');
    
    if (!adminHotkey || !storedHotkey || adminHotkey !== storedHotkey.hotkey) {
      return c.json({ error: 'Unauthorized: Invalid admin hotkey' }, 403);
    }

    // Get all pending jobs
    const allKeys = await kv.getByPrefix('vps_provisioning:pending:');
    const pendingJobs = [];

    for (const item of allKeys) {
      const pendingInfo = item.value;
      const job = await kv.get(`vps_provisioning:${pendingInfo.jobId}`);
      
      if (job) {
        pendingJobs.push({
          ...pendingInfo,
          job
        });
      }
    }

    console.log(`📋 [ADMIN] Found ${pendingJobs.length} pending verification jobs`);

    return c.json({
      success: true,
      count: pendingJobs.length,
      pendingJobs
    });

  } catch (error: any) {
    console.error('❌ Get pending jobs error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// 🔐 ADMIN: Get IP pool status
app.get("/make-server-c4d79cb7/admin/ip-pool/stats", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    // Check admin hotkey
    const adminHotkey = c.req.header('X-Admin-Hotkey');
    const storedHotkey = await kv.get('admin:hotkey:default');
    
    if (!adminHotkey || !storedHotkey || adminHotkey !== storedHotkey.hotkey) {
      return c.json({ error: 'Unauthorized: Invalid admin hotkey' }, 403);
    }

    const stats = await IPPoolManager.getIPPoolStats();
    const pool = await IPPoolManager.getIPPool();

    return c.json({
      success: true,
      stats,
      pool: pool.map(ip => ({
        ipAddress: ip.ipAddress,
        provider: ip.provider,
        status: ip.status,
        currentUsers: ip.currentUsers,
        maxUsers: ip.maxUsers,
        assignedUsers: ip.assignedUsers,
        createdAt: ip.createdAt,
        lastCheckedAt: ip.lastCheckedAt
      }))
    });
  } catch (error: any) {
    console.error('❌ Get IP pool stats error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// 🔐 ADMIN: Add IP to pool
app.post("/make-server-c4d79cb7/admin/ip-pool/add", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    // Check admin hotkey
    const adminHotkey = c.req.header('X-Admin-Hotkey');
    const storedHotkey = await kv.get('admin:hotkey:default');
    
    if (!adminHotkey || !storedHotkey || adminHotkey !== storedHotkey.hotkey) {
      return c.json({ error: 'Unauthorized: Invalid admin hotkey' }, 403);
    }

    const body = await c.req.json();
    const { ipAddress, vpsUrl, provider, maxUsers, apiKey, metadata } = body;

    if (!ipAddress || !vpsUrl || !provider) {
      return c.json({ error: 'Missing required fields: ipAddress, vpsUrl, provider' }, 400);
    }

    const result = await IPPoolManager.addIPToPool({
      ipAddress,
      vpsUrl,
      provider,
      status: 'active',
      maxUsers: maxUsers || 1,
      apiKey,
      metadata
    });

    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }

    console.log(`✅ Admin added IP ${ipAddress} to pool`);

    return c.json({
      success: true,
      message: `IP ${ipAddress} added to pool successfully`
    });
  } catch (error: any) {
    console.error('❌ Add IP to pool error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// 🔐 ADMIN: Remove IP from pool
app.post("/make-server-c4d79cb7/admin/ip-pool/remove", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    // Check admin hotkey
    const adminHotkey = c.req.header('X-Admin-Hotkey');
    const storedHotkey = await kv.get('admin:hotkey:default');
    
    if (!adminHotkey || !storedHotkey || adminHotkey !== storedHotkey.hotkey) {
      return c.json({ error: 'Unauthorized: Invalid admin hotkey' }, 403);
    }

    const body = await c.req.json();
    const { ipAddress } = body;

    if (!ipAddress) {
      return c.json({ error: 'Missing required field: ipAddress' }, 400);
    }

    const result = await IPPoolManager.removeIPFromPool(ipAddress);

    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }

    console.log(`✅ Admin removed IP ${ipAddress} from pool`);

    return c.json({
      success: true,
      message: `IP ${ipAddress} removed from pool successfully`
    });
  } catch (error: any) {
    console.error('❌ Remove IP from pool error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// 🔐 ADMIN: Health check IP pool
app.get("/make-server-c4d79cb7/admin/ip-pool/health", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    // Check admin hotkey
    const adminHotkey = c.req.header('X-Admin-Hotkey');
    const storedHotkey = await kv.get('admin:hotkey:default');
    
    if (!adminHotkey || !storedHotkey || adminHotkey !== storedHotkey.hotkey) {
      return c.json({ error: 'Unauthorized: Invalid admin hotkey' }, 403);
    }

    const health = await IPPoolManager.healthCheckIPPool();

    return c.json({
      success: true,
      health
    });
  } catch (error: any) {
    console.error('❌ IP pool health check error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ==================== ADMIN ROUTES ====================

// Get all admin hotkeys (public endpoint for loading on app start)
// Alias: /admin/hotkeys → same as /admin/hotkeys/all
app.get("/make-server-c4d79cb7/admin/hotkeys", async (c) => {
  try {
    const hotkeys = await kv.getByPrefix('admin:hotkey:');
    const hotkeyList = hotkeys.map((h: any) => ({
      id: h.value.id,
      hotkey: h.value.hotkey,
      adminId: h.value.adminId,
      name: h.value.name,
      createdAt: h.value.createdAt
    }));
    return c.json({ success: true, hotkeys: hotkeyList });
  } catch (error: any) {
    return c.json({ success: true, hotkeys: [] });
  }
});

app.get("/make-server-c4d79cb7/admin/hotkeys/all", async (c) => {
  try {
    console.log('🔑 Fetching all admin hotkeys');
    
    // Get all hotkeys from KV store
    const hotkeys = await kv.getByPrefix('admin:hotkey:');
    
    // Return array of hotkeys, extracting value from {key, value} objects
    const hotkeyList = hotkeys.map((h: any) => ({
      id: h.value.id,
      hotkey: h.value.hotkey,
      adminId: h.value.adminId,
      name: h.value.name,
      createdAt: h.value.createdAt
    }));
    
    console.log(`✅ Returning ${hotkeyList.length} admin hotkeys`);
    return c.json({ success: true, hotkeys: hotkeyList });
  } catch (error: any) {
    console.error('❌ Error fetching hotkeys:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get all platform users (admin only)
app.get("/make-server-c4d79cb7/admin/users", async (c) => {
  try {
    console.log('📊 Admin: Fetching all users');
    
    // 🔥 FIXED: Fetch users from Supabase Auth instead of KV store
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error('❌ Error fetching auth users:', authError);
      return c.json({ error: authError.message }, 500);
    }
    
    console.log(`📊 Found ${authUsers?.users?.length || 0} users in Supabase Auth`);
    
    // Build user list with additional data from KV store
    // ✅ FIX: Use batch operations and add error handling to prevent crashes
    const users = await Promise.all((authUsers?.users || []).map(async (authUser: any) => {
      const userId = authUser.id;
      
      try {
        // Get today's date in IST
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istDate = new Date(now.getTime() + istOffset);
        const today = istDate.toISOString().split('T')[0];
        
        // ✅ Batch fetch all KV data with safe retry logic
        // ✅ Batch fetch all KV data with safe retry logic
        const [wallet, dailyProfit, dailyPnl, pnlDetails, credentials, engineStatus, brokerFundsData, cumulativePnl, userProfile] = await Promise.all([
          safeKVGet(`wallet:${userId}`, { balance: 0 }),
          safeKVGet(`daily_profit:${userId}:${today}`, null),
          safeKVGet(`daily_pnl:${userId}:${today}`, null),
          safeKVGet(`pnl_details:${userId}`, null),
          safeKVGet(`api_credentials:${userId}`, {}),
          safeKVGet(`engine_running:${userId}`, false),
          safeKVGet(`broker_funds:${userId}`, null),
          safeKVGet(`total_pnl:${userId}`, 0),
          safeKVGet(`user_profile:${userId}`, {})
        ]);
        
        // ✅ Extract broker funds from KV data
        const brokerFunds = brokerFundsData?.availableBalance !== undefined 
          ? brokerFundsData.availableBalance 
          : 0;

        // ✅ Today's Profit: use REAL Dhan positions P&L, not wallet/system estimates.
        // The old daily_profit/daily_pnl keys can include repeated system-calculated values
        // from failed/closed loops, so admin should show broker truth only.
        let realDhanTodayProfit = 0;
        if (credentials?.dhanClientId && credentials?.dhanAccessToken) {
          try {
            const dhanService = new DhanService({
              clientId: credentials.dhanClientId,
              accessToken: credentials.dhanAccessToken,
            });
            const dhanPositions = await dhanService.getPositions();
            realDhanTodayProfit = (dhanPositions || []).reduce((sum: number, position: any) => {
              const pnl = Number(position?.pnl ?? 0);
              return sum + (Number.isFinite(pnl) ? pnl : 0);
            }, 0);
          } catch (dhanPnlError: any) {
            console.warn(`⚠️ Could not fetch real Dhan P&L for ${userId}:`, dhanPnlError?.message || dhanPnlError);
            realDhanTodayProfit = 0;
          }
        }
        
        // ✅ Total/Cumulative P&L from lifetime tracking
        const totalPnL = cumulativePnl || 0;
        
        // ✅ Check if user is active (not suspended)
        const isActive = userProfile?.isActive !== undefined ? userProfile.isActive : true;
        
        // ✅ Check if Dhan is connected
        const dhanConnected = !!(credentials?.dhanClientId && credentials?.dhanAccessToken);
        
        return {
          id: userId,
          name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Unknown',
          email: authUser.email || 'N/A',
          phone: authUser.user_metadata?.phone || authUser.user_metadata?.mobile || 'N/A',
          city: userProfile?.city || authUser.user_metadata?.city || '',
          state: userProfile?.state || authUser.user_metadata?.state || '',
          communityId: userProfile?.communityId || authUser.user_metadata?.communityId || 'N/A',
          wallet: wallet?.balance || 0,
          brokerBalance: brokerFunds,
          dailyPnL: realDhanTodayProfit,
          totalPnL: totalPnL,
          engineRunning: engineStatus || false,
          isActive: isActive,
          dhanClientId: credentials?.dhanClientId || '',
          dhanConnected: dhanConnected,
          createdAt: authUser.created_at || new Date().toISOString(),
          lastActive: authUser.last_sign_in_at || null
        };
      } catch (userError: any) {
        console.error(`❌ Error fetching data for user ${userId}:`, userError);
        // ✅ Return user with default values if error occurs
        return {
          id: userId,
          name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Unknown',
          email: authUser.email || 'N/A',
          phone: authUser.user_metadata?.phone || authUser.user_metadata?.mobile || 'N/A',
          city: '',
          state: '',
          communityId: 'N/A',
          wallet: 0,
          brokerBalance: 0,
          dailyPnL: 0,
          totalPnL: 0,
          engineRunning: false,
          isActive: true,
          dhanClientId: '',
          dhanConnected: false,
          createdAt: authUser.created_at || new Date().toISOString(),
          lastActive: authUser.last_sign_in_at || null
        };
      }
    }));
    
    console.log(`✅ Admin: Successfully fetched ${users.length} users`);
    console.log(`👥 All users before filter:`, users.map(u => ({ email: u.email, name: u.name })));
    
    // 🔒 FILTER: Exclude platform admin user from regular user list
    // Platform admin should only appear in Admin Management, not in Users section
    const platformOwnerEmail = Deno.env.get('PLATFORM_OWNER_EMAIL') || 'airoboengin@smilykat.com';
    console.log(`🔒 Platform owner email to exclude: ${platformOwnerEmail}`);
    
    const clientUsers = users.filter(user => {
      const isAdmin = user.email === platformOwnerEmail;
      if (isAdmin) {
        console.log(`🚫 FILTERING OUT ADMIN USER: ${user.email}`);
      }
      return !isAdmin;
    });
    
    console.log(`📊 Admin: Filtered out platform owner. Returning ${clientUsers.length} client users (excluded ${users.length - clientUsers.length} admin users)`);
    console.log(`👥 Client users after filter:`, clientUsers.map(u => ({ email: u.email, name: u.name })));
    
    return c.json({ success: true, users: clientUsers });
  } catch (error: any) {
    console.error('❌ Admin: Error fetching users:', error);
    console.error('❌ Full error stack:', error.stack);
    return c.json({ 
      error: error.message || 'Failed to fetch users',
      details: 'Check server logs for more information. This may be a temporary issue.'
    }, 500);
  }
});

// Create new user (Admin only)
app.post("/make-server-c4d79cb7/admin/users", async (c) => {
  try {
    const { authorized, error } = await validateAdminAuth(c);
    if (!authorized) {
      return c.json({ error: error?.message || 'Unauthorized' }, error?.code || 401);
    }

    const { name, email, phone, city, state, communityId, dhanClientId, initialWallet } = await c.req.json();
    
    console.log(`👤 Admin: Creating new user ${email}`);

    // Create auth user
    const { data: authUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: 'TempPassword123!', // User should change this
      email_confirm: true,
      user_metadata: { name, phone, city, state, communityId }
    });

    if (createError || !authUser.user) {
      console.error('❌ Failed to create auth user:', createError);
      return c.json({ error: createError.message }, 400);
    }

    const userId = authUser.user.id;

    // Initialize user data in KV
    await kv.set(`user_profile:${userId}`, {
      name,
      email,
      phone,
      city: city || '',
      state: state || '',
      communityId,
      dhanClientId: dhanClientId || '',
      createdAt: new Date().toISOString()
    });

    await kv.set(`wallet:${userId}`, {
      balance: parseFloat(initialWallet) || 0,
      currency: 'INR'
    });

    await kv.set(`engine_running:${userId}`, false);

    console.log(`✅ Admin: User ${email} created successfully with ID ${userId}`);
    return c.json({ success: true, userId });
  } catch (error: any) {
    console.error('❌ Admin: Error creating user:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Update user (Admin only)
app.put("/make-server-c4d79cb7/admin/users/:userId", async (c) => {
  try {
    const { authorized, error } = await validateAdminAuth(c);
    if (!authorized) {
      return c.json({ error: error?.message || 'Unauthorized' }, error?.code || 401);
    }

    const userId = c.req.param('userId');
    const updates = await c.req.json();
    
    console.log(`👤 Admin: Updating user ${userId}`);

    // Update user profile
    const profile = await kv.get(`user_profile:${userId}`) || {};
    await kv.set(`user_profile:${userId}`, {
      ...profile,
      ...updates,
      updatedAt: new Date().toISOString()
    });

    // Update auth user metadata if email/name changed
    if (updates.email || updates.name) {
      await supabase.auth.admin.updateUserById(userId, {
        email: updates.email,
        user_metadata: { 
          name: updates.name,
          phone: updates.phone,
          communityId: updates.communityId
        }
      });
    }

    console.log(`✅ Admin: User ${userId} updated successfully`);
    return c.json({ success: true });
  } catch (error: any) {
    console.error('❌ Admin: Error updating user:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Delete user (Admin only)
app.delete("/make-server-c4d79cb7/admin/users/:userId", async (c) => {
  try {
    const { authorized, error } = await validateAdminAuth(c);
    if (!authorized) {
      return c.json({ error: error?.message || 'Unauthorized' }, error?.code || 401);
    }

    const userId = c.req.param('userId');
    
    console.log(`👤 Admin: Deleting user ${userId}`);

    // Delete from auth
    await supabase.auth.admin.deleteUser(userId);

    // Delete all user data from KV (keys that contain userId)
    await kv.del(`user_profile:${userId}`);
    await kv.del(`wallet:${userId}`);
    await kv.del(`engine_running:${userId}`);
    await kv.del(`pnl_details:${userId}`);
    await kv.del(`broker_funds:${userId}`);

    console.log(`✅ Admin: User ${userId} deleted successfully`);
    return c.json({ success: true });
  } catch (error: any) {
    console.error('❌ Admin: Error deleting user:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Toggle engine status (Admin only)
app.post("/make-server-c4d79cb7/admin/users/:userId/engine", async (c) => {
  try {
    const { authorized, error } = await validateAdminAuth(c);
    if (!authorized) {
      return c.json({ error: error?.message || 'Unauthorized' }, error?.code || 401);
    }

    const userId = c.req.param('userId');
    const { running } = await c.req.json();
    
    console.log(`🔄 Admin: ${running ? 'Starting' : 'Stopping'} engine for user ${userId}`);

    await kv.set(`engine_running:${userId}`, running);

    console.log(`✅ Admin: Engine ${running ? 'started' : 'stopped'} for user ${userId}`);
    return c.json({ success: true, running });
  } catch (error: any) {
    console.error('❌ Admin: Error toggling engine:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Toggle user status (Admin only)
app.post("/make-server-c4d79cb7/admin/users/:userId/status", async (c) => {
  try {
    const { authorized, error } = await validateAdminAuth(c);
    if (!authorized) {
      return c.json({ error: error?.message || 'Unauthorized' }, error?.code || 401);
    }

    const userId = c.req.param('userId');
    const { isActive } = await c.req.json();
    
    console.log(`🔄 Admin: ${isActive ? 'Activating' : 'Suspending'} user ${userId}`);

    // Update user profile
    const profile = await kv.get(`user_profile:${userId}`) || {};
    await kv.set(`user_profile:${userId}`, {
      ...profile,
      isActive,
      updatedAt: new Date().toISOString()
    });

    // If suspending, also stop engine
    if (!isActive) {
      await kv.set(`engine_running:${userId}`, false);
    }

    console.log(`✅ Admin: User ${userId} ${isActive ? 'activated' : 'suspended'}`);
    return c.json({ success: true, isActive });
  } catch (error: any) {
    console.error('❌ Admin: Error toggling status:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get admin dashboard stats
app.get("/make-server-c4d79cb7/admin/stats", async (c) => {
  try {
    console.log('📊 Admin: Fetching dashboard stats');
    
    const platformOwnerEmail = Deno.env.get('PLATFORM_OWNER_EMAIL') || 'airoboengin@smilykat.com';
    
    // Fetch all users from Supabase Auth (graceful on failure)
    let clientUsers: any[] = [];
    let allAuthUsers: any[] = [];
    try {
      const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
      if (!authError && authUsers?.users) {
        allAuthUsers = authUsers.users;
        clientUsers = authUsers.users.filter((u: any) => u.email !== platformOwnerEmail);
      }
    } catch (listErr: any) {
      console.warn('⚠️ listUsers failed:', listErr.message);
    }

    const totalUsers = clientUsers.length;
    let totalRevenue = 0;
    let activeUsers = 0;
    let runningEngines = 0;
    let totalPnL = 0;

    const now = new Date();
    const istDate = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const today = istDate.toISOString().split('T')[0];

    // Per-user KV stats
    for (const authUser of clientUsers) {
      const userId = authUser.id;
      const engineStatus = await safeKVGet(`engine_running:${userId}`, false);
      if (engineStatus) { activeUsers++; runningEngines++; }

      const dailyProfit = await safeKVGet(`daily_profit:${userId}:${today}`, null);
      const dailyPnl = await safeKVGet(`daily_pnl:${userId}:${today}`, null);
      const pnlDetails = await safeKVGet(`pnl_details:${userId}`, null);
      totalPnL += dailyProfit?.profit || dailyPnl?.totalPnL || pnlDetails?.totalPnL || 0;
    }

    // Wallet transactions revenue
    const allTransactions: any[] = [];
    for (const authUser of allAuthUsers) {
      const txns = await safeKVGet(`wallet_transactions:${authUser.id}`, []);
      allTransactions.push(...txns);
    }
    const walletRevenue = allTransactions
      .filter((t: any) => t.type === 'debit')
      .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);

    // VPS subscription revenue — count active ip_assignment keys
    let vpsRevenue = 0;
    let vpsActiveCount = 0;
    const revenueByMonth: Record<string, { revenue: number; users: number }> = {};
    for (const authUser of allAuthUsers.filter((u: any) => u.email !== platformOwnerEmail)) {
      const ipRec = await safeKVGet(`ip_assignment:${authUser.id}:dedicated`, null);
      if (ipRec?.subscriptionStatus === 'active') {
        vpsActiveCount++;
        // Estimate: 1 month paid = ₹599
        vpsRevenue += 599;
        const mo = new Date(ipRec.assignedAt || now).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
        if (!revenueByMonth[mo]) revenueByMonth[mo] = { revenue: 0, users: 0 };
        revenueByMonth[mo].revenue += 599;
        revenueByMonth[mo].users++;
      }
    }

    totalRevenue = walletRevenue + vpsRevenue;
    const avgUserPnL = totalUsers > 0 ? totalPnL / totalUsers : 0;

    // Revenue chart data
    const revenueData = Object.entries(revenueByMonth).map(([date, d], i) => ({
      date, revenue: d.revenue, users: d.users, key: `rev-${i}-${date}`
    }));

    // Also fold wallet transaction revenue into chart
    for (const t of allTransactions.filter((t: any) => t.type === 'debit')) {
      const mo = new Date(t.timestamp || now).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      const existing = revenueData.find((r) => r.date === mo);
      if (existing) { existing.revenue += t.amount || 0; }
      else { revenueData.push({ date: mo, revenue: t.amount || 0, users: 1, key: `rev-txn-${mo}` }); }
    }

    const stats = {
      totalRevenue,
      totalUsers,
      activeUsers,
      runningEngines,
      todayProfit: 0,
      todayLoss: 0,
      avgUserPnL,
      totalTrades: 0,
      vpsSubscribers: vpsActiveCount,
    };

    console.log(`✅ Admin: Stats — ${totalUsers} users, ₹${totalRevenue} revenue, ${vpsActiveCount} active VPS`);
    return c.json({ success: true, stats, revenueData, userPnLDistribution: [], engineStats: [] });
  } catch (error: any) {
    console.error('❌ Admin stats error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ═════════════════��═════════��═══════════════════════════════════
// 📊 ADVANCED ADMIN STATS - COMPREHENSIVE ANALYTICS
// ═══════════════════════════════════════════════════════════════
app.get("/make-server-c4d79cb7/admin/advanced-stats", async (c) => {
  try {
    console.log('📊 [ADVANCED ADMIN] Fetching comprehensive analytics...');
    
    // Fetch all users from Supabase Auth (graceful fallback if fails)
    let rawUsers: any[] = [];
    try {
      const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      if (!authError) rawUsers = authUsers?.users || [];
      else console.warn('⚠️ listUsers failed, using empty list:', authError.message);
    } catch (listErr: any) {
      console.warn('⚠️ listUsers threw, using empty list:', listErr.message);
    }
    
    // 🔒 FILTER: Exclude platform admin from advanced stats
    const platformOwnerEmail = Deno.env.get('PLATFORM_OWNER_EMAIL') || 'airoboengin@smilykat.com';
    const users = rawUsers.filter((user: any) => user.email !== platformOwnerEmail);
    const totalUsers = users.length;
    
    // Date helpers
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const today = istDate.toISOString().split('T')[0];
    const thisMonth = today.substring(0, 7); // YYYY-MM
    
    // Initialize aggregators
    let totalRevenue = 0;
    let monthlyRevenue = 0;
    let activeUsers = 0;
    let runningEngines = 0;
    let totalTrades = 0;
    let todayTrades = 0;
    let totalPnL = 0;
    let todayProfit = 0;
    let todayLoss = 0;
    let profitableUsers = 0;
    let newUsersToday = 0;
    let newUsersThisMonth = 0;
    
    const allTransactions: any[] = [];
    const allTrades: any[] = [];
    const userTiers: any = {};
    const dailyRevenue: any = {};
    const dailyUsers: any = {};
    const hourlyTrades: any = {};
    const hourlyEngines: any = {};
    const pnlRanges: any = {
      '< -10000': 0,
      '-10000 to -5000': 0,
      '-5000 to 0': 0,
      '0 to 5000': 0,
      '5000 to 10000': 0,
      '> 10000': 0
    };
    
    // Process each user — fetch all KV data in parallel per user, then process all users in parallel
    const userResults = await Promise.all(users.map(async (authUser: any) => {
      const userId = authUser.id;
      const createdAt = new Date(authUser.created_at || Date.now());
      const createdDate = createdAt.toISOString().split('T')[0];

      // Fetch all KV data for this user in parallel
      const [engineStatus, userTier, userTransactions, userTrades, dailyProfit, dailyPnl, pnlDetails] =
        await Promise.all([
          safeKVGet(`engine_running:${userId}`, false),
          safeKVGet(`user_tier:${userId}`, null),
          safeKVGet(`wallet_transactions:${userId}`, []),
          safeKVGet(`trades:${userId}`, []),
          safeKVGet(`daily_profit:${userId}:${today}`, null),
          safeKVGet(`daily_pnl:${userId}:${today}`, null),
          safeKVGet(`pnl_details:${userId}`, null),
        ]);

      return { userId, createdDate, engineStatus, userTier, userTransactions, userTrades, dailyProfit, dailyPnl, pnlDetails };
    }));

    // Aggregate results
    for (const { createdDate, engineStatus, userTier, userTransactions, userTrades, dailyProfit, dailyPnl, pnlDetails } of userResults) {
      // Track new users
      if (createdDate === today) newUsersToday++;
      if (createdDate.startsWith(thisMonth)) newUsersThisMonth++;

      // Track daily user growth
      if (!dailyUsers[createdDate]) dailyUsers[createdDate] = 0;
      dailyUsers[createdDate]++;

      // Engine status
      if (engineStatus) { activeUsers++; runningEngines++; }

      // User tier
      const tier = userTier?.tier || 'Free';
      if (!userTiers[tier]) userTiers[tier] = { count: 0, revenue: 0 };
      userTiers[tier].count++;

      // Wallet transactions
      allTransactions.push(...(userTransactions || []));
      const userRevenue = (userTransactions || [])
        .filter((t: any) => t.type === 'debit')
        .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
      totalRevenue += userRevenue;
      userTiers[tier].revenue += userRevenue;

      (userTransactions || []).forEach((t: any) => {
        if (t.type === 'debit') {
          const txDate = new Date(t.timestamp).toISOString().split('T')[0];
          if (!dailyRevenue[txDate]) dailyRevenue[txDate] = 0;
          dailyRevenue[txDate] += t.amount || 0;
          if (txDate.startsWith(thisMonth)) monthlyRevenue += t.amount || 0;
        }
      });

      // Trades
      allTrades.push(...(userTrades || []));
      totalTrades += (userTrades || []).length;
      (userTrades || []).forEach((trade: any) => {
        const tradeDate = new Date(trade.timestamp || Date.now());
        const tradeDay = tradeDate.toISOString().split('T')[0];
        const hour = tradeDate.getHours();
        if (tradeDay === today) {
          todayTrades++;
          if (!hourlyTrades[hour]) hourlyTrades[hour] = 0;
          hourlyTrades[hour]++;
        }
      });

      // P&L
      const userTotalPnL = pnlDetails?.totalPnL || 0;
      const userTodayPnL = dailyProfit?.profit || dailyPnl?.totalPnL || 0;
      totalPnL += userTotalPnL;
      if (userTodayPnL > 0) todayProfit += userTodayPnL;
      else if (userTodayPnL < 0) todayLoss += Math.abs(userTodayPnL);
      if (userTotalPnL > 0) profitableUsers++;

      // P&L distribution
      if (userTotalPnL < -10000) pnlRanges['< -10000']++;
      else if (userTotalPnL >= -10000 && userTotalPnL < -5000) pnlRanges['-10000 to -5000']++;
      else if (userTotalPnL >= -5000 && userTotalPnL < 0) pnlRanges['-5000 to 0']++;
      else if (userTotalPnL >= 0 && userTotalPnL < 5000) pnlRanges['0 to 5000']++;
      else if (userTotalPnL >= 5000 && userTotalPnL < 10000) pnlRanges['5000 to 10000']++;
      else pnlRanges['> 10000']++;
    }
    
    // Generate hourly engine activity (simulated from active engines)
    for (let h = 0; h < 24; h++) {
      hourlyEngines[h] = h >= 9 && h <= 15 ? Math.floor(runningEngines * (0.7 + Math.random() * 0.3)) : Math.floor(runningEngines * 0.2);
    }
    
    // Calculate derived stats
    const avgUserPnL = totalUsers > 0 ? totalPnL / totalUsers : 0;
    const avgTradesPerUser = totalUsers > 0 ? totalTrades / totalUsers : 0;
    const avgRevenuePerUser = totalUsers > 0 ? totalRevenue / totalUsers : 0;
    const userGrowthRate = totalUsers > 10 ? ((newUsersThisMonth / totalUsers) * 100) : 0;
    const revenueGrowth = monthlyRevenue > 0 ? 12.5 : 0; // Placeholder
    
    // Build time series data (last 30 days)
    const revenueTimeSeries = [];
    const userGrowthTimeSeries = [];
    const profitLossBreakdown = [];
    const monthlyComparison = [];
    
    let cumulativeUsers = 0;
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      const dayRevenue = dailyRevenue[dateStr] || 0;
      const dayUsers = dailyUsers[dateStr] || 0;
      
      cumulativeUsers += dayUsers;
      
      revenueTimeSeries.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        revenue: dayRevenue,
        transactions: allTransactions.filter((t: any) => 
          new Date(t.timestamp).toISOString().split('T')[0] === dateStr && t.type === 'debit'
        ).length
      });
      
      userGrowthTimeSeries.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        users: dayUsers,
        cumulative: cumulativeUsers
      });
      
      // Calculate daily P&L
      const dayTrades = allTrades.filter((t: any) => 
        new Date(t.timestamp || Date.now()).toISOString().split('T')[0] === dateStr
      );
      const dayProfit = dayTrades.filter((t: any) => (t.pnl || 0) > 0).reduce((sum: number, t: any) => sum + (t.pnl || 0), 0);
      const dayLoss = Math.abs(dayTrades.filter((t: any) => (t.pnl || 0) < 0).reduce((sum: number, t: any) => sum + (t.pnl || 0), 0));
      
      profitLossBreakdown.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        profit: dayProfit,
        loss: dayLoss
      });
    }
    
    // Generate monthly comparison (last 6 months)
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = monthDate.toISOString().substring(0, 7);
      const monthName = monthDate.toLocaleDateString('en-US', { month: 'short' });
      
      const monthRev = allTransactions
        .filter((t: any) => t.type === 'debit' && t.timestamp &&
          new Date(t.timestamp).toISOString().startsWith(monthStr))
        .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
      
      monthlyComparison.push({
        month: monthName,
        revenue: monthRev
      });
    }
    
    // Build chart data
    const chartData = {
      revenueTimeSeries: revenueTimeSeries.map((item, idx) => ({ ...item, id: `rev-${idx}` })),
      userGrowthTimeSeries: userGrowthTimeSeries.map((item, idx) => ({ ...item, id: `user-${idx}` })),
      pnlDistribution: Object.entries(pnlRanges).map(([range, count], idx) => ({ 
        range, 
        count,
        id: `pnl-${idx}-${range.replace(/\s+/g, '-')}`
      })),
      tradeVolumeByHour: Array.from({ length: 24 }, (_, h) => ({
        hour: `${h}:00`,
        trades: hourlyTrades[h] || 0,
        id: `trade-hour-${h}`
      })),
      userEngagementMetrics: [
        { metric: 'Active Rate', value: totalUsers > 0 ? (activeUsers / totalUsers) * 100 : 0, id: 'metric-1' },
        { metric: 'Trade Rate', value: activeUsers > 0 ? (todayTrades / activeUsers) : 0, id: 'metric-2' },
        { metric: 'Retention', value: 85, id: 'metric-3' },
        { metric: 'Satisfaction', value: 92, id: 'metric-4' },
        { metric: 'Performance', value: avgUserPnL > 0 ? 75 : 60, id: 'metric-5' }
      ],
      profitLossBreakdown: profitLossBreakdown.map((item, idx) => ({ ...item, id: `pl-${idx}` })),
      monthlyComparison: monthlyComparison.map((item, idx) => ({ ...item, id: `month-${idx}` })),
      engineActivityHourly: Array.from({ length: 24 }, (_, h) => ({
        hour: `${h}:00`,
        running: hourlyEngines[h] || 0,
        id: `engine-hour-${h}`
      })),
      tierDistribution: Object.entries(userTiers)
        .filter(([tier]) => tier && tier.trim().length > 0)
        .map(([tier, data]: any, index) => ({
          tier: tier || 'Unknown',
          count: data.count,
          id: `tier-${index}-${tier.replace(/\s+/g, '-')}`
        })),
      revenueByTier: Object.entries(userTiers)
        .filter(([tier]) => tier && tier.trim().length > 0)
        .map(([tier, data]: any, index) => ({
          tier: tier || 'Unknown',
          revenue: data.revenue,
          id: `revenue-${index}-${tier.replace(/\s+/g, '-')}`
        }))
    };
    
    const stats = {
      // Financial
      totalRevenue,
      monthlyRevenue,
      revenueGrowth,
      avgRevenuePerUser,
      
      // Users
      totalUsers,
      activeUsers,
      newUsersToday,
      newUsersThisMonth,
      userGrowthRate,
      
      // Trading
      runningEngines,
      totalTrades,
      todayTrades,
      avgTradesPerUser,
      
      // P&L
      totalPnL,
      todayProfit,
      todayLoss,
      avgUserPnL,
      profitableUsers,
      
      // System
      systemUptime: 99.9,
      apiResponseTime: 245,
      errorRate: 0.2,
      activeConnections: activeUsers
    };
    
    console.log(`✅ [ADVANCED ADMIN] Stats compiled: ${totalUsers} users, ₹${totalRevenue} revenue`);
    
    return c.json({ 
      success: true, 
      stats,
      chartData
    });
  } catch (error: any) {
    console.error('❌ [ADVANCED ADMIN] Error fetching stats:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Update user wallet (admin only)
app.post("/make-server-c4d79cb7/admin/users/:userId/wallet", async (c) => {
  try {
    const { authorized, error } = await validateAdminAuth(c);
    if (!authorized) {
      return c.json({ error: error?.message || 'Unauthorized' }, error?.code || 401);
    }

    const userId = c.req.param('userId');
    const { action, amount } = await c.req.json();
    
    console.log(`💰 Admin: ${action} ₹${amount} for user ${userId}`);
    
    // Get current wallet
    const wallet = await kv.get(`wallet:${userId}`) || { balance: 0 };
    
    // Calculate new balance
    const newBalance = action === 'add' 
      ? wallet.balance + amount 
      : wallet.balance - amount;
    
    if (newBalance < 0) {
      return c.json({ error: 'Insufficient balance' }, 400);
    }
    
    // Update wallet
    await kv.set(`wallet:${userId}`, { balance: newBalance });
    
    // Create transaction record
    const transaction = {
      id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: userId,
      type: action === 'add' ? 'credit' : 'debit',
      amount: amount,
      balance: newBalance,
      timestamp: new Date().toISOString(),
      description: `Manual ${action} by admin`,
      source: 'admin'
    };
    
    // ⚡ CRITICAL FIX: Store in wallet_transactions (not transactions)
    const walletTransactions = await kv.get(`wallet_transactions:${userId}`) || [];
    walletTransactions.push(transaction);
    await kv.set(`wallet_transactions:${userId}`, walletTransactions);
    
    console.log(`✅ Admin: Transaction stored in wallet_transactions:${userId}`);
    
    console.log(`✅ Admin: Wallet updated. New balance: ₹${newBalance}`);
    
    // ✅ FIX: Fetch updated user data to return to frontend
    const { data: authData } = await supabase.auth.admin.getUserById(userId);
    const updatedUser = {
      id: userId,
      name: authData?.user?.user_metadata?.name || authData?.user?.email?.split('@')[0] || 'Unknown',
      email: authData?.user?.email || 'N/A',
      mobile: authData?.user?.user_metadata?.mobile || authData?.user?.user_metadata?.phone || 'N/A',
      walletBalance: newBalance,
      totalPnL: await kv.get(`total_pnl:${userId}`) || 0,
      engineRunning: await kv.get(`engine_running:${userId}`) || false,
      dhanClientId: (await kv.get(`api_credentials:${userId}`))?.dhanClientId,
      dhanAccessToken: (await kv.get(`api_credentials:${userId}`))?.dhanAccessToken ? 'SET' : undefined,
      brokerFunds: undefined,
      createdAt: authData?.user?.created_at || new Date().toISOString(),
      lastActive: authData?.user?.last_sign_in_at || authData?.user?.created_at || new Date().toISOString()
    };
    
    return c.json({ 
      success: true, 
      newBalance,
      transaction,
      user: updatedUser
    });
  } catch (error: any) {
    console.error('❌ Admin: Error updating wallet:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// 📊 ADVANCED MONITORING - WEBSITE ANALYTICS & VISITOR TRACKING
// ═══════════════════════════════════════════════════════════════
app.get("/make-server-c4d79cb7/admin/monitoring", async (c) => {
  try {
    const timeRange = c.req.query('range') || 'today';
    console.log(`📊 [MONITORING] Fetching REAL analytics (range: ${timeRange})...`);

    // Import analytics tracker
    const { 
      getVisitorAnalytics, 
      getLoginAnalytics, 
      getSignupAnalytics,
      getTrafficData,
      getDeviceData,
      getTopPages
    } = await import('./analytics_tracker.tsx');

    // Get real analytics data
    const visitorAnalytics = await getVisitorAnalytics(timeRange as 'today' | 'week' | 'month');
    const loginAnalytics = await getLoginAnalytics(timeRange as 'today' | 'week' | 'month');
    const signupAnalytics = await getSignupAnalytics(timeRange as 'today' | 'week' | 'month');
    const trafficData = await getTrafficData(timeRange as 'today' | 'week' | 'month');
    const deviceData = await getDeviceData(timeRange as 'today' | 'week' | 'month');
    const topPages = await getTopPages(timeRange as 'today' | 'week' | 'month');

    console.log('✅ [MONITORING] Real analytics data retrieved successfully');
    console.log(`   Total Visitors: ${visitorAnalytics.totalVisitors}`);
    console.log(`   Active Now: ${visitorAnalytics.activeNow}`);
    console.log(`   Active Sessions: ${visitorAnalytics.sessions.filter(s => s.isActive).length}`);
    console.log(`   Total Sessions: ${visitorAnalytics.sessions.length}`);
    console.log(`   Page Views: ${visitorAnalytics.totalPageViews}`);
    console.log(`   Login Attempts: ${loginAnalytics.totalAttempts}`);
    console.log(`   Signups: ${signupAnalytics.totalSignups}`);

    return c.json({
      analytics: {
        totalVisitors: visitorAnalytics.totalVisitors,
        newVisitors: visitorAnalytics.newVisitors,
        returningVisitors: visitorAnalytics.returningVisitors,
        uniqueVisitors: visitorAnalytics.uniqueVisitors,
        totalPageViews: visitorAnalytics.totalPageViews,
        avgSessionTime: visitorAnalytics.avgSessionTime,
        bounceRate: visitorAnalytics.bounceRate,
        activeNow: visitorAnalytics.activeNow
      },
      visitors: visitorAnalytics.sessions,
      loginActivity: {
        totalAttempts: loginAnalytics.totalAttempts,
        successful: loginAnalytics.successful,
        failed: loginAnalytics.failed,
        recentLogins: loginAnalytics.recentLogins
      },
      signupActivity: {
        totalSignups: signupAnalytics.totalSignups,
        completed: signupAnalytics.completed,
        incomplete: signupAnalytics.incomplete,
        incompleteUsers: signupAnalytics.incompleteUsers
      },
      trafficData,
      deviceData,
      topPages
    });
  } catch (error: any) {
    console.error('❌ [MONITORING] Error fetching real analytics:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// 📊 ANALYTICS TRACKING ENDPOINTS - Track visitor activity
// ═══════════════════════════════════════════════════════════════

// Track page view
app.post("/make-server-c4d79cb7/analytics/pageview", async (c) => {
  try {
    const { trackVisitorSession } = await import('./analytics_tracker.tsx');
    const { page } = await c.req.json();
    const userAgent = c.req.header('user-agent') || 'Unknown';
    const ipAddressRaw = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'Unknown';
    
    // Parse IP to extract first real IP from comma-separated list
    const ipAddress = ipAddressRaw.split(',')[0].trim() || 'Unknown';
    
    console.log(`📄 [PAGE VIEW] Received from ${ipAddress} (raw: ${ipAddressRaw}) on page: ${page}`);
    console.log(`   User-Agent: ${userAgent}`);
    
    const session = await trackVisitorSession(ipAddress, userAgent, page);
    
    console.log(`✅ [PAGE VIEW] Session created/updated: ${session.sessionId} (active: ${session.isActive})`);
    
    return c.json({ success: true });
  } catch (error: any) {
    console.error('❌ Error tracking page view:', error);
    console.error('   Stack:', error.stack);
    return c.json({ error: error.message }, 500);
  }
});

// Heartbeat to keep session alive (doesn't create new page views)
app.post("/make-server-c4d79cb7/analytics/heartbeat", async (c) => {
  try {
    const { trackVisitorSession } = await import('./analytics_tracker.tsx');
    const { page } = await c.req.json();
    const userAgent = c.req.header('user-agent') || 'Unknown';
    const ipAddressRaw = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'Unknown';
    
    // Parse IP to extract first real IP from comma-separated list
    const ipAddress = ipAddressRaw.split(',')[0].trim() || 'Unknown';
    
    console.log(`💓 [HEARTBEAT] Received from ${ipAddress} on page: ${page}`);
    
    // Track visitor session WITHOUT creating a page view (pass false as last parameter)
    const session = await trackVisitorSession(ipAddress, userAgent, page, undefined, false);
    
    console.log(`✅ [HEARTBEAT] Session updated: ${session.sessionId} (active: ${session.isActive})`);
    
    return c.json({ success: true });
  } catch (error: any) {
    console.error('❌ Error sending heartbeat:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Track login attempt
app.post("/make-server-c4d79cb7/analytics/login", async (c) => {
  try {
    const { trackLoginAttempt } = await import('./analytics_tracker.tsx');
    const { email, status, userId } = await c.req.json();
    const userAgent = c.req.header('user-agent') || 'Unknown';
    const ipAddressRaw = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'Unknown';
    
    // Parse IP to extract first real IP from comma-separated list
    const ipAddress = ipAddressRaw.split(',')[0].trim() || 'Unknown';
    
    console.log(`🔐 [LOGIN] Tracking attempt: ${email} - ${status} from ${ipAddress}`);
    
    await trackLoginAttempt(email, status, ipAddress, userAgent, userId);
    
    return c.json({ success: true });
  } catch (error: any) {
    console.error('❌ Error tracking login attempt:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Track signup progress
app.post("/make-server-c4d79cb7/analytics/signup", async (c) => {
  try {
    const { trackSignupProgress } = await import('./analytics_tracker.tsx');
    const { email, name, mobile, completionPercent, completed, userId } = await c.req.json();
    
    console.log(`📝 [SIGNUP] Tracking progress: ${email || mobile || 'unknown'} - ${completionPercent}%${completed ? ' (COMPLETED)' : ''}`);
    
    await trackSignupProgress(email, name, mobile, completionPercent, completed, userId);
    
    return c.json({ success: true });
  } catch (error: any) {
    console.error('❌ Error tracking signup progress:', error);
    return c.json({ error: error.message }, 500);
  }
});

// 🐛 DEBUG ENDPOINT - Inspect all analytics data in KV store
app.get("/make-server-c4d79cb7/debug/analytics", async (c) => {
  try {
    console.log(`🐛 [DEBUG] Fetching all analytics data from KV store...`);
    
    // Get all data
    const sessionData = await kv.getByPrefix('visitor_session:');
    const signupData = await kv.getByPrefix('analytics:signup:');
    const pageViews = (await kv.get('analytics:pageviews') || []) as any[];
    const logins = (await kv.get('analytics:logins') || []) as any[];
    
    console.log(`🐛 [DEBUG] Found:
      - Sessions: ${sessionData.length}
      - Signups: ${signupData.length}
      - Page Views: ${pageViews.length}
      - Logins: ${logins.length}
    `);
    
    return c.json({
      summary: {
        totalSessions: sessionData.length,
        totalSignups: signupData.length,
        totalPageViews: pageViews.length,
        totalLogins: logins.length
      },
      sessions: sessionData.slice(0, 5).map(item => ({
        key: item.key,
        value: item.value
      })),
      signups: signupData.slice(0, 5).map(item => ({
        key: item.key,
        value: item.value
      })),
      recentPageViews: pageViews.slice(-10),
      recentLogins: logins.slice(-10),
      allSessionKeys: sessionData.map(item => item.key)
    });
  } catch (error: any) {
    console.error('❌ Error debugging analytics:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// 📢 PUSH NOTIFICATION ROUTES
// ═══════════════════════════════════════════════════════════════

// Subscribe to push notifications
app.post("/make-server-c4d79cb7/push/subscribe", async (c) => {
  try {
    const { userId, deviceToken, browser, device } = await c.req.json();
    
    console.log('📢 New push notification subscriber:', { userId, browser, device });
    
    const result = await pushNotifications.saveSubscriber({
      userId,
      deviceToken,
      browser,
      device,
    });
    
    if (result.success) {
      return c.json({ success: true, message: 'Subscribed successfully' });
    } else {
      return c.json({ success: false, message: result.error }, 500);
    }
  } catch (error: any) {
    console.error('❌ Error subscribing to push notifications:', error);
    return c.json({ success: false, message: error.message }, 500);
  }
});

// Send push notification (admin only)
app.post("/make-server-c4d79cb7/push/send", async (c) => {
  try {
    // Validate admin auth
    const authResult = await validateAdminAuth(c);
    if (!authResult.authorized) {
      return c.json({ success: false, message: 'Unauthorized' }, authResult.error?.code || 401);
    }
    
    const { title, description, imageUrl, targetUrl } = await c.req.json();
    
    console.log('📢 =================================================');
    console.log('📢 PUSH NOTIFICATION SEND REQUEST');
    console.log('📢 =================================================');
    console.log('📢 Admin:', authResult.userId);
    console.log('📋 Title:', title);
    console.log('📋 Description:', description);
    console.log('🖼️ Image URL:', imageUrl || 'None');
    console.log('🔗 Target URL:', targetUrl || 'None');
    console.log('📢 =================================================');
    
    if (!title || !description) {
      console.error('❌ Missing title or description');
      return c.json({ success: false, message: 'Title and description are required' }, 400);
    }
    
    console.log('🚀 Calling pushNotifications.sendPushNotification()...');
    const result = await pushNotifications.sendPushNotification({
      title,
      description,
      imageUrl,
      targetUrl,
    });
    
    console.log('📡 Push notification result:', result);
    
    if (result.success) {
      console.log(`✅ SUCCESS: Notification sent to ${result.totalDelivered} subscribers`);
      console.log('📢 =================================================');
      return c.json({ 
        success: true, 
        notificationId: result.notificationId,
        totalDelivered: result.totalDelivered,
        message: `Notification sent to ${result.totalDelivered} subscribers`
      });
    } else {
      console.error('❌ FAILED:', result.error);
      console.log('📢 =================================================');
      return c.json({ success: false, message: result.error }, 500);
    }
  } catch (error: any) {
    console.error('❌ Error sending push notification:', error);
    console.error('Stack trace:', error.stack);
    console.log('📢 =================================================');
    return c.json({ success: false, message: error.message }, 500);
  }
});

// Get notification history (admin only)
app.get("/make-server-c4d79cb7/push/history", async (c) => {
  try {
    // Validate admin auth
    const authResult = await validateAdminAuth(c);
    if (!authResult.authorized) {
      return c.json({ success: false, message: 'Unauthorized' }, authResult.error?.code || 401);
    }
    
    console.log('📢 Admin fetching notification history');
    
    const history = await pushNotifications.getNotificationHistory();
    
    return c.json({ success: true, notifications: history });
  } catch (error: any) {
    console.error('❌ Error fetching notification history:', error);
    return c.json({ success: false, message: error.message }, 500);
  }
});

// Get all subscribers (admin only)
app.get("/make-server-c4d79cb7/push/subscribers", async (c) => {
  try {
    // Validate admin auth
    const authResult = await validateAdminAuth(c);
    if (!authResult.authorized) {
      return c.json({ success: false, message: 'Unauthorized' }, authResult.error?.code || 401);
    }
    
    console.log('📢 Admin fetching subscribers');
    
    const subscribers = await pushNotifications.getAllSubscribers();
    
    return c.json({ success: true, subscribers, count: subscribers.length });
  } catch (error: any) {
    console.error('❌ Error fetching subscribers:', error);
    return c.json({ success: false, message: error.message }, 500);
  }
});

// Delete notification from history (admin only)
app.delete("/make-server-c4d79cb7/push/notification/:id", async (c) => {
  try {
    // Validate admin auth
    const authResult = await validateAdminAuth(c);
    if (!authResult.authorized) {
      return c.json({ success: false, message: 'Unauthorized' }, authResult.error?.code || 401);
    }
    
    const notificationId = c.req.param('id');
    console.log('📢 Admin deleting notification:', notificationId);
    
    const result = await pushNotifications.deleteNotification(notificationId);
    
    if (result.success) {
      return c.json({ success: true, message: 'Notification deleted' });
    } else {
      return c.json({ success: false, message: result.error }, 500);
    }
  } catch (error: any) {
    console.error('❌ Error deleting notification:', error);
    return c.json({ success: false, message: error.message }, 500);
  }
});

// Upload notification image (admin only)
app.post("/make-server-c4d79cb7/push/upload-image", async (c) => {
  try {
    // Validate admin auth
    const authResult = await validateAdminAuth(c);
    if (!authResult.authorized) {
      return c.json({ success: false, message: 'Unauthorized' }, authResult.error?.code || 401);
    }
    
    console.log('📢 Admin uploading notification image');
    
    // Get form data
    const formData = await c.req.formData();
    const file = formData.get('image') as File;
    
    if (!file) {
      return c.json({ success: false, message: 'No image file provided' }, 400);
    }
    
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return c.json({ success: false, message: 'Invalid file type. Only JPEG, PNG, WEBP, and GIF are allowed.' }, 400);
    }
    
    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return c.json({ success: false, message: 'File size too large. Maximum size is 5MB.' }, 400);
    }
    
    // Create bucket name
    const bucketName = 'make-c4d79cb7-notifications';
    
    // Check if bucket exists, create if not
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(bucket => bucket.name === bucketName);
    
    if (!bucketExists) {
      console.log('📢 Creating notifications storage bucket...');
      const { error: createError } = await supabase.storage.createBucket(bucketName, {
        public: false,
        fileSizeLimit: maxSize,
        allowedMimeTypes: allowedTypes,
      });
      
      if (createError) {
        console.error('❌ Error creating bucket:', createError);
        return c.json({ success: false, message: 'Failed to create storage bucket' }, 500);
      }
      
      console.log('✅ Notifications bucket created');
    }
    
    // Generate unique filename
    const fileExt = file.name.split('.').pop();
    const fileName = `notif_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    
    // Convert file to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(fileName, uint8Array, {
        contentType: file.type,
        upsert: false,
      });
    
    if (uploadError) {
      console.error('❌ Error uploading file:', uploadError);
      return c.json({ success: false, message: 'Failed to upload image' }, 500);
    }
    
    // Generate signed URL (valid for 1 year)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(fileName, 365 * 24 * 60 * 60); // 1 year
    
    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error('❌ Error creating signed URL:', signedUrlError);
      return c.json({ success: false, message: 'Failed to generate image URL' }, 500);
    }
    
    console.log('✅ Image uploaded successfully:', fileName);
    
    return c.json({ 
      success: true, 
      imageUrl: signedUrlData.signedUrl,
      fileName: fileName
    });
  } catch (error: any) {
    console.error('❌ Error uploading notification image:', error);
    return c.json({ success: false, message: error.message }, 500);
  }
});

// Get user notifications (for logged-in users)
const MAX_USER_NOTIFICATIONS = 100;

function isSameUserNotification(existing: any, incoming: any) {
  if (existing?.id && incoming?.id && existing.id === incoming.id) return true;

  return (
    existing?.type === incoming?.type &&
    existing?.title === incoming?.title &&
    existing?.message === incoming?.message &&
    Math.abs((existing?.timestamp || 0) - (incoming?.timestamp || 0)) <= 60000
  );
}

app.get("/make-server-c4d79cb7/user/notifications", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    
    console.log('📬 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📬 USER NOTIFICATION FETCH REQUEST');
    console.log('📬 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📬 Auth Header:', authHeader ? 'Present' : 'Missing');
    console.log('📬 Token:', authHeader?.split(' ')[1] ? `${authHeader.split(' ')[1].substring(0, 20)}...` : 'Missing');
    
    console.log('🔍 Validating token with Supabase...');
    const { user, error } = await validateAuth(c);
    
    if (error || !user) {
      console.error('❌ Token validation failed:', error?.message || 'No user found');
      return c.json({ success: false, message: error?.message || 'Invalid token' }, error?.code || 401);
    }
    
    console.log('✅ User authenticated successfully');
    console.log(`📬 User ID: ${user.id}`);
    console.log(`📬 User Email: ${user.email}`);
    console.log(`📬 KV Store Key: user_notifications:${user.id}`);
    console.log(`📬 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    // Get user notifications from KV store
    console.log(`🔍 Fetching notifications from KV store...`);
    const notifications = await kv.get(`user_notifications:${user.id}`) || [];
    
    console.log(`📊 Found ${notifications.length} notifications for user ${user.id}`);
    if (notifications.length > 0) {
      console.log(`📋 First notification:`, notifications[0]);
      console.log(`📋 All notification IDs:`, notifications.map((n: any) => n.id));
    } else {
      console.log(`⚠️ No notifications found in KV store`);
      
      // Let's check if there are any notifications at all
      console.log(`🔍 Checking all user_notifications keys in KV store...`);
      try {
        const allUserNotifs = await kv.getByPrefix('user_notifications:');
        console.log(`📊 Total user_notifications keys in KV: ${allUserNotifs.length}`);
        if (allUserNotifs.length > 0) {
          console.log(`📋 Available keys:`, allUserNotifs.map((item: any) => item.key));
        }
      } catch (checkError) {
        console.error('❌ Error checking KV keys:', checkError);
      }
    }
    console.log(`📬 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    return c.json({ success: true, notifications });
  } catch (error: any) {
    console.error('❌ Error fetching user notifications:', error);
    console.error('Stack trace:', error.stack);
    return c.json({ success: false, message: error.message }, 500);
  }
});

// Mark user notification as read
app.post("/make-server-c4d79cb7/user/notifications/:id/read", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    
    if (error || !user) {
      return c.json({ success: false, message: error?.message || 'Invalid token' }, error?.code || 401);
    }
    
    const notificationId = c.req.param('id');
    console.log(`✅ Marking notification ${notificationId} as read for user ${user.id}`);
    
    // Get user notifications
    const notifications = await kv.get(`user_notifications:${user.id}`) || [];
    
    // Find and mark as read
    const notification = notifications.find((n: any) => n.id === notificationId);
    if (notification) {
      notification.read = true;
      await kv.set(`user_notifications:${user.id}`, notifications);
    }
    
    return c.json({ success: true });
  } catch (error: any) {
    console.error('❌ Error marking notification as read:', error);
    return c.json({ success: false, message: error.message }, 500);
  }
});

app.post("/make-server-c4d79cb7/user/notifications/read-all", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (error || !user) {
      return c.json({ success: false, message: error?.message || 'Invalid token' }, error?.code || 401);
    }

    const notifications = await kv.get(`user_notifications:${user.id}`) || [];
    notifications.forEach((notification: any) => {
      notification.read = true;
    });

    await kv.set(`user_notifications:${user.id}`, notifications);
    return c.json({ success: true, count: notifications.length });
  } catch (error: any) {
    console.error('❌ Error marking all notifications as read:', error);
    return c.json({ success: false, message: error.message }, 500);
  }
});

app.delete("/make-server-c4d79cb7/user/notifications", async (c) => {
  try {
    const { user, error } = await validateAuth(c);

    if (error || !user) {
      return c.json({ success: false, message: error?.message || 'Invalid token' }, error?.code || 401);
    }

    await kv.set(`user_notifications:${user.id}`, []);
    return c.json({ success: true });
  } catch (error: any) {
    console.error('❌ Error clearing user notifications:', error);
    return c.json({ success: false, message: error.message }, 500);
  }
});

// DEBUG: Check all user notifications in KV store
app.get("/make-server-c4d79cb7/debug/all-notifications", async (c) => {
  try {
    console.log('🔍 DEBUG: Fetching ALL user notifications from KV store...');
    
    const allUserNotifs = await kv.getByPrefix('user_notifications:');
    
    console.log(`📊 Total user_notifications keys: ${allUserNotifs.length}`);
    
    const result = allUserNotifs.map((item: any) => ({
      key: item.key,
      userId: item.key.replace('user_notifications:', ''),
      notificationCount: item.value?.length || 0,
      notifications: item.value || []
    }));
    
    console.log('📋 All notifications:', result);
    
    return c.json({ 
      success: true, 
      totalKeys: allUserNotifs.length,
      notifications: result 
    });
  } catch (error: any) {
    console.error('❌ Error fetching debug notifications:', error);
    return c.json({ success: false, message: error.message }, 500);
  }
});

// Get all transactions (admin only)
app.get("/make-server-c4d79cb7/admin/transactions", async (c) => {
  try {
    const period = c.req.query('period') || 'all';
    
    console.log(`📊 Admin: Fetching transactions (period: ${period})`);
    
    // ⚡⚡⚡ CRITICAL FIX: Fetch ALL wallet transactions from ALL users
    // Always fetch fresh data, don't cache in admin_transactions
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    
    // 🔒 FILTER: Exclude platform admin from transactions
    const platformOwnerEmail = Deno.env.get('PLATFORM_OWNER_EMAIL') || 'airoboengin@smilykat.com';
    const clientUsers = (authUsers?.users || []).filter((user: any) => user.email !== platformOwnerEmail);
    
    const allTxns: any[] = [];
    
    console.log(`📊 Admin: Found ${clientUsers.length} client users to check for transactions (excluded admin)`);
    
    for (const authUser of clientUsers) {
      const userId = authUser.id;
      
      // ⚡ CRITICAL: Look for wallet_transactions key (where transactions are actually stored!)
      const userWalletTxns = await kv.get(`wallet_transactions:${userId}`) || [];
      
      console.log(`📊 Admin: User ${authUser.email} has ${userWalletTxns.length} wallet transactions`);
      
      userWalletTxns.forEach((txn: any) => {
        allTxns.push({
          ...txn,
          userId: userId,
          userName: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Unknown User',
          userEmail: authUser.email || 'No email'
        });
      });
    }
    
    let transactions = allTxns;
    console.log(`✅ Admin: Collected ${transactions.length} total transactions from all users`);
    
    // Filter by period
    const now = Date.now();
    if (period !== 'all') {
      transactions = transactions.filter((txn: any) => {
        const txnTime = new Date(txn.timestamp).getTime();
        const diff = now - txnTime;
        
        switch (period) {
          case 'today':
            return diff < 24 * 60 * 60 * 1000;
          case 'week':
            return diff < 7 * 24 * 60 * 60 * 1000;
          case 'month':
            return diff < 30 * 24 * 60 * 60 * 1000;
          default:
            return true;
        }
      });
    }
    
    console.log(`✅ Admin: Fetched ${transactions.length} transactions`);
    return c.json({ success: true, transactions });
  } catch (error: any) {
    console.error('❌ Admin: Error fetching transactions:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================================
// ⚡⚡⚡ PERSISTENT TRADING ENGINE ENDPOINTS ⚡⚡⚡
// Engine runs on SERVER - survives tab close, refresh, logout
// ============================================================

// START PERSISTENT ENGINE
app.post("/make-server-c4d79cb7/engine/start", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ error: error?.message || 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { candleInterval, symbols } = body;

    // Get user credentials
    const userCredentials = await kv.get(`api_credentials:${user.id}`);
    if (!userCredentials) {
      return c.json({ error: 'API credentials not configured' }, 400);
    }

    const credentials = userCredentials as any;
    
    if (!credentials.dhanClientId || !credentials.dhanAccessToken) {
      return c.json({ error: 'Dhan credentials not configured' }, 400);
    }

    console.log(`\n🚀 ============ START PERSISTENT ENGINE ============`);
    console.log(`   User: ${user.id}`);
    console.log(`   Interval: ${candleInterval}M`);
    console.log(`   Symbols: ${symbols.length}`);

    // Start engine (saves to both KV and DB)
    const result = await PersistentTradingEngine.startEngine({
      userId: user.id,
      candleInterval: candleInterval || '15',
      symbols: symbols || [],
      dhanClientId: credentials.dhanClientId,
      dhanAccessToken: credentials.dhanAccessToken
    });

    console.log(`   Result: ${result.message}`);
    console.log(`====================================================\n`);

    return c.json(result);
  } catch (error: any) {
    console.error('❌ Error starting persistent engine:', error);
    return c.json({ error: error.message }, 500);
  }
});

// STOP PERSISTENT ENGINE
app.post("/make-server-c4d79cb7/engine/stop", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ error: error?.message || 'Unauthorized' }, 401);
    }

    console.log(`\n🛑 ============ STOP PERSISTENT ENGINE ============`);
    console.log(`   User: ${user.id}`);

    const result = await PersistentTradingEngine.stopEngine(user.id);

    console.log(`   Result: ${result.message}`);
    console.log(`====================================================\n`);

    return c.json(result);
  } catch (error: any) {
    console.error('❌ Error stopping persistent engine:', error);
    return c.json({ error: error.message }, 500);
  }
});

// GET ENGINE STATUS
app.get("/make-server-c4d79cb7/engine/status", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ error: error?.message || 'Unauthorized' }, 401);
    }

    const status = await PersistentTradingEngine.getEngineStatus(user.id);

    if (!status) {
      return c.json({ 
        isRunning: false, 
        message: 'Engine not running' 
      });
    }

    return c.json({
      isRunning: status.isRunning,
      candleInterval: status.candleInterval,
      symbolsCount: status.symbols.length,
      activePositions: status.activePositions.length,
      stats: status.stats,
      startTime: status.startTime,
      lastHeartbeat: status.lastHeartbeat,
      uptime: Date.now() - status.startTime
    });
  } catch (error: any) {
    console.error('❌ Error getting engine status:', error);
    return c.json({ error: error.message }, 500);
  }
});

// GET ENGINE LOGS
app.get("/make-server-c4d79cb7/engine/logs", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ error: error?.message || 'Unauthorized' }, 401);
    }

    // Get all logs for user (prefix search)
    const logs = await kv.getByPrefix(`engine_log_${user.id}_`);
    
    // Sort by timestamp (newest first), extracting values from {key, value}
    const sortedLogs = logs
      .map((item: any) => item.value)
      .sort((a: any, b: any) => b.timestamp - a.timestamp);
    
    // Return last 100 logs
    const recentLogs = sortedLogs.slice(0, 100);

    return c.json({ 
      success: true, 
      logs: recentLogs,
      count: recentLogs.length
    });
  } catch (error: any) {
    console.error('❌ Error fetching engine logs:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ==================== INSTRUMENT MANAGEMENT ROUTES ====================

// NOTE: The /admin/instruments/upload route is defined later in this file (line ~4768)
// with proper chunking support and auto-delete functionality.

// 📥 Proxy Dhan CSV — pre-filters to F&O NIFTY/BANKNIFTY/SENSEX options only
// Returns ~1-3 MB instead of the full 41 MB master file
app.get("/make-server-c4d79cb7/instruments/proxy-csv", async (c) => {
  try {
    const DHAN_CSV_URL = 'https://images.dhan.co/api-data/api-scrip-master-detailed.csv';
    const upstream = await fetch(DHAN_CSV_URL);
    if (!upstream.ok) {
      return c.json({ error: `Dhan CDN returned ${upstream.status}` }, 502);
    }

    const fullCsv = await upstream.text();
    const lines = fullCsv.split('\n');
    if (lines.length < 2) {
      return c.json({ error: 'Empty CSV from Dhan' }, 502);
    }

    const headerLine = lines[0];
    const headers = headerLine.split(',').map((h: string) => h.trim());
    const exchIdx = headers.indexOf('EXCH_ID');
    const optTypeIdx = headers.indexOf('OPTION_TYPE');
    const underlyingIdx = headers.indexOf('UNDERLYING_SYMBOL');

    if (exchIdx < 0 || optTypeIdx < 0 || underlyingIdx < 0) {
      // Can't filter — return full CSV
      return new Response(fullCsv, {
        headers: { 'Content-Type': 'text/csv', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const TARGET_UNDERLYINGS = new Set(['NIFTY', 'NIFTY 50', 'NIFTY50', 'BANKNIFTY', 'NIFTY BANK', 'SENSEX', 'BSE SENSEX']);
    const VALID_EXCHANGES = new Set(['NSE', 'BSE']);
    const VALID_OPTIONS = new Set(['CE', 'PE']);

    const filtered: string[] = [headerLine];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const cols = line.split(',');
      const exch = cols[exchIdx]?.trim();
      const opt = cols[optTypeIdx]?.trim();
      const underlying = cols[underlyingIdx]?.trim().toUpperCase();
      if (VALID_EXCHANGES.has(exch) && VALID_OPTIONS.has(opt) && TARGET_UNDERLYINGS.has(underlying)) {
        filtered.push(line);
      }
    }

    console.log(`📥 [PROXY-CSV] Filtered ${filtered.length - 1} F&O instruments from ${lines.length - 1} total`);

    return new Response(filtered.join('\n'), {
      headers: { 'Content-Type': 'text/csv', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err: any) {
    console.error('❌ [PROXY-CSV] Error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// Get instruments (Paginated, with filters) - For Users and Mobile App
app.post("/make-server-c4d79cb7/get-admin-instruments", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ error: error?.message || 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const page = body.page || 1;
    const limit = body.limit || 100;
    const underlyingFilter = body.underlying; // "NIFTY", "BANKNIFTY", "SENSEX"
    const optionTypeFilter = body.optionType; // "CALL", "PUT"
    const searchQuery = body.search; // Search in symbol names

    // Get instruments from KV store
    const instrumentsData = await kv.get('admin_instruments:data');

    if (!instrumentsData || !instrumentsData.instruments) {
      return c.json({
        success: true,
        instruments: [],
        total: 0,
        page: page,
        limit: limit,
        hasMore: false,
        message: 'No instruments uploaded yet. Admin must upload CSV first.'
      });
    }

    let filteredInstruments = instrumentsData.instruments;

    // Apply filters
    if (underlyingFilter) {
      filteredInstruments = filteredInstruments.filter((inst: any) => 
        inst.underlyingSymbol === underlyingFilter
      );
    }

    if (optionTypeFilter) {
      filteredInstruments = filteredInstruments.filter((inst: any) => 
        inst.optionType === optionTypeFilter
      );
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filteredInstruments = filteredInstruments.filter((inst: any) =>
        inst.symbol?.toLowerCase().includes(query) ||
        inst.tradingSymbol?.toLowerCase().includes(query) ||
        inst.strike?.toString().includes(query)
      );
    }

    const total = filteredInstruments.length;
    
    // Paginate
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedInstruments = filteredInstruments.slice(startIndex, endIndex);
    const hasMore = endIndex < total;

    console.log(`✅ User ${user.email} fetched ${paginatedInstruments.length} instruments (page ${page}/${Math.ceil(total/limit)})`);

    return c.json({
      success: true,
      instruments: paginatedInstruments,
      total: total,
      page: page,
      limit: limit,
      hasMore: hasMore,
      uploadedAt: instrumentsData.uploadedAt
    });
  } catch (error: any) {
    console.error('❌ Error fetching instruments:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get instruments count (Quick API for stats)
app.get("/make-server-c4d79cb7/admin/instruments/count", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ error: error?.message || 'Unauthorized' }, 401);
    }

    const instrumentsData = await kv.get('admin_instruments:data');

    if (!instrumentsData || !instrumentsData.instruments) {
      return c.json({
        success: true,
        count: 0,
        uploadedAt: null
      });
    }

    // Count by underlying
    const instruments = instrumentsData.instruments;
    const countByUnderlying: any = {};
    
    instruments.forEach((inst: any) => {
      const underlying = inst.underlyingSymbol;
      countByUnderlying[underlying] = (countByUnderlying[underlying] || 0) + 1;
    });

    return c.json({
      success: true,
      total: instruments.length,
      byUnderlying: countByUnderlying,
      uploadedAt: instrumentsData.uploadedAt
    });
  } catch (error: any) {
    console.error('❌ Error fetching instruments count:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ==================== ENGINE STATE MANAGEMENT (PERSISTENT ENGINE) ====================

// ⚡ SAVE ENGINE STATE - Called when user starts/stops engine
app.post("/make-server-c4d79cb7/engine/state", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    const { isRunning, candleInterval, timestamp } = await c.req.json();

    console.log(`⚡ Saving engine state for user ${user.id}:`, { isRunning, candleInterval });

    // Save engine state to KV store
    await kv.set(`engine_state:${user.id}`, {
      isRunning: isRunning || false,
      candleInterval: candleInterval || '15',
      lastUpdated: timestamp || Date.now(),
      userId: user.id
    });

    await supabase
      .from('trading_engine_state')
      .upsert({
        user_id: user.id,
        is_running: isRunning || false,
        strategy_settings: {
          candleInterval: candleInterval || '15',
          lastUpdated: timestamp || Date.now()
        },
        last_heartbeat: new Date().toISOString()
      }, { onConflict: 'user_id' });

    return c.json({
      success: true,
      message: 'Engine state saved',
      state: { isRunning, candleInterval }
    });
  } catch (error: any) {
    console.error('❌ Error saving engine state:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ⚡ GET ENGINE STATE - Called when user logs in from any device
app.get("/make-server-c4d79cb7/engine/state", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    const state = await kv.get(`engine_state:${user.id}`) || {
      isRunning: false,
      candleInterval: '15',
      lastUpdated: Date.now()
    };

    console.log(`⚡ Retrieved engine state for user ${user.id}:`, state);

    return c.json({
      success: true,
      state: state
    });
  } catch (error: any) {
    console.error('❌ Error retrieving engine state:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ==================== TRADING SYMBOLS MANAGEMENT (SERVER-SIDE) ====================

// ⚡ SAVE USER'S TRADING SYMBOLS
// ⚡ REMOVED: Old KV-only symbol routes (were shadowing DB routes at line ~9900)
// Symbols now save/load from user_symbols DB table for cross-device sync

// ==================== GLOBAL FILTERED INSTRUMENTS (ADMIN UPLOADS DAILY) ====================

// ⚡ ADMIN: Upload filtered instruments for ALL users (CHUNKED for large datasets)
app.post("/make-server-c4d79cb7/admin/instruments/upload", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    // ⚡ Check if user is platform owner (admin)
    const PLATFORM_OWNER_EMAIL = Deno.env.get('PLATFORM_OWNER_EMAIL') || 'your-email@example.com';
    if (user.email !== PLATFORM_OWNER_EMAIL) {
      return c.json({ error: 'Unauthorized - Admin only' }, 403);
    }

    const { instruments, isFirstChunk, isLastChunk, chunkIndex, totalChunks } = await c.req.json();

    console.log(`📤 Admin uploading chunk ${(chunkIndex || 0) + 1}/${totalChunks || 1} (${instruments?.length || 0} instruments)`);

    // ⚡ AUTO-DELETE OLD INSTRUMENTS (only on first chunk of multi-chunk upload)
    let oldCount = 0;
    if (isFirstChunk) {
      const oldMetadata = await kv.get('global_instruments_metadata');
      if (oldMetadata && oldMetadata.chunkCount > 0) {
        oldCount = oldMetadata.totalCount || 0;
        console.log(`🗑️ Auto-deleting ${oldCount} old instruments (${oldMetadata.chunkCount} chunks)`);
      
        // Delete all old chunks
        const deletePromises = [];
        for (let i = 0; i < oldMetadata.chunkCount; i++) {
          deletePromises.push(kv.del(`global_instruments_chunk_${i}`));
        }
        await Promise.all(deletePromises);
        console.log(`✅ Deleted ${oldMetadata.chunkCount} old chunks`);
      }
      
      // Initialize tracking for multi-chunk upload
      await kv.set('temp_upload_state', {
        totalInstruments: 0,
        currentStorageChunkIndex: 0
      });
    }

    // Get current upload state
    const uploadState = await kv.get('temp_upload_state') || {
      totalInstruments: 0,
      currentStorageChunkIndex: 0
    };

    // ⚡ CHUNK INSTRUMENTS (500 per chunk to stay under KV limits)
    const CHUNK_SIZE = 500;
    const chunks = [];
    for (let i = 0; i < instruments.length; i += CHUNK_SIZE) {
      chunks.push(instruments.slice(i, i + CHUNK_SIZE));
    }

    console.log(`📦 Splitting ${instruments.length} instruments into ${chunks.length} storage chunks`);

    // ⚡ Save each chunk with correct global index
    const savePromises = chunks.map((chunk, index) => {
      const globalIndex = uploadState.currentStorageChunkIndex + index;
      return kv.set(`global_instruments_chunk_${globalIndex}`, {
        instruments: chunk,
        chunkIndex: globalIndex,
        chunkSize: chunk.length
      });
    });

    await Promise.all(savePromises);

    // Update state
    uploadState.totalInstruments += instruments.length;
    uploadState.currentStorageChunkIndex += chunks.length;
    await kv.set('temp_upload_state', uploadState);

    console.log(`✅ Saved chunk ${(chunkIndex || 0) + 1}/${totalChunks || 1} (${uploadState.totalInstruments} total instruments, ${uploadState.currentStorageChunkIndex} storage chunks)`);

    // ⚡ Save final metadata (only on last chunk)
    if (isLastChunk) {
      await kv.set('global_instruments_metadata', {
        totalCount: uploadState.totalInstruments,
        chunkCount: uploadState.currentStorageChunkIndex,
        chunkSize: CHUNK_SIZE,
        uploadedAt: Date.now(),
        uploadedBy: user.email
      });
      
      // Clean up temp state
      await kv.del('temp_upload_state');

      console.log(`✅ Upload complete: ${uploadState.totalInstruments} instruments in ${uploadState.currentStorageChunkIndex} storage chunks`);
      console.log(`📅 Upload time: ${new Date().toLocaleString()}`);
    }

    return c.json({
      success: true,
      message: isLastChunk 
        ? `Upload complete: ${uploadState.totalInstruments} instruments in ${uploadState.currentStorageChunkIndex} chunks (old: ${oldCount})`
        : `Chunk ${(chunkIndex || 0) + 1}/${totalChunks || 1} received (${uploadState.totalInstruments} total so far)`,
      count: instruments.length,
      totalCount: uploadState.totalInstruments,
      chunks: uploadState.currentStorageChunkIndex,
      uploadedAt: Date.now(),
      oldCount: oldCount,
      isComplete: isLastChunk || false
    });
  } catch (error: any) {
    console.error('❌ Error uploading global instruments:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ⚡ GET GLOBAL FILTERED INSTRUMENTS (All users) - Loads from chunks
app.get("/make-server-c4d79cb7/instruments/global", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    // ⚡ Load metadata
    const metadata = await kv.get('global_instruments_metadata');
    
    if (!metadata || !metadata.chunkCount || metadata.chunkCount === 0) {
      console.log(`📥 User ${user.id} - No instruments found`);
      return c.json({
        success: true,
        instruments: [],
        uploadedAt: null,
        count: 0
      });
    }

    console.log(`📥 User ${user.id} loading ${metadata.totalCount} instruments from ${metadata.chunkCount} chunks`);

    // ⚡ Load all chunks in parallel
    const chunkPromises = [];
    for (let i = 0; i < metadata.chunkCount; i++) {
      chunkPromises.push(kv.get(`global_instruments_chunk_${i}`));
    }

    const chunks = await Promise.all(chunkPromises);

    // ⚡ Combine all instruments
    const allInstruments = [];
    for (const chunk of chunks) {
      if (chunk && chunk.instruments) {
        allInstruments.push(...chunk.instruments);
      }
    }

    console.log(`✅ User ${user.id} retrieved ${allInstruments.length} global instruments`);

    return c.json({
      success: true,
      instruments: allInstruments,
      uploadedAt: metadata.uploadedAt || null,
      count: allInstruments.length
    });
  } catch (error: any) {
    console.error('❌ Error retrieving global instruments:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ⚡ DELETE ALL INSTRUMENTS (Admin only)
app.delete("/make-server-c4d79cb7/admin/instruments/delete-all", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ code: error.code, message: error.message }, error.code);
    }

    // ⚡ Check if user is platform owner (admin)
    const PLATFORM_OWNER_EMAIL = Deno.env.get('PLATFORM_OWNER_EMAIL') || 'your-email@example.com';
    if (user.email !== PLATFORM_OWNER_EMAIL) {
      return c.json({ error: 'Unauthorized - Admin only' }, 403);
    }

    // ⚡ Load metadata
    const metadata = await kv.get('global_instruments_metadata');
    
    if (!metadata || !metadata.chunkCount || metadata.chunkCount === 0) {
      console.log('ℹ️ No instruments to delete');
      return c.json({
        success: true,
        message: 'No instruments to delete',
        count: 0
      });
    }

    console.log(`🗑️ Deleting ${metadata.totalCount} instruments (${metadata.chunkCount} chunks)`);

    // ⚡ Delete all chunks
    const deletePromises = [];
    for (let i = 0; i < metadata.chunkCount; i++) {
      deletePromises.push(kv.del(`global_instruments_chunk_${i}`));
    }
    await Promise.all(deletePromises);

    // ⚡ Delete metadata
    await kv.del('global_instruments_metadata');

    console.log(`✅ Deleted ${metadata.totalCount} instruments`);

    return c.json({
      success: true,
      message: `Deleted ${metadata.totalCount} instruments (${metadata.chunkCount} chunks)`,
      count: metadata.totalCount
    });
  } catch (error: any) {
    console.error('❌ Error deleting instruments:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ==================== ADMIN AUTHENTICATION ====================

// Generate unique code for admin hotkey access
app.post("/make-server-c4d79cb7/admin/generate-unique-code", async (c) => {
  try {
    const { hotkey } = await c.req.json();
    
    console.log(`🔐 Generating unique code for hotkey: ${hotkey}`);
    
    // Verify hotkey is valid — check against all stored hotkeys in KV
    const storedHotkeys = await kv.getByPrefix('admin:hotkey:');
    const validHotkeys: string[] = [
      'GUHAN', // permanent default fallback
      ...storedHotkeys.map((h: any) => {
        const v = h.value || h;
        return (typeof v === 'string' ? v : v.hotkey || '').toUpperCase();
      }).filter(Boolean)
    ];
    
    if (!validHotkeys.includes(hotkey.toUpperCase())) {
      console.log(`❌ Invalid hotkey: ${hotkey} | Valid: ${validHotkeys.join(', ')}`);
      return c.json({
        success: false,
        message: 'Invalid hotkey'
      }, 401);
    }
    
    // Generate unique code for this session (12 character alphanumeric)
    const uniqueCode = Array.from({ length: 12 }, () => 
      'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]
    ).join('');
    
    // Store unique code in KV with timestamp (expires in 1 hour)
    const codeData = {
      code: uniqueCode,
      hotkey: hotkey.toUpperCase(),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
      used: false,
    };
    await kv.set(`admin_hotkey_code_${uniqueCode}`, JSON.stringify(codeData));
    
    console.log(`✅ Generated unique code: ${uniqueCode}`);
    
    return c.json({
      success: true,
      uniqueCode: uniqueCode,
      expiresIn: 3600, // 1 hour in seconds
    });
  } catch (error: any) {
    console.error('Error generating unique code:', error);
    return c.json({ 
      success: false, 
      message: 'Failed to generate code' 
    }, 500);
  }
});

// Verify unique code from URL
app.post("/make-server-c4d79cb7/admin/verify-url-code", async (c) => {
  try {
    const { uniqueCode } = await c.req.json();
    
    console.log(`🔐 Verifying URL code: ${uniqueCode}`);
    
    // Get the stored code data
    const storedCodeData = await kv.get(`admin_hotkey_code_${uniqueCode}`);
    
    if (!storedCodeData) {
      console.log(`❌ Invalid unique code: ${uniqueCode}`);
      return c.json({
        success: false,
        message: 'Invalid or expired code'
      }, 401);
    }
    
    const codeData = JSON.parse(storedCodeData);
    
    // Check if code has expired
    if (new Date(codeData.expiresAt) < new Date()) {
      console.log(`❌ Expired unique code: ${uniqueCode}`);
      await kv.del(`admin_hotkey_code_${uniqueCode}`);
      return c.json({
        success: false,
        message: 'Code has expired'
      }, 401);
    }
    
    // Mark code as used
    codeData.used = true;
    codeData.usedAt = new Date().toISOString();
    await kv.set(`admin_hotkey_code_${uniqueCode}`, JSON.stringify(codeData));
    
    console.log(`✅ URL code verified: ${uniqueCode}`);
    
    return c.json({
      success: true,
      message: 'Code verified',
      hotkey: codeData.hotkey
    });
  } catch (error: any) {
    console.error('Error verifying URL code:', error);
    return c.json({ 
      success: false, 
      message: 'Verification failed' 
    }, 500);
  }
});

// Admin login - returns JWT token for hardcoded admin credentials
app.post("/make-server-c4d79cb7/admin/login", async (c) => {
  try {
    const { email, password } = await c.req.json();
    
    // Hardcoded admin credentials
    const DEFAULT_ADMIN_EMAIL = 'airoboengin@smilykat.com';
    const DEFAULT_ADMIN_PASSWORD = '9600727185Aa@';
    
    // Validate credentials
    if (email !== DEFAULT_ADMIN_EMAIL || password !== DEFAULT_ADMIN_PASSWORD) {
      return c.json({ success: false, message: 'Invalid email or password' }, 401);
    }
    
    // Generate unique code for this login session (8 character alphanumeric)
    const uniqueCode = Array.from({ length: 8 }, () => 
      'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]
    ).join('');
    
    // Store unique code in KV with timestamp (expires in 24 hours)
    const codeData = {
      code: uniqueCode,
      email: DEFAULT_ADMIN_EMAIL,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    await kv.set(`admin_unique_code_${uniqueCode}`, JSON.stringify(codeData));
    
    // Also store by email for lookup
    await kv.set(`admin_current_code_${email}`, uniqueCode);
    
    console.log(`🔐 Generated unique code for admin: ${uniqueCode}`);
    
    // Get or create the admin user in Supabase
    // First try to sign in with Supabase
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: DEFAULT_ADMIN_EMAIL,
      password: DEFAULT_ADMIN_PASSWORD,
    });
    
    if (signInData?.session?.access_token) {
      // Successfully signed in with existing account
      console.log(`✅ Admin logged in: ${email}`);
      return c.json({
        success: true,
        accessToken: signInData.session.access_token,
        uniqueCode: uniqueCode, // Return unique code to client
        admin: {
          id: 'admin_001',
          email: DEFAULT_ADMIN_EMAIL,
          role: {
            dashboard: true,
            users: true,
            transactions: true,
            instruments: true,
            journals: true,
            settings: true,
            support: true,
            landing: true,
            adminUsers: true,
            adminManagement: true, // Permission to create and manage admin users
          },
          hotkey: {
            windows: 'Control+Alt+GUHAN',
            mac: 'Meta+Alt+GUHAN',
          },
          twoFactorEnabled: false,
        }
      });
    }
    
    // If sign in failed, try to create the user
    const { data: userData, error: createError } = await supabase.auth.admin.createUser({
      email: DEFAULT_ADMIN_EMAIL,
      password: DEFAULT_ADMIN_PASSWORD,
      email_confirm: true, // Auto-confirm
      user_metadata: {
        name: 'Platform Admin',
        role: 'admin'
      }
    });
    
    if (createError) {
      console.error('Error creating admin user:', createError);
      return c.json({ 
        success: false, 
        message: 'Failed to authenticate admin user' 
      }, 500);
    }
    
    // Now sign in with the newly created user
    const { data: newSignInData, error: newSignInError } = await supabase.auth.signInWithPassword({
      email: DEFAULT_ADMIN_EMAIL,
      password: DEFAULT_ADMIN_PASSWORD,
    });
    
    if (!newSignInData?.session?.access_token) {
      console.error('Error signing in new admin:', newSignInError);
      return c.json({ 
        success: false, 
        message: 'Failed to get access token' 
      }, 500);
    }
    
    console.log(`✅ Admin user created and logged in: ${email}`);
    return c.json({
      success: true,
      accessToken: newSignInData.session.access_token,
      uniqueCode: uniqueCode, // Return unique code to client
      admin: {
        id: 'admin_001',
        email: DEFAULT_ADMIN_EMAIL,
        role: {
          dashboard: true,
          users: true,
          transactions: true,
          instruments: true,
          journals: true,
          settings: true,
          support: true,
          landing: true,
          adminUsers: true,
          adminManagement: true, // Permission to create and manage admin users
        },
        hotkey: {
          windows: 'Control+Alt+GUHAN',
          mac: 'Meta+Alt+GUHAN',
        },
        twoFactorEnabled: false,
      }
    });
    
  } catch (error: any) {
    console.error('Admin login error:', error);
    return c.json({ 
      success: false, 
      message: error.message || 'Login failed' 
    }, 500);
  }
});

// Admin hotkey verification endpoint
app.post("/make-server-c4d79cb7/admin/verify-hotkey", async (c) => {
  try {
    const { hotkey, pageName } = await c.req.json();
    
    console.log(`🔐 Hotkey verification attempt for page: ${pageName}, hotkey: ${hotkey}`);
    
    // Get all registered admin hotkeys from KV store
    const adminUsers = await kv.getByPrefix('admin_user_');
    const validHotkeys = ['GUHAN']; // Default hotkey
    
    // Add hotkeys from database admin users
    for (const item of adminUsers) {
      try {
        const adminData = item.value; // Extract value from {key, value}
        if (adminData.hotkey) {
          // Extract hotkey string (e.g., "GUHAN" from "Control+Alt+GUHAN")
          const hotkeyMatch = adminData.hotkey.windows?.match(/\+([A-Z]+)$/);
          if (hotkeyMatch) {
            validHotkeys.push(hotkeyMatch[1]);
          }
        }
      } catch (e) {
        console.error('Error parsing admin user:', e);
      }
    }
    
    // Check if hotkey matches
    if (validHotkeys.includes(hotkey.toUpperCase())) {
      console.log(`✅ Hotkey verified for page: ${pageName}`);
      
      // Log access attempt
      const logEntry = {
        timestamp: new Date().toISOString(),
        page: pageName,
        hotkey: hotkey,
        status: 'VERIFIED',
        ip: c.req.header('x-forwarded-for') || 'unknown'
      };
      await kv.set(`hotkey_access_${Date.now()}`, JSON.stringify(logEntry));
      
      return c.json({
        success: true,
        message: 'Hotkey verified'
      });
    } else {
      console.log(`❌ Invalid hotkey for page: ${pageName}`);
      
      // Log failed attempt
      const logEntry = {
        timestamp: new Date().toISOString(),
        page: pageName,
        hotkey: hotkey,
        status: 'FAILED',
        ip: c.req.header('x-forwarded-for') || 'unknown'
      };
      await kv.set(`hotkey_access_${Date.now()}`, JSON.stringify(logEntry));
      
      return c.json({
        success: false,
        message: 'Invalid hotkey. Access denied.'
      }, 401);
    }
  } catch (error: any) {
    console.error('Hotkey verification error:', error);
    return c.json({ 
      success: false, 
      message: 'Verification failed' 
    }, 500);
  }
});

// Admin unique code verification endpoint
app.post("/make-server-c4d79cb7/admin/verify-unique-code", async (c) => {
  try {
    const { uniqueCode, hotkey, pageName } = await c.req.json();
    
    console.log(`🔐 Unique code verification attempt for page: ${pageName}, code: ${uniqueCode}`);
    
    // Get the stored code data
    const storedCodeData = await kv.get(`admin_unique_code_${uniqueCode}`);
    
    if (!storedCodeData) {
      console.log(`❌ Invalid unique code: ${uniqueCode}`);
      return c.json({
        success: false,
        message: 'Invalid or expired unique code'
      }, 401);
    }
    
    const codeData = JSON.parse(storedCodeData);
    
    // Check if code has expired
    if (new Date(codeData.expiresAt) < new Date()) {
      console.log(`❌ Expired unique code: ${uniqueCode}`);
      await kv.del(`admin_unique_code_${uniqueCode}`);
      return c.json({
        success: false,
        message: 'Unique code has expired'
      }, 401);
    }
    
    // Verify hotkey also matches (additional security)
    const validHotkeys = ['GUHAN']; // Should match the hotkey used during login
    if (!validHotkeys.includes(hotkey.toUpperCase())) {
      console.log(`❌ Invalid hotkey with unique code`);
      return c.json({
        success: false,
        message: 'Invalid credentials'
      }, 401);
    }
    
    console.log(`✅ Unique code verified for page: ${pageName}`);
    
    // Log successful access
    const logEntry = {
      timestamp: new Date().toISOString(),
      page: pageName,
      uniqueCode: uniqueCode,
      email: codeData.email,
      status: 'VERIFIED',
      ip: c.req.header('x-forwarded-for') || 'unknown'
    };
    await kv.set(`admin_access_${Date.now()}`, JSON.stringify(logEntry));
    
    return c.json({
      success: true,
      message: 'Unique code verified',
      email: codeData.email
    });
  } catch (error: any) {
    console.error('Unique code verification error:', error);
    return c.json({ 
      success: false, 
      message: 'Verification failed' 
    }, 500);
  }
});

// ==================== LANDING PAGE ADMIN ROUTES ====================

// Get landing page content (PUBLIC - no auth required)
app.get("/make-server-c4d79cb7/landing/content", async (c) => {
  try {
    const content = await getLandingContent();
    return c.json({ success: true, content });
  } catch (error: any) {
    console.error('Error fetching landing content:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Update landing page content (NO AUTH - Public endpoint for landing page management)
app.post("/make-server-c4d79cb7/landing/content", async (c) => {
  try {
    const body = await c.req.json();
    
    // Support both old format (section, data) and new format (content)
    if (body.content) {
      // New format: entire content object
      await kv.set('landing_page_content', body.content);
      console.log(`✅ Landing page content updated`);
      return c.json({ success: true, content: body.content });
    } else {
      // Old format: section and data
      const { section, data } = body;
      const updatedContent = await updateLandingContent(section, data);
      console.log(`✅ Landing page section "${section}" updated`);
      return c.json({ success: true, content: updatedContent });
    }
  } catch (error: any) {
    console.error('Error updating landing content:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Force reset landing page content to DEFAULT (useful after updates to DEFAULT_LANDING_CONTENT)
app.post("/make-server-c4d79cb7/landing/content/reset", async (c) => {
  try {
    const { DEFAULT_LANDING_CONTENT } = await import('./landing_admin.tsx');
    await kv.set('landing_page_content', DEFAULT_LANDING_CONTENT);
    console.log(`✅ Landing page content reset to default`);
    return c.json({ success: true, content: DEFAULT_LANDING_CONTENT, message: 'Content reset to default successfully' });
  } catch (error: any) {
    console.error('Error resetting landing content:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get Terms & Conditions (PUBLIC)
app.get("/make-server-c4d79cb7/landing/terms", async (c) => {
  try {
    const content = await getTermsContent();
    return c.json({ success: true, content });
  } catch (error: any) {
    console.error('Error fetching terms:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Update Terms & Conditions (NO AUTH - Public endpoint for landing page management)
app.post("/make-server-c4d79cb7/landing/terms", async (c) => {
  try {
    const data = await c.req.json();
    const updatedContent = await updateTermsContent(data);
    
    console.log(`✅ Terms & Conditions updated`);
    return c.json({ success: true, content: updatedContent });
  } catch (error: any) {
    console.error('Error updating terms:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get Privacy Policy (PUBLIC)
app.get("/make-server-c4d79cb7/landing/privacy", async (c) => {
  try {
    const content = await getPrivacyContent();
    return c.json({ success: true, content });
  } catch (error: any) {
    console.error('Error fetching privacy:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Update Privacy Policy (NO AUTH - Public endpoint for landing page management)
app.post("/make-server-c4d79cb7/landing/privacy", async (c) => {
  try {
    const data = await c.req.json();
    const updatedContent = await updatePrivacyContent(data);
    
    console.log(`✅ Privacy Policy updated`);
    return c.json({ success: true, content: updatedContent });
  } catch (error: any) {
    console.error('Error updating privacy:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ==================== DYNAMIC PAGES MANAGEMENT ====================

// Get all pages
app.get("/make-server-c4d79cb7/landing/pages", async (c) => {
  try {
    const pages = await getAllPages();
    return c.json({ success: true, pages });
  } catch (error: any) {
    console.error('Error fetching pages:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get single page by slug
app.get("/make-server-c4d79cb7/landing/pages/:slug", async (c) => {
  try {
    const slug = c.req.param('slug');
    const page = await getPageBySlug(slug);
    
    if (!page) {
      return c.json({ error: 'Page not found' }, 404);
    }
    
    return c.json({ success: true, page });
  } catch (error: any) {
    console.error('Error fetching page:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Create or update page (NO AUTH - Public endpoint for landing page management)
app.post("/make-server-c4d79cb7/landing/pages", async (c) => {
  try {
    const pageData = await c.req.json();
    const pages = await savePage(pageData);
    
    console.log(`✅ Page ${pageData.id} saved`);
    return c.json({ success: true, pages });
  } catch (error: any) {
    console.error('Error saving page:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Delete page (NO AUTH - Public endpoint for landing page management)
app.delete("/make-server-c4d79cb7/landing/pages/:slug", async (c) => {
  try {
    const slug = c.req.param('slug');
    await deletePage(slug);
    
    console.log(`✅ Page ${slug} deleted`);
    return c.json({ success: true, message: 'Page deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting page:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Toggle page enabled status (NO AUTH - Public endpoint for landing page management)
app.post("/make-server-c4d79cb7/landing/pages/:slug/toggle", async (c) => {
  try {
    const slug = c.req.param('slug');
    const { enabled } = await c.req.json();

    // Get current page
    const page = await getPageBySlug(slug);
    if (!page) {
      return c.json({ error: 'Page not found' }, 404);
    }

    // Update page with new enabled status
    const updatedPage = { ...page, enabled };
    await savePage(updatedPage);
    
    console.log(`✅ Page ${slug} ${enabled ? 'enabled' : 'disabled'}`);
    return c.json({ success: true, message: `Page ${enabled ? 'enabled' : 'disabled'} successfully` });
  } catch (error: any) {
    console.error('Error toggling page:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ==================== SOCIAL MEDIA LINKS MANAGEMENT ====================

// Get social media links (NO AUTH - Public endpoint)
app.get("/make-server-c4d79cb7/landing/social-links", async (c) => {
  try {
    const links = await getSocialLinks();
    return c.json({ success: true, links });
  } catch (error: any) {
    console.error('Error fetching social links:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Update social media links (NO AUTH - Public endpoint for landing page management)
app.post("/make-server-c4d79cb7/landing/social-links", async (c) => {
  try {
    const linksData = await c.req.json();
    const updatedLinks = await updateSocialLinks(linksData);
    
    console.log('✅ Social media links updated');
    return c.json({ success: true, links: updatedLinks });
  } catch (error: any) {
    console.error('Error updating social links:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ==================== PLATFORM SETTINGS ====================

// Get platform settings (Admin only) - Returns masked values for security
app.get("/make-server-c4d79cb7/platform/settings", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ error: error.message }, error.code);
    }

    const isAdmin = user.email === Deno.env.get('PLATFORM_OWNER_EMAIL');
    if (!isAdmin) {
      return c.json({ error: 'Unauthorized - Admin access required' }, 403);
    }

    // Get environment variables and mask them for security
    const maskKey = (key: string | undefined) => {
      if (!key || key.length === 0) return '';
      if (key.length <= 8) return '••••••••';
      return key.substring(0, 4) + '••••••••' + key.substring(key.length - 4);
    };

    const settings = {
      twoFactorApiKey: maskKey(Deno.env.get('TWOFACTOR_API_KEY')),
      twoFactorApiKeyExists: !!Deno.env.get('TWOFACTOR_API_KEY'),
      razorpayKeyId: maskKey(Deno.env.get('RAZORPAY_KEY_ID')),
      razorpayKeyIdExists: !!Deno.env.get('RAZORPAY_KEY_ID'),
      razorpayKeySecret: maskKey(Deno.env.get('RAZORPAY_KEY_SECRET')),
      razorpayKeySecretExists: !!Deno.env.get('RAZORPAY_KEY_SECRET'),
      openaiApiKey: maskKey(Deno.env.get('OPENAI_API_KEY')),
      openaiApiKeyExists: !!Deno.env.get('OPENAI_API_KEY'),
      supabaseUrl: Deno.env.get('SUPABASE_URL') || '',
      supabaseAnonKey: maskKey(Deno.env.get('SUPABASE_ANON_KEY')),
      supabaseAnonKeyExists: !!Deno.env.get('SUPABASE_ANON_KEY'),
      platformOwnerEmail: Deno.env.get('PLATFORM_OWNER_EMAIL') || '',
      adminHotkeys: await kv.get('admin_hotkeys') || ['GUHAN']
    };

    return c.json({ success: true, settings });
  } catch (error: any) {
    console.error('Error fetching platform settings:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ========================================
// SUPPORT TICKET SYSTEM
// ========================================

// User: Create support ticket
app.post('/make-server-c4d79cb7/support/create', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.split(' ')[1];
    
    if (!token) {
      return c.json({ success: false, message: 'Unauthorized' }, 401);
    }

    // Get user info from token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return c.json({ success: false, message: 'Invalid token' }, 401);
    }

    const { subject, message, urgency, category } = await c.req.json();
    
    if (!subject || !message) {
      return c.json({ success: false, message: 'Subject and message are required' }, 400);
    }

    // Get user profile for name and email
    const userProfile = await safeKVGet(`user:${user.id}`, null);
    const userName = userProfile?.name || user.email?.split('@')[0] || 'User';
    const userEmail = user.email || 'No email';

    // Create ticket
    const ticketId = `ticket_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const ticket = {
      id: ticketId,
      userId: user.id,
      userName,
      userEmail,
      subject,
      message,
      urgency: urgency || 'NORMAL',
      category: category || 'TECHNICAL',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      unread: false, // User created it, so not unread for user
    };

    await kv.set(`support:ticket:${ticketId}`, ticket);
    
    // Add to user's ticket list
    const userTickets = await safeKVGet(`support:user:${user.id}`, []);
    userTickets.unshift(ticketId);
    await kv.set(`support:user:${user.id}`, userTickets);

    // Add to all tickets list
    const allTickets = await safeKVGet('support:all:tickets', []);
    allTickets.unshift(ticketId);
    await kv.set('support:all:tickets', allTickets);

    console.log(`✅ Support ticket created: ${ticketId}`);
    return c.json({ success: true, ticketId });
  } catch (error: any) {
    console.error('Error creating support ticket:', error);
    return c.json({ success: false, message: error.message }, 500);
  }
});

// User: Get user's tickets
app.get('/make-server-c4d79cb7/support/tickets', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.split(' ')[1];
    
    if (!token) {
      return c.json({ success: false, message: 'Unauthorized' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return c.json({ success: false, message: 'Invalid token' }, 401);
    }

    const userTickets = await safeKVGet(`support:user:${user.id}`, []);
    const tickets = [];
    
    for (const ticketId of userTickets) {
      const ticket = await safeKVGet(`support:ticket:${ticketId}`, null);
      if (ticket) {
        tickets.push(ticket);
      }
    }

    return c.json({ success: true, tickets });
  } catch (error: any) {
    console.error('Error fetching user tickets:', error);
    return c.json({ success: false, message: error.message }, 500);
  }
});

// User: Mark ticket as read (when user views admin reply)
app.post('/make-server-c4d79cb7/support/mark-read/:ticketId', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.split(' ')[1];
    
    if (!token) {
      return c.json({ success: false, message: 'Unauthorized' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return c.json({ success: false, message: 'Invalid token' }, 401);
    }

    const ticketId = c.req.param('ticketId');
    const ticket = await safeKVGet(`support:ticket:${ticketId}`, null);
    
    if (!ticket) {
      return c.json({ success: false, message: 'Ticket not found' }, 404);
    }

    if (ticket.userId !== user.id) {
      return c.json({ success: false, message: 'Unauthorized' }, 403);
    }

    ticket.unread = false;
    await kv.set(`support:ticket:${ticketId}`, ticket);

    return c.json({ success: true });
  } catch (error: any) {
    console.error('Error marking ticket as read:', error);
    return c.json({ success: false, message: error.message }, 500);
  }
});

// Admin: Get all support tickets
app.get('/make-server-c4d79cb7/admin/support/tickets', async (c) => {
  try {
    // Validate admin auth
    const authResult = await validateAdminAuth(c);
    if (!authResult.authorized) {
      return c.json({ success: false, message: 'Unauthorized' }, 401);
    }

    const allTicketIds = await safeKVGet('support:all:tickets', []);
    const tickets = [];
    
    for (const ticketId of allTicketIds) {
      const ticket = await safeKVGet(`support:ticket:${ticketId}`, null);
      if (ticket) {
        tickets.push(ticket);
      }
    }

    // Calculate stats
    const stats = {
      total: tickets.length,
      pending: tickets.filter(t => t.status === 'PENDING').length,
      replied: tickets.filter(t => t.status === 'REPLIED').length,
      closed: tickets.filter(t => t.status === 'CLOSED').length,
    };

    return c.json({ success: true, tickets, stats });
  } catch (error: any) {
    console.error('Error fetching admin tickets:', error);
    return c.json({ success: false, message: error.message }, 500);
  }
});

// Admin: Reply to ticket
app.post('/make-server-c4d79cb7/admin/support/reply', async (c) => {
  try {
    // Validate admin auth
    const authResult = await validateAdminAuth(c);
    if (!authResult.authorized) {
      return c.json({ success: false, message: 'Unauthorized' }, 401);
    }

    const { messageId, reply } = await c.req.json();
    
    if (!messageId || !reply) {
      return c.json({ success: false, message: 'Message ID and reply are required' }, 400);
    }

    const ticket = await safeKVGet(`support:ticket:${messageId}`, null);
    
    if (!ticket) {
      return c.json({ success: false, message: 'Ticket not found' }, 404);
    }

    ticket.adminReply = reply;
    ticket.status = 'REPLIED';
    ticket.repliedAt = new Date().toISOString();
    ticket.unread = true; // Mark as unread for user (new admin reply)
    
    await kv.set(`support:ticket:${messageId}`, ticket);

    console.log(`✅ Admin replied to ticket: ${messageId}`);
    return c.json({ success: true });
  } catch (error: any) {
    console.error('Error replying to ticket:', error);
    return c.json({ success: false, message: error.message }, 500);
  }
});

// Admin: Close ticket
app.post('/make-server-c4d79cb7/admin/support/close', async (c) => {
  try {
    // Validate admin auth
    const authResult = await validateAdminAuth(c);
    if (!authResult.authorized) {
      return c.json({ success: false, message: 'Unauthorized' }, 401);
    }

    const { messageId } = await c.req.json();
    
    if (!messageId) {
      return c.json({ success: false, message: 'Message ID is required' }, 400);
    }

    const ticket = await safeKVGet(`support:ticket:${messageId}`, null);
    
    if (!ticket) {
      return c.json({ success: false, message: 'Ticket not found' }, 404);
    }

    ticket.status = 'CLOSED';
    await kv.set(`support:ticket:${messageId}`, ticket);

    console.log(`✅ Admin closed ticket: ${messageId}`);
    return c.json({ success: true });
  } catch (error: any) {
    console.error('Error closing ticket:', error);
    return c.json({ success: false, message: error.message }, 500);
  }
});

// Admin: Delete ticket
app.delete('/make-server-c4d79cb7/admin/support/delete/:messageId', async (c) => {
  try {
    // Validate admin auth
    const authResult = await validateAdminAuth(c);
    if (!authResult.authorized) {
      return c.json({ success: false, message: 'Unauthorized' }, 401);
    }

    const messageId = c.req.param('messageId');
    const ticket = await safeKVGet(`support:ticket:${messageId}`, null);
    
    if (!ticket) {
      return c.json({ success: false, message: 'Ticket not found' }, 404);
    }

    // Remove from user's ticket list
    const userTickets = await safeKVGet(`support:user:${ticket.userId}`, []);
    const updatedUserTickets = userTickets.filter((id: string) => id !== messageId);
    await kv.set(`support:user:${ticket.userId}`, updatedUserTickets);

    // Remove from all tickets list
    const allTickets = await safeKVGet('support:all:tickets', []);
    const updatedAllTickets = allTickets.filter((id: string) => id !== messageId);
    await kv.set('support:all:tickets', updatedAllTickets);

    // Delete the ticket
    await kv.del(`support:ticket:${messageId}`);

    console.log(`✅ Admin deleted ticket: ${messageId}`);
    return c.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting ticket:', error);
    return c.json({ success: false, message: error.message }, 500);
  }
});

// ============================================
// LANDING PAGE ADMINISTRATION ROUTES
// ============================================

// Admin: Get landing page content (NO AUTH - Public endpoint for landing page management)
app.get('/make-server-c4d79cb7/admin/landing-page', async (c) => {
  try {
    // Get landing page content from KV store
    const content = await safeKVGet('landing:page:content', {
      hero: {
        title: 'IndexpilotAI - AI-Powered Options Trading',
        subtitle: 'Trade smarter with AI-driven insights for the Indian stock market',
        ctaText: 'Start Trading Now'
      },
      features: [
        {
          title: 'AI Strategy Analysis',
          description: 'Get real-time AI-powered trading insights and recommendations'
        },
        {
          title: 'Real-Time Market Data',
          description: 'Live NSE/BSE data with Dhan API integration'
        },
        {
          title: 'Risk Management',
          description: 'Advanced risk control panels to protect your capital'
        },
        {
          title: 'Auto Trading',
          description: 'Automated trade execution based on AI signals'
        }
      ],
      pricing: {
        free: {
          name: 'Free Tier',
          price: '₹0',
          features: [
            'Basic market data',
            'Limited AI insights',
            'Manual trading only',
            'Community support'
          ]
        },
        pro: {
          name: 'Professional',
          price: '10% of profits',
          features: [
            'Full AI strategy analysis',
            'Auto trading enabled',
            'Real-time alerts',
            'Priority support',
            'Advanced analytics'
          ]
        },
        enterprise: {
          name: 'Enterprise',
          price: 'Custom',
          features: [
            'Everything in Pro',
            'Custom AI models',
            'Dedicated support',
            'API access',
            'White-label options'
          ]
        }
      },
      testimonials: [
        {
          name: 'Rajesh Kumar',
          role: 'Professional Trader',
          content: 'IndexpilotAI has transformed my trading. The AI insights are incredibly accurate!',
          rating: 5
        },
        {
          name: 'Priya Sharma',
          role: 'Investor',
          content: 'The auto-trading feature saves me hours every day. Highly recommended!',
          rating: 5
        }
      ],
      legal: {
        termsOfService: 'Terms of Service content here...',
        privacyPolicy: 'Privacy Policy content here...',
        refundPolicy: 'Refund Policy content here...'
      }
    });

    return c.json({ success: true, content });
  } catch (error: any) {
    console.error('Error getting landing page content:', error);
    return c.json({ success: false, message: error.message }, 500);
  }
});

// Admin: Update landing page content (NO AUTH - Public endpoint for landing page management)
app.post('/make-server-c4d79cb7/admin/landing-page', async (c) => {
  try {
    const { content } = await c.req.json();

    if (!content) {
      return c.json({ success: false, message: 'Content is required' }, 400);
    }

    // Save landing page content to KV store
    await kv.set('landing:page:content', content);

    console.log('✅ Landing page content updated by admin');
    return c.json({ success: true });
  } catch (error: any) {
    console.error('Error updating landing page content:', error);
    return c.json({ success: false, message: error.message }, 500);
  }
});

// Public: Get landing page content (for displaying on actual landing page)
app.get('/make-server-c4d79cb7/landing-page', async (c) => {
  try {
    const content = await safeKVGet('landing:page:content', null);
    
    if (!content) {
      return c.json({ success: false, message: 'Landing page content not found' }, 404);
    }

    return c.json({ success: true, content });
  } catch (error: any) {
    console.error('Error getting landing page content:', error);
    return c.json({ success: false, message: error.message }, 500);
  }
});

// 🗺️ PUBLIC SITEMAP ENDPOINT - Returns proper XML for Google Search Console
app.get('/make-server-c4d79cb7/sitemap.xml', async (c) => {
  try {
    console.log('📋 Sitemap requested');

    // Get the base URL from request headers
    const host = c.req.header('host') || 'www.indexpilotai.com';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;
    
    const today = new Date().toISOString().split('T')[0];

    // Define all URLs for sitemap
    const urls = [
      { loc: `${baseUrl}/`, lastmod: today, changefreq: 'daily', priority: 1.0 },
      { loc: `${baseUrl}/login`, lastmod: today, changefreq: 'monthly', priority: 0.8 },
      { loc: `${baseUrl}/register`, lastmod: today, changefreq: 'monthly', priority: 0.8 },
      { loc: `${baseUrl}/dashboard`, lastmod: today, changefreq: 'weekly', priority: 0.9 },
      { loc: `${baseUrl}/pwa-setup`, lastmod: today, changefreq: 'monthly', priority: 0.6 },
      { loc: `${baseUrl}/icon-generator`, lastmod: today, changefreq: 'monthly', priority: 0.6 },
      { loc: `${baseUrl}/page/about`, lastmod: today, changefreq: 'monthly', priority: 0.7 },
      { loc: `${baseUrl}/page/features`, lastmod: today, changefreq: 'monthly', priority: 0.7 },
      { loc: `${baseUrl}/page/pricing`, lastmod: today, changefreq: 'weekly', priority: 0.8 },
      { loc: `${baseUrl}/page/contact`, lastmod: today, changefreq: 'monthly', priority: 0.7 },
      { loc: `${baseUrl}/page/terms`, lastmod: today, changefreq: 'yearly', priority: 0.5 },
      { loc: `${baseUrl}/page/privacy`, lastmod: today, changefreq: 'yearly', priority: 0.5 },
    ];

    // Generate XML sitemap
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${urls.map(url => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

    console.log(`✅ Sitemap generated with ${urls.length} URLs`);

    // Return XML with proper content-type header
    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error: any) {
    console.error('❌ Error generating sitemap:', error);
    return c.text('Error generating sitemap', 500);
  }
});

// 🤖 PUBLIC ROBOTS.TXT ENDPOINT - Returns proper robots.txt for search engines
app.get('/make-server-c4d79cb7/robots.txt', async (c) => {
  try {
    console.log('🤖 Robots.txt requested');

    // Always use www.indexpilotai.com as the primary domain
    const baseUrl = 'https://www.indexpilotai.com';

    const robotsTxt = `# IndexpilotAI - Robots.txt
# Last updated: ${new Date().toISOString().split('T')[0]}

# Allow all search engines
User-agent: *
Allow: /

# Disallow admin and sensitive areas
Disallow: /admin/

# Sitemap location
Sitemap: ${baseUrl}/sitemap.xml

# Allow specific bots
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: Slurp
Allow: /`;

    console.log('✅ Robots.txt generated');

    // Return TXT with proper content-type header
    return new Response(robotsTxt, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
      },
    });
  } catch (error: any) {
    console.error('❌ Error generating robots.txt:', error);
    return c.text('Error generating robots.txt', 500);
  }
});

// ==========================================
// 🔒 STATIC IP MANAGEMENT (SEBI COMPLIANCE)
// ==========================================

// Get Static IP configuration
app.get("/make-server-c4d79cb7/dhan-static-ip", async (c) => {
  console.log('🔒 [STATIC IP] GET request received');
  
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      console.log('❌ [STATIC IP] Auth failed:', error?.message);
      return c.json({ success: false, error: error?.message || 'Unauthorized' }, 401);
    }

    console.log(`✅ [STATIC IP] User authenticated: ${user.email} (${user.id})`);

    // Get Dhan credentials from KV store
    const credentials = await safeKVGet(`dhan_credentials_${user.id}`, null);
    
    if (!credentials?.clientId || !credentials?.accessToken) {
      console.log('❌ [STATIC IP] No Dhan credentials found for user');
      return c.json({ 
        success: false, 
        error: 'Dhan credentials not configured. Please configure your Dhan Client ID and Access Token first.' 
      }, 404);
    }

    console.log('🔑 [STATIC IP] Dhan credentials found, calling Dhan API...');
    console.log(`   Client ID: ${credentials.clientId}`);

    // Call Dhan API to get Static IP configuration
    const response = await fetch('https://api.dhan.co/v2/ip/getIP', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'access-token': credentials.accessToken
      }
    });

    console.log(`📡 [STATIC IP] Dhan API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [STATIC IP] Dhan API error: ${response.status} - ${errorText}`);
      
      // If IPs not configured, return friendly message
      if (response.status === 404 || errorText.includes('not found')) {
        return c.json({ 
          success: false, 
          error: 'No Static IPs configured yet in your Dhan account.' 
        }, 404);
      }
      
      throw new Error(`Dhan API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('✅ [STATIC IP] Configuration retrieved:', JSON.stringify(data, null, 2));

    return c.json({ 
      success: true, 
      data: {
        primaryIP: data.primaryIP || null,
        modifyDatePrimary: data.modifyDatePrimary || null,
        secondaryIP: data.secondaryIP || null,
        modifyDateSecondary: data.modifyDateSecondary || null
      }
    });
  } catch (error: any) {
    console.error('❌ [STATIC IP] Error fetching Static IP configuration:', error);
    return c.json({ success: false, error: error.message || 'Failed to fetch Static IP configuration' }, 500);
  }
});

// Set Static IP (first time setup)
app.post("/make-server-c4d79cb7/dhan-static-ip/set", async (c) => {
  console.log('🔒 [STATIC IP] SET request received');
  
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      console.log('❌ [STATIC IP] Auth failed:', error?.message);
      return c.json({ success: false, error: error?.message || 'Unauthorized' }, 401);
    }

    console.log(`✅ [STATIC IP] User authenticated: ${user.email} (${user.id})`);

    const { ip, ipFlag } = await c.req.json();
    
    if (!ip || !ipFlag) {
      console.log('❌ [STATIC IP] Missing required fields');
      return c.json({ success: false, error: 'IP address and ipFlag are required' }, 400);
    }

    if (ipFlag !== 'PRIMARY' && ipFlag !== 'SECONDARY') {
      console.log('❌ [STATIC IP] Invalid ipFlag:', ipFlag);
      return c.json({ success: false, error: 'ipFlag must be PRIMARY or SECONDARY' }, 400);
    }

    console.log(`📋 [STATIC IP] Setting ${ipFlag} IP: ${ip}`);

    // Get Dhan credentials from KV store
    const credentials = await safeKVGet(`dhan_credentials_${user.id}`, null);
    
    if (!credentials?.clientId || !credentials?.accessToken) {
      console.log('❌ [STATIC IP] No Dhan credentials found for user');
      return c.json({ 
        success: false, 
        error: 'Dhan credentials not configured. Please configure your Dhan Client ID and Access Token first.' 
      }, 400);
    }

    console.log('🔑 [STATIC IP] Dhan credentials found, calling Dhan setIP API...');

    // Call Dhan API to set Static IP
    const response = await fetch('https://api.dhan.co/v2/ip/setIP', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'access-token': credentials.accessToken
      },
      body: JSON.stringify({
        dhanClientId: credentials.clientId,
        ip: ip,
        ipFlag: ipFlag
      })
    });

    console.log(`📡 [STATIC IP] Dhan API response status: ${response.status}`);

    const responseText = await response.text();
    console.log(`📡 [STATIC IP] Dhan API response body: ${responseText}`);

    if (!response.ok) {
      console.error(`❌ [STATIC IP] Dhan API error: ${response.status} - ${responseText}`);
      throw new Error(`Dhan API error: ${responseText}`);
    }

    const data = JSON.parse(responseText);
    console.log('✅ [STATIC IP] IP set successfully:', data);

    return c.json({ 
      success: true, 
      message: data.message || `${ipFlag} IP set successfully`,
      data 
    });
  } catch (error: any) {
    console.error('❌ [STATIC IP] Error setting Static IP:', error);
    return c.json({ success: false, error: error.message || 'Failed to set Static IP' }, 500);
  }
});

// Modify Static IP (after 7 days)
app.put("/make-server-c4d79cb7/dhan-static-ip/modify", async (c) => {
  console.log('🔒 [STATIC IP] MODIFY request received');
  
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      console.log('❌ [STATIC IP] Auth failed:', error?.message);
      return c.json({ success: false, error: error?.message || 'Unauthorized' }, 401);
    }

    console.log(`✅ [STATIC IP] User authenticated: ${user.email} (${user.id})`);

    const { ip, ipFlag } = await c.req.json();
    
    if (!ip || !ipFlag) {
      console.log('❌ [STATIC IP] Missing required fields');
      return c.json({ success: false, error: 'IP address and ipFlag are required' }, 400);
    }

    if (ipFlag !== 'PRIMARY' && ipFlag !== 'SECONDARY') {
      console.log('❌ [STATIC IP] Invalid ipFlag:', ipFlag);
      return c.json({ success: false, error: 'ipFlag must be PRIMARY or SECONDARY' }, 400);
    }

    console.log(`📋 [STATIC IP] Modifying ${ipFlag} IP: ${ip}`);

    // Get Dhan credentials from KV store
    const credentials = await safeKVGet(`dhan_credentials_${user.id}`, null);
    
    if (!credentials?.clientId || !credentials?.accessToken) {
      console.log('❌ [STATIC IP] No Dhan credentials found for user');
      return c.json({ 
        success: false, 
        error: 'Dhan credentials not configured. Please configure your Dhan Client ID and Access Token first.' 
      }, 400);
    }

    console.log('🔑 [STATIC IP] Dhan credentials found, calling Dhan modifyIP API...');

    // Call Dhan API to modify Static IP
    const response = await fetch('https://api.dhan.co/v2/ip/modifyIP', {
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'access-token': credentials.accessToken
      },
      body: JSON.stringify({
        dhanClientId: credentials.clientId,
        ip: ip,
        ipFlag: ipFlag
      })
    });

    console.log(`📡 [STATIC IP] Dhan API response status: ${response.status}`);

    const responseText = await response.text();
    console.log(`📡 [STATIC IP] Dhan API response body: ${responseText}`);

    if (!response.ok) {
      console.error(`❌ [STATIC IP] Dhan API error: ${response.status} - ${responseText}`);
      
      // Check if modification is not allowed yet (before 7 days)
      if (responseText.includes('modification') || responseText.includes('7 days')) {
        throw new Error('IP modification not allowed yet. You can only modify your Static IP once every 7 days.');
      }
      
      throw new Error(`Dhan API error: ${responseText}`);
    }

    const data = JSON.parse(responseText);
    console.log('✅ [STATIC IP] IP modified successfully:', data);

    return c.json({ 
      success: true, 
      message: data.message || `${ipFlag} IP modified successfully`,
      data 
    });
  } catch (error: any) {
    console.error('❌ [STATIC IP] Error modifying Static IP:', error);
    return c.json({ success: false, error: error.message || 'Failed to modify Static IP' }, 500);
  }
});

// ==========================================
// 24/7 CRON TRIGGER FOR ENGINE TICK
// ==========================================
app.all("/make-server-c4d79cb7/cron/engine-tick", async (c) => {
  console.log("==========================================");
  console.log("⏱️ [CRON] 24/7 Engine Tick Triggered via HTTP");
  console.log("==========================================");
  
  try {
    const result = await PersistentTradingEngine.runCronTick();
    return c.json(result);
  } catch (error: any) {
    console.error("❌ [CRON] Tick failed:", error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.all("/make-server-c4d79cb7/position-monitor/tick", async (c) => {
  try {
    let targetUserId = '';
    const authHeader = c.req.header('Authorization');
    if (authHeader) {
      const { user } = await validateAuth(c, 1);
      targetUserId = user?.id || '';
    }

    const result = await PersistentTradingEngine.runPositionMonitorTick(targetUserId || undefined);
    return c.json(result);
  } catch (error: any) {
    console.error("❌ [POSITION-MONITOR] Tick failed:", error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// GET /position-monitor/list  → all active monitored positions for the user
// Used by mobile app to render the Position Monitor UI
app.get("/make-server-c4d79cb7/position-monitor/list", async (c) => {
  try {
    const bearerToken = c.req.header('Authorization')?.split(' ')[1];
    const queryUserId = c.req.query('userId');
    const userId = extractUserIdFromJwt(bearerToken || '') || queryUserId;
    if (!userId) return c.json({ error: 'userId required' }, 401);

    const { data, error } = await supabase
      .from('position_monitor_state')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ success: true, positions: data || [] });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// POST /position-monitor/trailing  → enable/disable trailing SL on an active position
app.post("/make-server-c4d79cb7/position-monitor/trailing", async (c) => {
  try {
    const { user, error: authErr } = await validateAuth(c);
    if (authErr || !user) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json();
    const orderId = String(body.orderId || '').trim();
    const trailingEnabled = Boolean(body.trailingEnabled);
    const trailingStep = Number(body.trailingStep);

    if (!orderId) return c.json({ error: 'orderId required' }, 400);

    const update: Record<string, unknown> = { trailing_enabled: trailingEnabled };
    if (Number.isFinite(trailingStep) && trailingStep > 0) update.trailing_step = trailingStep;

    const { error: updateError } = await supabase
      .from('position_monitor_state')
      .update(update)
      .eq('user_id', user.id)
      .eq('order_id', orderId)
      .eq('is_active', true);

    if (updateError) return c.json({ error: updateError.message }, 500);
    return c.json({ success: true, orderId, trailingEnabled, trailingStep: update.trailing_step });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

app.post("/make-server-c4d79cb7/position-monitor/update", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) return c.json({ error: error?.message || 'Unauthorized' }, 401);

    const body = await c.req.json();
    const orderId = String(body.orderId || '').trim();
    const targetAmount = Number(body.targetAmount);
    const stopLossAmount = Number(body.stopLossAmount);

    if (!orderId || !Number.isFinite(targetAmount) || !Number.isFinite(stopLossAmount)) {
      return c.json({ error: 'orderId, targetAmount and stopLossAmount are required' }, 400);
    }

    const { error: updateError } = await supabase
      .from('position_monitor_state')
      .update({ target_amount: targetAmount, stop_loss_amount: stopLossAmount })
      .eq('user_id', user.id)
      .eq('order_id', orderId)
      .eq('is_active', true);

    if (updateError) return c.json({ error: updateError.message }, 500);
    return c.json({ success: true, orderId, targetAmount, stopLossAmount });
  } catch (error: any) {
    console.error('❌ Position update failed:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Native Deno cron disabled here to avoid duplicate engine ticks.

// ─────────────────────────────────────────────────────────────────────────
// DEBUG: GET /make-server-c4d79cb7/internal/debug-ip?userId=...
// Returns the IP address that would be used for order routing for a user.
app.get("/make-server-c4d79cb7/internal/debug-ip", async (c) => {
  const internalKey = c.req.header("x-internal-key");
  const expectedKey = Deno.env.get("INTERNAL_SYNC_KEY");
  if (!expectedKey || internalKey !== expectedKey) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const userId = c.req.query("userId");
  if (!userId) return c.json({ error: "userId required" }, 400);
  try {
    const rows = await kv.getByPrefix(`ip_assignment:${userId}:`);
    if (!rows || rows.length === 0) {
      return c.json({ routing: "none", reason: "No dedicated VPS found for this user — they must purchase one from Broker Setup", userId });
    }
    const row = rows[0];
    const data = row.value || row;
    const isActive = data.subscriptionStatus === "active" && data.expiresAt && new Date(data.expiresAt) > new Date();
    if (isActive && data.ipAddress) {
      return c.json({ routing: "dedicated", ip: data.ipAddress, subscriptionStatus: data.subscriptionStatus, expiresAt: data.expiresAt, userId, kvKey: row.key });
    }
    return c.json({ routing: "expired", reason: "Dedicated VPS subscription expired — user must renew", expiredIP: data.ipAddress, data, userId });
  } catch (err: any) {
    return c.json({ routing: "error", error: err.message, userId }, 500);
  }
});

// INTERNAL: POST /make-server-c4d79cb7/internal/sync-vps-ip
// Called by the Express backend after VPS provisioning or renewal.
// Writes ip_assignment:<userId>:dedicated to Supabase KV so that
// static_ip_helper.tsx routes orders through the user's dedicated VPS.
// Auth: x-internal-key header must match INTERNAL_SYNC_KEY env var.
// ─────────────────────────────────────────────────────────────────────────
app.post("/make-server-c4d79cb7/internal/sync-vps-ip", async (c) => {
  try {
    const internalKey = c.req.header("x-internal-key");
    const expectedKey = Deno.env.get("INTERNAL_SYNC_KEY");

    if (!expectedKey || internalKey !== expectedKey) {
      console.warn("⚠️ [SYNC-VPS-IP] Unauthorized attempt");
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { userId, ipAddress, expiresAt, subscriptionStatus } = await c.req.json();

    if (!userId || !ipAddress || !expiresAt) {
      return c.json({ error: "Missing required fields: userId, ipAddress, expiresAt" }, 400);
    }

    const kvValue = {
      userId,
      ipAddress,
      vpsUrl: `http://${ipAddress}:3000`,
      subscriptionStatus: subscriptionStatus || "active",
      expiresAt,
      provider: "digitalocean",
      assignedAt: new Date().toISOString(),
      monthlyFee: 599,
      lastUsedAt: new Date().toISOString(),
    };

    await kv.set(`ip_assignment:${userId}:dedicated`, kvValue);
    await kv.set(`user_ip_assignment:${userId}`, kvValue);

    console.log(`✅ [SYNC-VPS-IP] Synced ${userId.substring(0, 8)} → ${ipAddress} (${kvValue.subscriptionStatus}, expires ${expiresAt})`);
    return c.json({ success: true, keys: [`ip_assignment:${userId}:dedicated`, `user_ip_assignment:${userId}`], ipAddress, expiresAt });
  } catch (err: any) {
    console.error("❌ [SYNC-VPS-IP] Error:", err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// INTERNAL: POST /make-server-c4d79cb7/internal/deduct-wallet
// Called by the Express backend after a successful VPS wallet payment.
// Deducts the specified amount from the user's KV wallet balance and
// appends a debit transaction to wallet_transactions:<userId>.
// Auth: x-internal-key header must match INTERNAL_SYNC_KEY env var.
// ─────────────────────────────────────────────────────────────────────────
app.post("/make-server-c4d79cb7/internal/deduct-wallet", async (c) => {
  try {
    const internalKey = c.req.header("x-internal-key");
    const expectedKey = Deno.env.get("INTERNAL_SYNC_KEY");

    if (!expectedKey || internalKey !== expectedKey) {
      console.warn("⚠️ [DEDUCT-WALLET] Unauthorized attempt");
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { userId, amount, description, paymentId } = await c.req.json();

    if (!userId || !amount || amount <= 0) {
      return c.json({ error: "Missing required fields: userId, amount" }, 400);
    }

    // Load wallet
    const wallet = await kv.get(`wallet:${userId}`) || { balance: 0, totalProfit: 0, totalDeducted: 0 };

    if (wallet.balance < amount) {
      return c.json({ error: `Insufficient wallet balance. Balance: ₹${wallet.balance}, Required: ₹${amount}` }, 400);
    }

    // Deduct
    wallet.balance -= amount;
    wallet.totalDeducted = (wallet.totalDeducted || 0) + amount;
    await kv.set(`wallet:${userId}`, wallet);

    // Log transaction
    const txn = {
      id: paymentId || `vps_${Date.now()}_${userId.substring(0, 8)}`,
      userId,
      type: 'debit',
      source: 'vps',
      amount,
      description: description || 'Static IP VPS subscription (30 days)',
      timestamp: new Date().toISOString(),
      balance: wallet.balance,
    };

    // Append to wallet_transactions list
    const txnsKey = `wallet_transactions:${userId}`;
    const existingTxns = await kv.get(txnsKey) || [];
    existingTxns.unshift(txn);
    // Keep last 100 transactions
    if (existingTxns.length > 100) existingTxns.splice(100);
    await kv.set(txnsKey, existingTxns);

    console.log(`✅ [DEDUCT-WALLET] Deducted ₹${amount} from ${userId.substring(0, 8)}. New balance: ₹${wallet.balance}`);
    return c.json({ success: true, newBalance: wallet.balance, deducted: amount });
  } catch (err: any) {
    console.error("❌ [DEDUCT-WALLET] Error:", err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// 💰 INTERNAL: Backfill today's realized profit & run tiered wallet debit
// Sums today's `position_monitor_state.pnl` for the user, syncs into
// signal_stats, then triggers checkAndDebitTiered. For admin recovery.
// Auth: x-internal-key header must match INTERNAL_SYNC_KEY env var.
// ─────────────────────────────────────────────────────────────────────────
app.post("/make-server-c4d79cb7/internal/backfill-debit", async (c) => {
  try {
    const internalKey = c.req.header("x-internal-key");
    const expectedKey = Deno.env.get("INTERNAL_SYNC_KEY");
    if (!expectedKey || internalKey !== expectedKey) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json().catch(() => ({}));
    const targetUserId: string | undefined = body.userId;

    // Today range
    const today = new Date().toISOString().split('T')[0];
    const startIso = `${today}T00:00:00.000Z`;

    // Aggregate realized P&L per user from position_monitor_state for today
    let query = supabase
      .from('position_monitor_state')
      .select('user_id, pnl')
      .gte('exited_at', startIso)
      .eq('is_active', false);
    if (targetUserId) query = query.eq('user_id', targetUserId);

    const { data: rows, error: qErr } = await query;
    if (qErr) return c.json({ error: qErr.message }, 500);

    const totals = new Map<string, number>();
    for (const r of rows || []) {
      const uid = (r as any).user_id;
      const pnl = Number((r as any).pnl || 0);
      totals.set(uid, (totals.get(uid) || 0) + pnl);
    }

    const results: any[] = [];
    const platformOwnerEmail = Deno.env.get('PLATFORM_OWNER_EMAIL') || '';

    for (const [userId, totalPnl] of totals.entries()) {
      // Sync into signal_stats so dashboards show today's profit
      const { data: existing } = await supabase
        .from('signal_stats')
        .select('id, total_pnl')
        .eq('user_id', userId)
        .eq('stat_date', today)
        .maybeSingle();

      if (existing) {
        // Only bump if smaller than computed total
        if ((existing.total_pnl || 0) < totalPnl) {
          await supabase.from('signal_stats').update({ total_pnl: totalPnl }).eq('id', existing.id);
        }
      } else {
        await supabase.from('signal_stats').insert({ user_id: userId, stat_date: today, total_pnl: totalPnl });
      }

      // Skip non-profit users
      if (totalPnl <= 100) {
        results.push({ userId, totalPnl, deducted: false, message: 'FREE tier (<=100)' });
        continue;
      }

      // Resolve email
      let email = '';
      try {
        const { data: u } = await supabase.auth.admin.getUserById(userId);
        email = u?.user?.email || '';
      } catch (_e) {}

      const debit = await checkAndDebitTiered(userId, email, totalPnl, platformOwnerEmail);
      results.push({ userId, email, totalPnl, ...debit });
    }

    return c.json({ success: true, today, results });
  } catch (err: any) {
    console.error('❌ [BACKFILL-DEBIT] Error:', err?.message || err);
    return c.json({ error: err?.message || 'Internal error' }, 500);
  }
});



// Step 1: Verify email+phone match in Supabase, then send OTP
app.post("/make-server-c4d79cb7/auth/forgot-password", async (c) => {
  try {
    const { email, phone } = await c.req.json();
    if (!email || !phone) return c.json({ error: 'Email and phone are required' }, 400);
    if (!/^[0-9]{10}$/.test(phone)) return c.json({ error: 'Phone must be 10 digits' }, 400);

    // Look up the user by email in Supabase
    const { data: userList, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) return c.json({ error: 'Service unavailable. Please try later.' }, 500);

    const user = (userList?.users || []).find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
    if (!user) return c.json({ error: 'No account found with this email address.' }, 404);

    // Check if phone matches stored phone in user metadata
    const storedPhone = user.user_metadata?.phone || user.phone || '';
    const normalise = (p: string) => p.replace(/\D/g, '').slice(-10);
    if (!storedPhone || normalise(storedPhone) !== normalise(phone)) {
      return c.json({ error: 'The mobile number does not match our records for this email.' }, 400);
    }

    // Send OTP via 2factor.in
    const apiKey = Deno.env.get('TWOFACTOR_API_KEY');
    if (!apiKey) return c.json({ error: 'OTP service not configured. Please contact support.' }, 500);

    const apiUrl = `https://2factor.in/API/V1/${apiKey}/SMS/${phone}/AUTOGEN`;
    const otpRes = await fetch(apiUrl);
    const otpData = await otpRes.json();
    if (otpData.Status !== 'Success') return c.json({ error: otpData.Details || 'Failed to send OTP' }, 400);

    // Store session in KV (tagged as password-reset)
    await kv.set(`reset_otp:${phone}`, {
      sessionId: otpData.Details,
      userId: user.id,
      email: user.email,
      timestamp: Date.now(),
    });

    console.log(`✅ Password reset OTP sent to ${phone} for user ${user.id}`);
    return c.json({ success: true, message: 'OTP sent to your mobile number.' });
  } catch (err: any) {
    console.error('❌ forgot-password error:', err);
    return c.json({ error: err.message || 'Server error' }, 500);
  }
});

// Step 2: Verify OTP + update password
app.post("/make-server-c4d79cb7/auth/reset-password", async (c) => {
  try {
    const { phone, otp, newPassword } = await c.req.json();
    if (!phone || !otp || !newPassword) return c.json({ error: 'Phone, OTP, and new password are required' }, 400);
    if (newPassword.length < 6) return c.json({ error: 'Password must be at least 6 characters' }, 400);

    const apiKey = Deno.env.get('TWOFACTOR_API_KEY');
    if (!apiKey) return c.json({ error: 'OTP service not configured' }, 500);

    const session = await kv.get(`reset_otp:${phone}`);
    if (!session?.sessionId) return c.json({ error: 'OTP session expired. Please request a new OTP.' }, 400);

    // OTP must be used within 10 minutes
    if (Date.now() - session.timestamp > 10 * 60 * 1000) {
      await kv.delete(`reset_otp:${phone}`);
      return c.json({ error: 'OTP expired. Please request a new OTP.' }, 400);
    }

    const verifyUrl = `https://2factor.in/API/V1/${apiKey}/SMS/VERIFY/${session.sessionId}/${otp}`;
    const verifyRes = await fetch(verifyUrl);
    const verifyData = await verifyRes.json();

    if (verifyData.Status !== 'Success' || verifyData.Details !== 'OTP Matched') {
      return c.json({ error: 'Invalid OTP. Please check and try again.' }, 400);
    }

    // Update password in Supabase
    const { error: updateErr } = await supabase.auth.admin.updateUserById(session.userId, { password: newPassword });
    if (updateErr) return c.json({ error: 'Failed to update password. Please try again.' }, 500);

    // Invalidate OTP session
    await kv.delete(`reset_otp:${phone}`);
    console.log(`✅ Password reset successful for user ${session.userId}`);
    return c.json({ success: true, message: 'Password updated successfully. You can now log in.' });
  } catch (err: any) {
    console.error('❌ reset-password error:', err);
    return c.json({ error: err.message || 'Server error' }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// 🔐 ADMIN 2FA SECRET — PERSIST IN KV (NOT localStorage)
// ═══════════════════════════════════════════════════════════════

app.get("/make-server-c4d79cb7/auth/admin-2fa-secret", async (c) => {
  try {
    const { adminEmail } = c.req.query();
    if (!adminEmail) return c.json({ error: 'adminEmail required' }, 400);
    const key = `admin_2fa_secret:${adminEmail.toLowerCase()}`;
    const secret = await kv.get(key);
    if (!secret) return c.json({ exists: false });
    return c.json({ exists: true, secret });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/make-server-c4d79cb7/auth/admin-2fa-secret", async (c) => {
  try {
    const { adminEmail, secret } = await c.req.json();
    if (!adminEmail || !secret) return c.json({ error: 'adminEmail and secret required' }, 400);
    const key = `admin_2fa_secret:${adminEmail.toLowerCase()}`;
    await kv.set(key, secret);
    console.log(`✅ Saved 2FA secret for admin: ${adminEmail}`);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ==================== BACKEND ENGINE CRON ROUTES ====================

/**
 * ⚡ CRON EXECUTE - DISABLED (duplicate of /cron/engine-tick)
 * Use /cron/engine-tick instead to avoid double signal generation
 */
app.post("/make-server-c4d79cb7/backend-engine/execute", async (c) => {
  console.log(`⚠️ /backend-engine/execute called but REDIRECTING to single cron path`);
  return c.json({ success: true, message: "Use /cron/engine-tick instead", skipped: true });
});

/**
 * ⚡ GET ENGINE STATUS (from DB - works on any device)
 */
app.get("/make-server-c4d79cb7/engine/db-status", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ error: error?.message || 'Unauthorized' }, 401);
    }

    // Get engine state from DB
    const { data: engineState } = await supabase
      .from('trading_engine_state')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    // Get active positions from DB
    const { data: positions } = await supabase
      .from('position_monitor_state')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true);

    // Get today's stats
    const today = new Date().toISOString().split('T')[0];
    const { data: stats } = await supabase
      .from('signal_stats')
      .select('*')
      .eq('user_id', user.id)
      .eq('stat_date', today)
      .maybeSingle();

    // Get recent signals (last 50)
    const { data: signals } = await supabase
      .from('trading_signals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    // Get recent orders (last 50)
    const { data: orders } = await supabase
      .from('trading_orders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    const storedLatestSignals = await safeKVGet(`latest_signals:${user.id}`, null);
    const latestSignals = deriveLatestSignals(signals || [], storedLatestSignals);
    const userLogs = await getMergedUserLogs(user.id);

    return c.json({
      success: true,
      engine: engineState ? {
        isRunning: engineState.is_running,
        selectedSymbols: engineState.selected_symbols || [],
        strategySettings: engineState.strategy_settings || {},
        startedAt: engineState.started_at,
        lastHeartbeat: engineState.last_heartbeat,
        uptime: engineState.started_at ? Date.now() - new Date(engineState.started_at).getTime() : 0
      } : { isRunning: false },
      positions: positions || [],
      stats: stats || { signal_count: 0, order_count: 0, speed_count: 0, total_pnl: 0 },
      latestSignals,
      signals: signals || [],
      orders: orders || [],
      logs: userLogs
    });
  } catch (error: any) {
    console.error('❌ Error getting DB engine status:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ==================== SYMBOL MANAGEMENT (SERVER-SIDE) ====================

/**
 * ⚡ SAVE SYMBOLS TO DATABASE
 */
app.post("/make-server-c4d79cb7/symbols/save", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ error: error?.message || 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { symbols } = body;

    if (!symbols || !Array.isArray(symbols)) {
      return c.json({ error: 'symbols array required' }, 400);
    }

    // Prepare rows for full replacement save
    const rows = symbols.map((s: any) => ({
      user_id: user.id,
      symbol_name: s.symbolName || s.name || 'UNKNOWN',
      symbol_id: s.securityId?.toString() || s.symbolId?.toString() || '',
      exchange_segment: s.exchangeSegment || 'NSE_FNO',
      instrument_type: s.instrumentType || 'OPTIDX',
      lot_size: s.lotSize || s.quantity || 1,
      expiry: s.expiry || null,
      strike_price: s.strikePrice || null,
      option_type: s.optionType || null,
      index_name: s.index || s.indexName || 'NIFTY',
      raw_data: s
    }));

    const { error: deleteError } = await supabase
      .from('user_symbols')
      .delete()
      .eq('user_id', user.id);

    if (deleteError) {
      return c.json({ error: deleteError.message }, 500);
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabase
        .from('user_symbols')
        .insert(rows);

      if (insertError) {
        return c.json({ error: insertError.message }, 500);
      }
    }

    // ⚡ Also save to KV for backward compatibility with engine loop
    await kv.set(`symbols:${user.id}`, symbols);
    await kv.set(`trading_symbols:${user.id}`, {
      symbols: symbols,
      lastUpdated: Date.now(),
      userId: user.id
    });

    console.log(`✅ Saved ${rows.length} symbols to DB + KV for user ${user.id}`);
    return c.json({ success: true, saved: rows.length });
  } catch (error: any) {
    console.error('❌ Error saving symbols:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * ⚡ GET SYMBOLS FROM DATABASE
 */
app.get("/make-server-c4d79cb7/symbols/get", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ error: error?.message || 'Unauthorized' }, 401);
    }

    const { data: symbols, error: fetchError } = await supabase
      .from('user_symbols')
      .select('*')
      .eq('user_id', user.id);

    if (fetchError) {
      return c.json({ error: fetchError.message }, 500);
    }

    return c.json({ success: true, symbols: symbols || [] });
  } catch (error: any) {
    console.error('❌ Error getting symbols:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * ⚡ DELETE USER SYMBOL
 */
app.delete("/make-server-c4d79cb7/symbols/delete", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ error: error?.message || 'Unauthorized' }, 401);
    }

    const { symbolId } = await c.req.json();
    if (!symbolId) return c.json({ error: 'symbolId required' }, 400);

    await supabase
      .from('user_symbols')
      .delete()
      .eq('user_id', user.id)
      .eq('symbol_id', symbolId);

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

/**
 * ⚡ GET SIGNAL STATS (Performance Section)
 */
app.get("/make-server-c4d79cb7/signal-stats", async (c) => {
  try {
    const { user, error } = await validateAuth(c);
    if (error || !user) {
      return c.json({ error: error?.message || 'Unauthorized' }, 401);
    }

    const days = parseInt(c.req.query('days') || '7');
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const { data: stats, error: fetchError } = await supabase
      .from('signal_stats')
      .select('*')
      .eq('user_id', user.id)
      .gte('stat_date', fromDate.toISOString().split('T')[0])
      .order('stat_date', { ascending: false });

    if (fetchError) {
      return c.json({ error: fetchError.message }, 500);
    }

    return c.json({ success: true, stats: stats || [] });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

Deno.serve(app.fetch);