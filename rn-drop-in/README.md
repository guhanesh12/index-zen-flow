# React Native App-Update — Drop-in

Two files for your RN app:

- `checkAppUpdate.ts` — fetches version config from the public edge function
- `ForceUpdateModal.tsx` — blocking / dismissible modal that deep-links to the store

## APIs

### 1) Public version endpoint (called by RN app)

```
GET https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/mobile-version
```

- No auth, no headers required. Response is `Cache-Control: no-store` so
  every fetch returns the latest admin-published values.
- Response shape:

```json
{
  "androidCurrentVersion": "1.2.0",
  "androidMinimumVersion": "1.0.0",
  "androidStoreUrl": "https://play.google.com/store/apps/details?id=com.indexpilot.app",
  "iosCurrentVersion": "1.2.0",
  "iosMinimumVersion": "1.0.0",
  "iosStoreUrl": "https://apps.apple.com/app/id123456789",
  "forceUpdate": false,
  "title": "New Update Available",
  "message": "Please update to the latest version."
}
```

### 2) Admin broadcast (already wired inside the web admin panel)

When the admin opens **Admin → Settings → App Update** and clicks
**Publish & Notify All Users**, the panel:
1. Saves the new version config to `mobile_app_config`.
2. Calls `admin-push-send` — an FCM broadcast to every registered device
   token in `kv_store_c4d79cb7 (push_subscriber:*)`.
3. RN app receives the push (data payload `type: "ADMIN_BROADCAST"`) and
   should re-run `checkAppUpdate()` to show the modal immediately.

You do **not** need to call this endpoint from the RN app. Just make sure
the app registers its FCM token via your existing subscribe flow.

## RN usage

```tsx
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import Constants from 'expo-constants';
import { checkAppUpdate, UpdateInfo } from './checkAppUpdate';
import ForceUpdateModal from './ForceUpdateModal';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

export default function App() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const recheck = () => checkAppUpdate(APP_VERSION).then(setInfo).catch(() => {});

  useEffect(() => {
    recheck();                                       // on cold start
    const sub = AppState.addEventListener('change', s => s === 'active' && recheck());
    const timer = setInterval(recheck, 30 * 60 * 1000); // every 30 min
    const unFg = messaging().onMessage(recheck);     // FCM foreground
    const unBg = messaging().onNotificationOpenedApp(recheck);
    return () => { sub.remove(); clearInterval(timer); unFg(); unBg(); };
  }, []);

  return (
    <>
      {info?.updateAvailable && <ForceUpdateModal info={info} />}
      {/* rest of your app */}
    </>
  );
}
```

## Why the popup didn't show before

- Old `mobile-version` response had `Cache-Control: public, max-age=60` — CDNs
  and RN's native fetch cache could serve stale data for up to a minute
  (sometimes longer). Now it's `no-store`.
- RN app was only checking on cold start. Add the `AppState` + `setInterval`
  + `messaging().onMessage` triggers above so the popup appears the moment
  the admin clicks **Publish & Notify All Users**.
