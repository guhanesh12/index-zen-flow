// 🧪 TEST SCRIPT: Verify Dhan credentials and sync functionality
// This helps debug why sync isn't working

import * as kv from "./kv_store.tsx";

export async function testDhanSync(userId: string) {
  console.log('🧪 ===== TESTING DHAN SYNC =====');
  console.log(`👤 User ID: ${userId}`);
  
  // 1. Check credentials (FIXED: use correct key)
  const credentials = await kv.get(`api_credentials:${userId}`);
  console.log('🔑 Credentials:', credentials ? '✅ Found' : '❌ Not found');
  
  if (credentials) {
    console.log('  - Client ID:', credentials.dhanClientId ? '✅ Set' : '❌ Missing');
    console.log('  - Access Token:', credentials.dhanAccessToken ? '✅ Set' : '❌ Missing');
  }
  
  // 2. Check existing journal entries
  const allEntries = await kv.getByPrefix(`journal:${userId}:`);
  console.log(`📊 Total journal entries: ${allEntries.length}`);
  
  const today = new Date().toISOString().split('T')[0];
  const todayEntries = await kv.getByPrefix(`journal:${userId}:${today}`);
  console.log(`📅 Today's entries (${today}): ${todayEntries.length}`);
  
  if (todayEntries.length > 0) {
    console.log('  Sample entry:', todayEntries[0].value); // Extract value from {key, value}
  }
  
  console.log('🧪 ===== TEST COMPLETE =====');
  
  return {
    userId,
    hasCredentials: !!credentials,
    hasDhanClientId: !!(credentials?.dhanClientId),
    hasDhanAccessToken: !!(credentials?.dhanAccessToken),
    totalEntries: allEntries.length,
    todayEntries: todayEntries.length,
    today
  };
}