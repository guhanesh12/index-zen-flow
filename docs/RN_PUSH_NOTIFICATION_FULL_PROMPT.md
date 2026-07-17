# IndexPilot — React Native Push Notification Integration
## FULL LINE-BY-LINE PROMPT FOR BLACKBOX / CURSOR / VS CODE AI

> Copy this entire file into your RN AI assistant. It contains **every** detail: Firebase config, `google-services.json` / `GoogleService-Info.plist` placement, backend API URLs, payload shapes, automatic + admin push flows, foreground/background handlers, bell UI, and testing steps.

---

## 0. Project constants (use exactly)

```
SUPABASE_URL          = https://oklgqelcaujxntgjyuis.supabase.co
SUPABASE_ANON_KEY     = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rbGdxZWxjYXVqeG50Z2p5dWlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MTA0NjUsImV4cCI6MjA3NTA4NjQ2NX0.FnFcNQXGXGpsQXvR4TW1LDc23FlIBBglLhZsRdn9VV0
FIREBASE_PROJECT_ID   = indexpilot-app        (must match server FIREBASE_SERVICE_ACCOUNT_JSON)
FIREBASE_SENDER_ID    = <from your firebaseConfig messagingSenderId>
FIREBASE_APP_ID_WEB   = <from your firebaseConfig appId>
ANDROID_PACKAGE_NAME  = com.indexpilot.app
IOS_BUNDLE_ID         = com.indexpilot.app
```

The web `firebaseConfig` you pasted (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId, measurementId `G-6BTDWSVFPQ`) is **web-only**. RN does **not** use it. RN uses native Firebase config files below.

---

## 1. Firebase Console — create native apps

Open https://console.firebase.google.com → project `indexpilot-app`.

### 1a. Android app
1. Project settings → General → **Add app → Android**.
2. Android package name: `com.indexpilot.app`
3. App nickname: `IndexPilot RN Android`
4. Download **`google-services.json`**.
5. Place at: `android/app/google-services.json`
6. `android/build.gradle` → add classpath:
   ```gradle
   classpath 'com.google.gms:google-services:4.4.2'
   ```
7. `android/app/build.gradle` → bottom of file:
   ```gradle
   apply plugin: 'com.google.gms.google-services'
   ```
8. `android/app/src/main/AndroidManifest.xml` → inside `<application>`:
   ```xml
   <meta-data
     android:name="com.google.firebase.messaging.default_notification_channel_id"
     android:value="indexpilot_default" />
   <meta-data
     android:name="com.google.firebase.messaging.default_notification_icon"
     android:resource="@mipmap/ic_launcher" />
   ```

### 1b. iOS app
1. Project settings → **Add app → iOS**.
2. iOS bundle ID: `com.indexpilot.app`
3. Download **`GoogleService-Info.plist`**.
4. Place at: `ios/IndexPilot/GoogleService-Info.plist` and add it to the Xcode project (drag into the target, check "Copy items", target membership = your app).
5. Xcode → Signing & Capabilities → **+ Capability** → add:
   - **Push Notifications**
   - **Background Modes** → check **Remote notifications** and **Background fetch**.
6. Apple Developer portal:
   - Create an **APNs Auth Key** (.p8) — Keys → +.
   - Upload the .p8 in Firebase Console → Project settings → Cloud Messaging → **Apple app config** → APNs Authentication Key. Provide Key ID and Team ID.

---

## 2. Install packages

```bash
# RN CLI project (NOT Expo Go — Expo Go can't do FCM)
npm i @react-native-firebase/app @react-native-firebase/messaging
npm i @notifee/react-native
npm i @react-native-async-storage/async-storage
cd ios && pod install && cd ..
```

If Expo: use `expo-dev-client` + `@react-native-firebase/*` via config plugin, or use `expo-notifications` with FCM server key. This guide assumes bare RN.

---

## 3. Permissions

### iOS `ios/IndexPilot/Info.plist`
```xml
<key>UIBackgroundModes</key>
<array>
  <string>fetch</string>
  <string>remote-notification</string>
</array>
```

### Android 13+ `AndroidManifest.xml`
```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.VIBRATE"/>
<uses-permission android:name="android.permission.WAKE_LOCK"/>
```

---

## 4. Notification channel (Android) + request permission

Create `src/notifications/setup.ts`:
```ts
import notifee, { AndroidImportance, AndroidVisibility } from '@notifee/react-native';
import messaging from '@react-native-firebase/messaging';
import { Platform, PermissionsAndroid } from 'react-native';

export async function ensureNotificationSetup() {
  // Android channel
  await notifee.createChannel({
    id: 'indexpilot_default',
    name: 'IndexPilot Alerts',
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
    sound: 'default',
    vibration: true,
    lights: true,
    lightColor: '#22c55e',
  });

  // Android 13+ runtime permission
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  }

  // iOS permission
  if (Platform.OS === 'ios') {
    await messaging().requestPermission({ alert: true, badge: true, sound: true });
    await messaging().registerDeviceForRemoteMessages();
  }
}
```

---

## 5. FCM token registration → backend

Endpoint: `POST {SUPABASE_URL}/functions/v1/push-subscribe`

Headers:
```
Authorization: Bearer <supabase user access_token>
apikey: <SUPABASE_ANON_KEY>
Content-Type: application/json
```

Body:
```json
{
  "token": "<fcm token>",
  "platform": "android" | "ios",
  "deviceId": "<stable device id>",
  "appVersion": "1.0.0"
}
```

Code `src/notifications/register.ts`:
```ts
import messaging from '@react-native-firebase/messaging';
import { supabase } from '../lib/supabase';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config';

export async function registerFcmToken() {
  const token = await messaging().getToken();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || !token) return;

  await fetch(`${SUPABASE_URL}/functions/v1/push-subscribe`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token, platform: Platform.OS }),
  });

  // Refresh on rotation
  messaging().onTokenRefresh(async (newToken) => {
    await fetch(`${SUPABASE_URL}/functions/v1/push-subscribe`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: newToken, platform: Platform.OS }),
    });
  });
}
```

Call from `App.tsx` **after login**:
```ts
useEffect(() => {
  ensureNotificationSetup().then(registerFcmToken);
}, [userId]);
```

---

## 6. Foreground + background message handlers

`index.js` (entrypoint, above `AppRegistry.registerComponent`):
```js
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';

messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  await notifee.displayNotification({
    title: remoteMessage.notification?.title || remoteMessage.data?.title,
    body:  remoteMessage.notification?.body  || remoteMessage.data?.body,
    android: {
      channelId: 'indexpilot_default',
      smallIcon: 'ic_launcher',
      importance: AndroidImportance.HIGH,
      pressAction: { id: 'default' },
      lights: ['#22c55e', 300, 600],   // BLINK
    },
    ios: { sound: 'default' },
    data: remoteMessage.data,
  });
});
```

Inside `App.tsx`:
```ts
useEffect(() => {
  const unsub = messaging().onMessage(async (rm) => {
    await notifee.displayNotification({
      title: rm.notification?.title || rm.data?.title,
      body:  rm.notification?.body  || rm.data?.body,
      android: {
        channelId: 'indexpilot_default',
        smallIcon: 'ic_launcher',
        importance: AndroidImportance.HIGH,
        pressAction: { id: 'default' },
        lights: ['#22c55e', 300, 600],
      },
      ios: { sound: 'default' },
      data: rm.data,
    });
    refreshBell();  // update badge count immediately
  });
  return unsub;
}, []);
```

---

## 7. Server event → automatic push (already deployed)

You do **NOT** send from the app. The backend already fires FCM for:

| Event                       | Trigger source                          | Title example                       |
|-----------------------------|-----------------------------------------|-------------------------------------|
| `SIGNAL_GENERATED`          | `trading_signals` insert                | 📡 New Signal: NIFTY                |
| `ORDER_PLACED`              | `trading_orders` insert                 | 🧾 Order Placed: NIFTY 24800 CE     |
| `POSITION_CLOSED_PROFIT`    | `position_monitor_state` close          | ✅ Position Closed +₹1,250.00       |
| `POSITION_CLOSED_LOSS`      | `position_monitor_state` close          | 🔻 Position Closed -₹420.50         |
| `ENGINE_ON` / `ENGINE_OFF`  | `trading_engine_state` change           | ▶️ Trading Engine Started            |
| `WALLET_CREDIT`             | `wallet_transactions` insert            | 💰 Wallet Credited                  |
| `WALLET_DEBIT`              | `wallet_transactions` insert            | 💸 Wallet Debited                   |

All of these arrive at the device via the FCM token registered in step 5. Payload always includes `data.url` for deep-linking (`/signals`, `/orders`, `/positions`, `/wallet`, `/dashboard`).

---

## 8. Admin manual notification (server-side only)

Endpoint: `POST {SUPABASE_URL}/functions/v1/admin-push-send`
Requires an admin session token. App just needs to **receive** it. No RN action required beyond step 6.

---

## 9. In-app bell / notification history

Endpoint: `GET {SUPABASE_URL}/functions/v1/make-server-c4d79cb7/user/notifications`

Headers: same auth as step 5.

Response:
```json
{
  "notifications": [
    { "id":"...", "title":"📡 New Signal: NIFTY", "body":"BUY_CALL @ ₹24800",
      "data":{"url":"/signals"}, "read":false, "createdAt": 1737100000000 }
  ],
  "unreadCount": 3
}
```

Poll every **5–10 seconds** while app is foregrounded:
```ts
useEffect(() => {
  const id = setInterval(refreshBell, 7000);
  return () => clearInterval(id);
}, []);
```

Mark read: `POST /functions/v1/make-server-c4d79cb7/user/notifications/read` with `{ ids: [...] }`.

Bell UI: red dot + `unreadCount`, blink animation using `Animated.loop(Animated.sequence([...opacity 0.3→1→0.3, 600ms]))` when `unreadCount > 0`.

---

## 10. Deep link on tap

```ts
notifee.onForegroundEvent(({ type, detail }) => {
  if (type === EventType.PRESS) {
    const url = detail.notification?.data?.url;
    if (url) navigationRef.navigate(routeFromUrl(url));
  }
});

messaging().onNotificationOpenedApp((rm) => {
  const url = rm.data?.url;
  if (url) navigationRef.navigate(routeFromUrl(url));
});

messaging().getInitialNotification().then((rm) => {
  const url = rm?.data?.url;
  if (url) initialRouteRef.current = routeFromUrl(url);
});
```

---

## 11. Testing checklist

1. Log in on the RN app → check DB `kv_store_c4d79cb7` for key `push_tokens:<userId>` — must contain your FCM token.
2. In admin panel → **Send Test Notification** → arrives within 2 seconds, bell increments, notification blinks (Android LED / iOS badge).
3. Kill the app → send admin test → tap notification → app opens on the deep-link route.
4. In dashboard → toggle **Trading Engine ON** → `▶️ Trading Engine Started` push arrives.
5. Wait for next `trading_signals` row → `📡 New Signal` push arrives with correct index / strike.
6. Manual DB test:
   ```sql
   select public.notify_push_event('SIGNAL_GENERATED','<your uuid>','Test','Hello',
     '{"url":"/signals"}'::jsonb);
   ```
   Push arrives on your device within ~1 second.

---

## 12. Common failures

| Symptom                          | Fix                                                                 |
|----------------------------------|---------------------------------------------------------------------|
| No token returned                | `google-services.json` missing / wrong package name                 |
| Token OK but no push             | `FIREBASE_SERVICE_ACCOUNT_JSON` on server points to a different project |
| iOS no push in prod              | APNs .p8 not uploaded to Firebase, or Push capability missing       |
| Foreground silent                | Not calling `notifee.displayNotification` in `onMessage`            |
| Bell not blinking                | `unreadCount` not polled, or `Animated.loop` guarded by `count > 0` |
| Auto-signal push missing         | User row not in `push_tokens:<userId>` — re-register after login    |

---

## 13. Do NOT

- Do **not** bundle `FIREBASE_SERVICE_ACCOUNT_JSON` or any server key in the RN app.
- Do **not** call FCM HTTP v1 API from the app.
- Do **not** reuse the web `firebaseConfig` object in RN — use native config files.
- Do **not** subscribe to `messaging().onMessage` outside `useEffect` (leaks listeners).

---

**End of prompt. Paste this whole file into your RN AI. Every URL, header, payload, and file path above is production-correct for the IndexPilot backend.**
