// Initialize default admin hotkey in database
// This can be run once to set up the default GUHAN hotkey

import * as kv from "./kv_store.tsx";

export async function initializeDefaultHotkey() {
  try {
    console.log('🔑 Initializing default admin hotkey...');
    
    // Check if any hotkeys exist
    let existingHotkeys;
    try {
      existingHotkeys = await kv.getByPrefix('admin:hotkey:');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn('⚠️ Could not check existing hotkeys (database may not be ready yet):', errorMsg);
      // Don't throw - just skip initialization if database isn't ready
      return;
    }
    
    if (existingHotkeys && existingHotkeys.length > 0) {
      console.log(`✅ Found ${existingHotkeys.length} existing hotkeys - no initialization needed`);
      return;
    }
    
    // Create default GUHAN hotkey
    const defaultHotkey = {
      id: `hotkey_${Date.now()}_default`,
      hotkey: 'GUHAN',
      adminId: 'admin_001',
      name: 'Default Admin',
      createdAt: new Date().toISOString()
    };
    
    try {
      await kv.set(`admin:hotkey:${defaultHotkey.id}`, defaultHotkey);
      console.log('✅ Default admin hotkey initialized:', defaultHotkey);
      return defaultHotkey;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn('⚠️ Could not save default hotkey (database may not be ready yet):', errorMsg);
      // Don't throw - hotkey can be created later
      return;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn('⚠️ Error initializing default hotkey (non-critical):', errorMsg);
    // Don't throw - this is not a critical error
    // Hotkeys can still be managed through the admin UI
    return;
  }
}