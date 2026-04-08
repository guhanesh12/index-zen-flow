/**
 * 🌐 IP Pool Manager for Multi-User Static IP Assignment
 * 
 * This service manages a pool of static IPs and assigns them to users.
 * Each user gets their own dedicated static IP for Dhan broker compliance.
 * 
 * Architecture:
 * 1. Admin adds multiple VPS/Proxy IPs to the pool
 * 2. Users subscribe to dedicated IP service (₹199/month)
 * 3. System assigns available IP to user
 * 4. All user's Dhan API calls route through their assigned IP
 * 
 * Supported IP Sources:
 * - Multiple Hostinger VPS instances
 * - AWS Elastic IPs
 * - Proxy services (BrightData, Oxylabs, etc.)
 */

import * as kv from './kv_store.tsx';

// IP Pool Configuration
export interface IPPoolEntry {
  ipAddress: string;           // e.g., "187.127.140.245"
  vpsUrl: string;              // e.g., "http://187.127.140.245:3000"
  provider: string;            // "hostinger" | "aws" | "proxy" | "digitalocean"
  status: 'active' | 'inactive' | 'maintenance';
  maxUsers: number;            // Max users per IP (usually 1 for Dhan compliance)
  currentUsers: number;        // Current assigned users
  assignedUsers: string[];     // Array of user IDs
  apiKey?: string;             // Optional: If IP server requires auth
  metadata?: any;              // Additional info (region, cost, etc.)
  createdAt: string;
  lastCheckedAt?: string;      // Health check timestamp
}

// User IP Assignment
export interface UserIPAssignment {
  userId: string;
  ipAddress: string;
  vpsUrl: string;
  provider: string;
  assignedAt: string;
  subscriptionStatus: 'active' | 'expired' | 'cancelled';
  expiresAt: string;           // Subscription expiry
  monthlyFee: number;          // ₹199 or custom price
  lastUsedAt?: string;
}

// KV Store Keys
const IP_POOL_PREFIX = 'ip_pool:';
const USER_IP_PREFIX = 'user_ip_assignment:';
const LEGACY_USER_IP_PREFIX = 'ip_assignment:';
const IP_STATS_KEY = 'ip_pool_stats';
const DEFAULT_DEDICATED_IP_FEE = 599;

function getUserAssignmentKey(userId: string): string {
  return `${USER_IP_PREFIX}${userId}`;
}

function getLegacyUserAssignmentKey(userId: string): string {
  return `${LEGACY_USER_IP_PREFIX}${userId}:dedicated`;
}

function normalizeAssignment(userId: string, raw: any): UserIPAssignment | null {
  if (!raw?.ipAddress) {
    return null;
  }

  const assignedAt = raw.assignedAt || raw.createdAt || new Date().toISOString();
  const expiresAt = raw.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const expiresAtMs = new Date(expiresAt).getTime();
  const subscriptionStatus =
    raw.subscriptionStatus === 'cancelled'
      ? 'cancelled'
      : Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()
        ? 'expired'
        : 'active';

  return {
    userId,
    ipAddress: raw.ipAddress,
    vpsUrl: raw.vpsUrl || `http://${raw.ipAddress}:3000`,
    provider: raw.provider || 'digitalocean',
    assignedAt,
    subscriptionStatus,
    expiresAt,
    monthlyFee: Number.isFinite(Number(raw.monthlyFee)) ? Number(raw.monthlyFee) : DEFAULT_DEDICATED_IP_FEE,
    lastUsedAt: raw.lastUsedAt || assignedAt,
  };
}

function getAssignmentRank(assignment: UserIPAssignment): number {
  if (assignment.subscriptionStatus === 'active') return 2;
  if (assignment.subscriptionStatus === 'expired') return 1;
  return 0;
}

async function persistUserAssignment(assignment: UserIPAssignment): Promise<void> {
  await kv.set(getUserAssignmentKey(assignment.userId), assignment);
  await kv.set(getLegacyUserAssignmentKey(assignment.userId), assignment);
}

/**
 * Add a new IP to the pool
 */
export async function addIPToPool(ipConfig: Omit<IPPoolEntry, 'currentUsers' | 'assignedUsers' | 'createdAt'>): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if IP already exists
    const existing = await kv.get(`${IP_POOL_PREFIX}${ipConfig.ipAddress}`);
    if (existing) {
      return { success: false, error: 'IP address already in pool' };
    }

    const ipEntry: IPPoolEntry = {
      ...ipConfig,
      currentUsers: 0,
      assignedUsers: [],
      createdAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString()
    };

    await kv.set(`${IP_POOL_PREFIX}${ipConfig.ipAddress}`, ipEntry);
    
    // Update stats
    await updateIPPoolStats();

    console.log(`✅ IP ${ipConfig.ipAddress} added to pool`);
    return { success: true };
  } catch (error: any) {
    console.error('❌ Failed to add IP to pool:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all IPs in the pool
 */
export async function getIPPool(): Promise<IPPoolEntry[]> {
  try {
    const entries = await kv.getByPrefix(IP_POOL_PREFIX);
    return entries.map(e => e.value as IPPoolEntry).sort((a, b) => a.currentUsers - b.currentUsers);
  } catch (error) {
    console.error('❌ Failed to get IP pool:', error);
    return [];
  }
}

/**
 * Get available IP for assignment
 */
export async function getAvailableIP(): Promise<IPPoolEntry | null> {
  try {
    const pool = await getIPPool();
    
    // Find first active IP with capacity
    const availableIP = pool.find(ip => 
      ip.status === 'active' && 
      ip.currentUsers < ip.maxUsers
    );

    return availableIP || null;
  } catch (error) {
    console.error('❌ Failed to get available IP:', error);
    return null;
  }
}

/**
 * Assign IP to user
 */
export async function assignIPToUser(
  userId: string, 
  monthlyFee: number = 199
): Promise<{ success: boolean; assignment?: UserIPAssignment; error?: string }> {
  try {
    // Check if user already has an IP
    const existingAssignment = await getUserIPAssignment(userId);
    if (existingAssignment && existingAssignment.subscriptionStatus === 'active') {
      return { 
        success: true, 
        assignment: existingAssignment,
        error: 'User already has an active IP assignment' 
      };
    }

    // Get available IP
    const availableIP = await getAvailableIP();
    if (!availableIP) {
      return { 
        success: false, 
        error: 'No available IPs in pool. Please contact admin to add more IPs.' 
      };
    }

    // Create assignment
    const assignment: UserIPAssignment = {
      userId,
      ipAddress: availableIP.ipAddress,
      vpsUrl: availableIP.vpsUrl,
      provider: availableIP.provider,
      assignedAt: new Date().toISOString(),
      subscriptionStatus: 'active',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      monthlyFee,
      lastUsedAt: new Date().toISOString()
    };

    // Save assignment
    await persistUserAssignment(assignment);

    // Update IP pool entry
    availableIP.currentUsers += 1;
    availableIP.assignedUsers.push(userId);
    await kv.set(`${IP_POOL_PREFIX}${availableIP.ipAddress}`, availableIP);

    // Update stats
    await updateIPPoolStats();

    console.log(`✅ IP ${availableIP.ipAddress} assigned to user ${userId}`);
    return { success: true, assignment };
  } catch (error: any) {
    console.error('❌ Failed to assign IP to user:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get user's IP assignment
 */
export async function getUserIPAssignment(userId: string): Promise<UserIPAssignment | null> {
  try {
    const [currentRaw, legacyRaw] = await Promise.all([
      kv.get(getUserAssignmentKey(userId)),
      kv.get(getLegacyUserAssignmentKey(userId)),
    ]);

    const candidates = [
      normalizeAssignment(userId, currentRaw),
      normalizeAssignment(userId, legacyRaw),
    ].filter(Boolean) as UserIPAssignment[];

    if (candidates.length === 0) {
      return null;
    }

    const bestAssignment = [...candidates].sort((a, b) => {
      const rankDiff = getAssignmentRank(b) - getAssignmentRank(a);
      if (rankDiff !== 0) return rankDiff;
      return new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime();
    })[0];

    const currentNormalized = normalizeAssignment(userId, currentRaw);
    if (!currentNormalized || JSON.stringify(currentNormalized) !== JSON.stringify(bestAssignment)) {
      await persistUserAssignment(bestAssignment);
    }

    return bestAssignment;
  } catch (error) {
    console.error('❌ Failed to get user IP assignment:', error);
    return null;
  }
}

/**
 * Remove IP assignment from user
 */
export async function removeIPFromUser(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const assignment = await getUserIPAssignment(userId);
    if (!assignment) {
      return { success: false, error: 'No IP assignment found for user' };
    }

    // Update IP pool entry
    const ipEntry = await kv.get(`${IP_POOL_PREFIX}${assignment.ipAddress}`) as IPPoolEntry;
    if (ipEntry) {
      ipEntry.currentUsers = Math.max(0, ipEntry.currentUsers - 1);
      ipEntry.assignedUsers = ipEntry.assignedUsers.filter(id => id !== userId);
      await kv.set(`${IP_POOL_PREFIX}${assignment.ipAddress}`, ipEntry);
    }

    // Remove assignment
    await kv.del(getUserAssignmentKey(userId));
    await kv.del(getLegacyUserAssignmentKey(userId));

    // Update stats
    await updateIPPoolStats();

    console.log(`✅ IP assignment removed for user ${userId}`);
    return { success: true };
  } catch (error: any) {
    console.error('❌ Failed to remove IP from user:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update IP pool statistics
 */
async function updateIPPoolStats() {
  try {
    const pool = await getIPPool();
    const stats = {
      totalIPs: pool.length,
      activeIPs: pool.filter(ip => ip.status === 'active').length,
      totalCapacity: pool.reduce((sum, ip) => sum + ip.maxUsers, 0),
      usedCapacity: pool.reduce((sum, ip) => sum + ip.currentUsers, 0),
      availableCapacity: pool.reduce((sum, ip) => sum + (ip.maxUsers - ip.currentUsers), 0),
      updatedAt: new Date().toISOString()
    };

    await kv.set(IP_STATS_KEY, stats);
  } catch (error) {
    console.error('❌ Failed to update IP pool stats:', error);
  }
}

/**
 * Get IP pool statistics
 */
export async function getIPPoolStats() {
  try {
    return await kv.get(IP_STATS_KEY);
  } catch (error) {
    console.error('❌ Failed to get IP pool stats:', error);
    return null;
  }
}

/**
 * Route order through user's assigned IP
 */
export async function placeOrderViaUserIP(
  userId: string,
  credentials: { dhanClientId: string; dhanAccessToken: string },
  orderDetails: any
): Promise<any> {
  try {
    // Get user's assigned IP
    const assignment = await getUserIPAssignment(userId);
    
    if (!assignment) {
      throw new Error('No IP assigned to user. Please subscribe to dedicated IP service.');
    }

    if (assignment.subscriptionStatus !== 'active') {
      throw new Error('IP subscription expired. Please renew your subscription.');
    }

    // Check if subscription expired
    if (new Date(assignment.expiresAt) < new Date()) {
      // Mark as expired
      assignment.subscriptionStatus = 'expired';
      await kv.set(`${USER_IP_PREFIX}${userId}`, assignment);
      throw new Error('IP subscription expired. Please renew your subscription.');
    }

    // Get API key for this IP's server
    const ipEntry = await kv.get(`${IP_POOL_PREFIX}${assignment.ipAddress}`) as IPPoolEntry;
    const apiKey = ipEntry?.apiKey || Deno.env.get('ORDER_SERVER_API_KEY');

    if (!apiKey) {
      throw new Error('Order server API key not configured');
    }

    const endpoint = `${assignment.vpsUrl}/place-order`;

    // Format order details
    const completeOrderDetails = {
      dhanClientId: credentials.dhanClientId,
      securityId: String(orderDetails.securityId || ''),
      transactionType: orderDetails.transactionType || 'BUY',
      exchangeSegment: orderDetails.exchangeSegment || 'NSE_FNO',
      productType: orderDetails.productType || 'INTRADAY',
      orderType: orderDetails.orderType || 'MARKET',
      validity: orderDetails.validity || 'DAY',
      quantity: orderDetails.quantity,
      correlationId: orderDetails.correlationId || `ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      disclosedQuantity: orderDetails.disclosedQuantity || 0,
      price: orderDetails.price || 0,
      triggerPrice: orderDetails.triggerPrice || 0,
      afterMarketOrder: orderDetails.afterMarketOrder || false,
    };

    console.log(`📤 [USER IP ${assignment.ipAddress}] Placing order for user ${userId}`);

    // Forward to user's assigned IP server
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        userId,
        accessToken: credentials.dhanAccessToken,
        orderDetails: completeOrderDetails,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [USER IP ${assignment.ipAddress}] Order failed:`, errorText);
      throw new Error(`Order placement failed: ${errorText}`);
    }

    const result = await response.json();

    // Update last used timestamp
    assignment.lastUsedAt = new Date().toISOString();
    await kv.set(`${USER_IP_PREFIX}${userId}`, assignment);

    console.log(`✅ [USER IP ${assignment.ipAddress}] Order placed successfully`);
    return result;

  } catch (error: any) {
    console.error('❌ Failed to place order via user IP:', error);
    throw error;
  }
}

/**
 * Check subscription and auto-debit for IP service
 */
export async function checkIPSubscriptionAndDebit(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const assignment = await getUserIPAssignment(userId);
    if (!assignment) {
      return { success: false, error: 'No IP assignment found' };
    }

    // Check if subscription is expiring in next 24 hours
    const expiresAt = new Date(assignment.expiresAt);
    const now = new Date();
    const hoursUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilExpiry <= 24 && hoursUntilExpiry > 0) {
      // Try to auto-debit from wallet
      // This would integrate with your existing wallet system
      console.log(`⚠️ IP subscription for user ${userId} expiring in ${hoursUntilExpiry.toFixed(1)} hours`);
      
      // Extend subscription by 30 days if payment successful
      assignment.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await kv.set(`${USER_IP_PREFIX}${userId}`, assignment);
      
      return { success: true };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Remove IP from pool
 */
export async function removeIPFromPool(ipAddress: string): Promise<{ success: boolean; error?: string }> {
  try {
    const ipEntry = await kv.get(`${IP_POOL_PREFIX}${ipAddress}`) as IPPoolEntry;
    
    if (!ipEntry) {
      return { success: false, error: 'IP not found in pool' };
    }

    if (ipEntry.currentUsers > 0) {
      return { 
        success: false, 
        error: `Cannot remove IP. ${ipEntry.currentUsers} users still assigned. Reassign users first.` 
      };
    }

    await kv.del(`${IP_POOL_PREFIX}${ipAddress}`);
    await updateIPPoolStats();

    console.log(`✅ IP ${ipAddress} removed from pool`);
    return { success: true };
  } catch (error: any) {
    console.error('❌ Failed to remove IP from pool:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Health check for all IPs in pool
 */
export async function healthCheckIPPool(): Promise<{ totalIPs: number; healthyIPs: number; unhealthyIPs: string[] }> {
  try {
    const pool = await getIPPool();
    const unhealthyIPs: string[] = [];
    let healthyCount = 0;

    for (const ip of pool) {
      try {
        const response = await fetch(`${ip.vpsUrl}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000), // 5 second timeout
        });

        if (response.ok) {
          healthyCount++;
          // Update last checked timestamp
          ip.lastCheckedAt = new Date().toISOString();
          await kv.set(`${IP_POOL_PREFIX}${ip.ipAddress}`, ip);
        } else {
          unhealthyIPs.push(ip.ipAddress);
        }
      } catch (error) {
        console.error(`❌ Health check failed for IP ${ip.ipAddress}`);
        unhealthyIPs.push(ip.ipAddress);
      }
    }

    return {
      totalIPs: pool.length,
      healthyIPs: healthyCount,
      unhealthyIPs
    };
  } catch (error) {
    console.error('❌ Failed to perform health check:', error);
    return { totalIPs: 0, healthyIPs: 0, unhealthyIPs: [] };
  }
}
