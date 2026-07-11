// Drop-in module for React Native apps.
// Usage:
//   const info = await checkAppUpdate();
//   if (info.updateAvailable) { /* show <ForceUpdateModal info={info} /> */ }
//
// Requires: expo-constants OR react-native-device-info + Platform from RN.

import { Platform, Linking } from 'react-native';

const ENDPOINT = 'https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/mobile-version';

export interface UpdateInfo {
  updateAvailable: boolean;
  forceUpdate: boolean;
  currentVersion: string;      // current installed on device
  latestVersion: string;       // latest published
  minimumVersion: string;
  storeUrl: string;
  title: string;
  message: string;
}

// Compare semantic versions: -1 / 0 / 1
export function cmpVersion(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/**
 * @param installedVersion current app version (e.g. from expo-constants or DeviceInfo.getVersion())
 */
export async function checkAppUpdate(installedVersion: string): Promise<UpdateInfo> {
  const res = await fetch(ENDPOINT, { method: 'GET' });
  if (!res.ok) throw new Error(`update check failed: ${res.status}`);
  const cfg = await res.json();

  const isIOS = Platform.OS === 'ios';
  const latest = isIOS ? cfg.iosCurrentVersion : cfg.androidCurrentVersion;
  const minimum = isIOS ? cfg.iosMinimumVersion : cfg.androidMinimumVersion;
  const storeUrl = isIOS ? cfg.iosStoreUrl : cfg.androidStoreUrl;

  const belowMin = cmpVersion(installedVersion, minimum) < 0;
  const behindLatest = cmpVersion(installedVersion, latest) < 0;

  return {
    updateAvailable: behindLatest || belowMin,
    forceUpdate: belowMin || !!cfg.forceUpdate,
    currentVersion: installedVersion,
    latestVersion: latest,
    minimumVersion: minimum,
    storeUrl,
    title: cfg.title || 'Update Available',
    message: cfg.message || 'A new version is available.',
  };
}

export async function openStore(url: string) {
  const can = await Linking.canOpenURL(url);
  if (can) await Linking.openURL(url);
}
