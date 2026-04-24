// ⚡ TIERED PROFIT-BASED DEBIT LOGIC
// This module handles automatic wallet deductions based on daily profit tiers

import * as kv from "./kv_store.tsx";

export interface TieredDebitResult {
  success: boolean;
  deducted: boolean;
  amount?: number;
  newBalance?: number;
  currentTier: string;
  currentTierFee: number;
  nextTier?: {
    name: string;
    threshold: number;
    fee: number;
    remaining?: number;
  } | null;
  message: string;
  error?: string;
  required?: number;
  available?: number;
  isPlatformOwner?: boolean;
}

// ⚡ TIERED PRICING STRUCTURE
export const PRICING_TIERS = [
  { min: 0, max: 99.99, fee: 0, tier: 0, name: 'FREE' },
  { min: 100, max: 499.99, fee: 29, tier: 1, name: 'TIER 1' },
  { min: 500, max: 999.99, fee: 49, tier: 2, name: 'TIER 2' },
  { min: 1000, max: 1999.99, fee: 69, tier: 3, name: 'TIER 3' },
  { min: 2000, max: Infinity, fee: 89, tier: 4, name: 'TIER 4' }
];

export async function checkAndDebitTiered(
  userId: string,
  userEmail: string,
  totalProfit: number,
  platformOwnerEmail: string
): Promise<TieredDebitResult> {
  
  console.log(`\n💰 ============ TIERED PAYMENT CHECK ============`);
  console.log(`👤 User: ${userId}`);
  console.log(`📧 Email: ${userEmail}`);
  console.log(`📊 Total Profit: ₹${totalProfit}`);

  // ⚡ PLATFORM OWNER EXCLUSION
  if (userEmail === platformOwnerEmail) {
    console.log(`👑 PLATFORM OWNER DETECTED - No charges applied`);
    console.log(`✅ Free unlimited trading for platform owner`);
    console.log(`================================================\n`);
    
    return {
      success: true,
      deducted: false,
      message: 'Platform owner - no charges',
      isPlatformOwner: true,
      currentTier: 'OWNER',
      currentTierFee: 0,
      nextTier: null
    };
  }

  // Get wallet with daily tracking
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const wallet = await kv.get(`wallet:${userId}`) || { 
    balance: 0, 
    totalProfit: 0, 
    totalDeducted: 0,
    lastDebitDate: null,
    lastDebitTier: 0
  };
  
  // Get daily profit tracking
  const dailyProfitKey = `daily_profit:${userId}:${today}`;
  const dailyData = await kv.get(dailyProfitKey) || {
    date: today,
    profit: 0,
    lastDebitedTier: 0 // 0=none, 1=₹29, 2=₹49, 3=₹69, 4=₹89
  };
  
  console.log(`💼 Current Wallet: ₹${wallet.balance}`);
  console.log(`📅 Today's Date: ${today}`);
  console.log(`📈 Today's Profit: ₹${totalProfit}`);
  console.log(`🎫 Last Debited Tier Today: ${dailyData.lastDebitedTier}`);

  // Find current tier based on profit
  const currentTier = PRICING_TIERS.find(t => totalProfit >= t.min && totalProfit <= t.max);
  
  if (!currentTier) {
    console.log(`❌ Could not determine tier for profit: ₹${totalProfit}`);
    return {
      success: false,
      deducted: false,
      currentTier: 'UNKNOWN',
      currentTierFee: 0,
      message: 'Invalid profit amount',
      error: 'Invalid profit amount'
    };
  }

  console.log(`🎯 Current Tier: ${currentTier.name} (₹${currentTier.min}-₹${currentTier.max}) → Fee: ₹${currentTier.fee}`);

  // Check if we need to debit for this tier
  if (currentTier.tier > dailyData.lastDebitedTier && currentTier.fee > 0) {
    // New tier reached! Charge only the incremental difference from the last paid tier.
    // Example: Tier 1 = ₹29, Tier 2 cumulative = ₹49, so additional charge at Tier 2 is ₹20.
    const previousTier = PRICING_TIERS.find(t => t.tier === dailyData.lastDebitedTier);
    const previousFee = previousTier?.fee || 0;
    const additionalCharge = Math.max(0, currentTier.fee - previousFee);

    console.log(`🔥 NEW TIER REACHED! Charging: ₹${additionalCharge} for ${currentTier.name}`);

    if (additionalCharge === 0) {
      return {
        success: true,
        deducted: false,
        currentTier: currentTier.name,
        currentTierFee: currentTier.fee,
        message: `Already charged up to ${currentTier.name}`,
      };
    }

    // Check wallet balance
    if (wallet.balance < additionalCharge) {
      console.log(`❌ Insufficient balance: ₹${wallet.balance} < ₹${additionalCharge}`);
      return {
        success: false,
        deducted: false,
        error: 'Insufficient wallet balance',
        required: additionalCharge,
        available: wallet.balance,
        currentTier: currentTier.name,
        currentTierFee: currentTier.fee,
        message: 'Insufficient wallet balance'
      };
    }

    // Deduct from wallet
    const newBalance = wallet.balance - additionalCharge;
    const newTotalDeducted = (wallet.totalDeducted || 0) + additionalCharge;

    await kv.set(`wallet:${userId}`, {
      ...wallet,
      balance: newBalance,
      totalDeducted: newTotalDeducted,
      lastDebitDate: today,
      lastDebitTier: currentTier.tier,
      lastUpdated: Date.now(),
    });

    // Update daily profit tracking
    await kv.set(dailyProfitKey, {
      ...dailyData,
      profit: totalProfit,
      lastDebitedTier: currentTier.tier,
      lastDebitAmount: additionalCharge,
      lastDebitTimestamp: Date.now()
    });

    // Record transaction
    const transaction = {
      id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: userId,
      type: 'debit',
      amount: additionalCharge,
      balance: newBalance,
      timestamp: new Date().toISOString(),
      description: `${currentTier.name} Fee (Profit: ₹${totalProfit.toFixed(2)})`,
      source: 'auto_debit_tiered',
      tier: currentTier.tier,
      tierName: currentTier.name
    };
    
    const walletTransactions = await kv.get(`wallet_transactions:${userId}`) || [];
    walletTransactions.push(transaction);
    await kv.set(`wallet_transactions:${userId}`, walletTransactions);

    console.log(`✅ ₹${additionalCharge} debited for ${currentTier.name}`);
    console.log(`💼 New Balance: ₹${newBalance}`);
    console.log(`================================================\n`);

    // Find next tier info
    const nextTier = PRICING_TIERS.find(t => t.tier === currentTier.tier + 1);

    return {
      success: true,
      deducted: true,
      amount: additionalCharge,
      newBalance: newBalance,
      currentTier: currentTier.name,
      currentTierFee: currentTier.fee,
      nextTier: nextTier ? {
        name: nextTier.name,
        threshold: nextTier.min,
        fee: nextTier.fee
      } : null,
        message: `₹${additionalCharge} debited for ${currentTier.name} (total today: ₹${currentTier.fee})`,
    };
  } else {
    console.log(`✅ No new tier reached (Current: ${currentTier.name}, Last Debited: Tier ${dailyData.lastDebitedTier})`);
    console.log(`================================================\n`);

    // Update daily profit (no debit)
    await kv.set(dailyProfitKey, {
      ...dailyData,
      profit: totalProfit,
      lastUpdated: Date.now()
    });

    // Find next tier
    const nextTier = PRICING_TIERS.find(t => t.tier === currentTier.tier + 1);

    return {
      success: true,
      deducted: false,
      currentTier: currentTier.name,
      currentTierFee: currentTier.fee,
      nextTier: nextTier ? {
        name: nextTier.name,
        threshold: nextTier.min,
        fee: nextTier.fee,
        remaining: nextTier.min - totalProfit
      } : null,
      message: currentTier.fee === 0 ? 'No charge in FREE tier' : `Already paid for ${currentTier.name}`,
    };
  }
}

// Get current daily profit statistics
export async function getDailyProfitStats(userId: string) {
  const today = new Date().toISOString().split('T')[0];
  const dailyProfitKey = `daily_profit:${userId}:${today}`;
  const dailyData = await kv.get(dailyProfitKey) || {
    date: today,
    profit: 0,
    lastDebitedTier: 0
  };
  
  const currentTier = PRICING_TIERS.find(t => dailyData.profit >= t.min && dailyData.profit <= t.max);
  const nextTier = currentTier ? PRICING_TIERS.find(t => t.tier === currentTier.tier + 1) : null;
  
  return {
    date: today,
    profit: dailyData.profit,
    currentTier: currentTier?.name || 'UNKNOWN',
    currentTierFee: currentTier?.fee || 0,
    lastDebitedTier: dailyData.lastDebitedTier,
    nextTier: nextTier ? {
      name: nextTier.name,
      threshold: nextTier.min,
      fee: nextTier.fee,
      remaining: Math.max(0, nextTier.min - dailyData.profit)
    } : null
  };
}