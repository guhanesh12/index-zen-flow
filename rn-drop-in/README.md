# React Native Update Check — Drop-in

Two files for your RN app:

- `checkAppUpdate.ts` — fetches version config from the public edge function
  `GET https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/mobile-version`
  and compares against the installed version.
- `ForceUpdateModal.tsx` — blocking modal with **Update Now** deep-linking to
  Play Store / App Store. When the installed version is below the admin's
  `minimumVersion` (or `forceUpdate` is on) the **Later** button is hidden.

## Usage

```tsx
import { useEffect, useState } from 'react';
import Constants from 'expo-constants'; // or react-native-device-info
import { checkAppUpdate, UpdateInfo } from './checkAppUpdate';
import ForceUpdateModal from './ForceUpdateModal';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

export default function App() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  useEffect(() => {
    checkAppUpdate(APP_VERSION).then(setInfo).catch(() => {});
  }, []);

  return (
    <>
      {info?.updateAvailable && <ForceUpdateModal info={info} />}
      {/* rest of your app */}
    </>
  );
}
```

## Admin control

Edit the version + store URLs from **Admin Dashboard → Mobile App Update**.
Toggle **Force Update** to prevent users below `minimumVersion` from
dismissing the prompt.
