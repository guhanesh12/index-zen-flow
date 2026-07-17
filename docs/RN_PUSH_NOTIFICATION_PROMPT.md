# RN push notification build prompt

Use this exact prompt in Blackbox / VS Code AI for the React Native app:

```text
Build IndexpilotAI React Native push notifications with Firebase Cloud Messaging and Supabase auth.

Firebase project details:
- Project ID: indexpilotai-e1106
- Sender ID / project number: 167770668435
- Android package: com.indexpilotai.app
- iOS bundle ID: com.indexpilotai.app
- Android config file: google-services.json from Firebase project indexpilotai-e1106
- iOS config file: GoogleService-Info.plist from Firebase project indexpilotai-e1106

Supabase / API details:
- Supabase URL: https://oklgqelcaujxntgjyuis.supabase.co
- Supabase anon key: use the app's public anon key from the web project/environment.
- Subscribe device token endpoint: POST https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/push-subscribe
- Admin manual broadcast endpoint: POST https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/admin-push-send
- User notification center endpoint: GET https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7/user/notifications
- Fallback notification center endpoint: GET https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/make-server-c4d79cb7/user/notifications

Security rules:
- Never put the Firebase service account JSON or private key inside the RN app.
- Do not send INTERNAL_SYNC_KEY from RN.
- All calls must use the logged-in Supabase user session access_token:
  Authorization: Bearer <session.access_token>
- Include apikey: <Supabase anon key> when calling Supabase Edge Functions directly.
- Admin broadcast must only be available to signed-in admin users.

Implementation requirements:
1. Install Firebase messaging for React Native:
   - @react-native-firebase/app
   - @react-native-firebase/messaging
   - notifee/react-native (or native local notification library) for foreground display, Android channels, badge/blink behavior.
2. Add google-services.json to android/app/google-services.json.
3. Add GoogleService-Info.plist to the iOS target in Xcode.
4. Request notification permission on login.
5. Create Android channel id exactly: indexpilot_default, high importance, sound default, vibration enabled.
6. Get FCM token after permission is granted.
7. Immediately subscribe the token:
   POST https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/push-subscribe
   headers:
     Authorization: Bearer <session.access_token>
     apikey: <Supabase anon key>
     Content-Type: application/json
   body:
     {
       "deviceToken": "<FCM_TOKEN>",
       "platform": "android" or "ios",
       "browser": "ReactNative",
       "device": "<device model/name>"
     }
   Expected response: { "success": true, "subscriberId": "...", "platform": "android" }
8. Re-subscribe whenever Firebase refreshes the token.
9. Foreground messages: show a local notification and update the app notification bell count immediately.
10. Background/quit messages: rely on Firebase background handler; on tap navigate using payload.data.url.
11. Notification bell/blink:
    - Fetch GET /user/notifications every 5–10 seconds while logged in, and also after any foreground FCM message.
    - Unread count = notifications where read is false.
    - Animate/blink bell when unread count increases.
12. Admin manual notification screen:
    POST https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/admin-push-send
    headers:
      Authorization: Bearer <admin session.access_token>
      apikey: <Supabase anon key>
      Content-Type: application/json
    body:
      { "title": "Test", "description": "Hello", "targetUrl": "/notifications" }
    Show delivered, failed, totalSubscribers, totalInAppSaved from the response.
13. Add a test button in RN settings:
    - Display current FCM token prefix.
    - Call push-subscribe.
    - Then admin can send a test notification from the web admin panel.

Acceptance test:
- Login on RN app.
- Permission prompt appears.
- FCM token is generated.
- push-subscribe returns success.
- Supabase has a push_subscriber row.
- Admin manual broadcast returns success.
- RN receives push when foreground, background, and app closed.
- Notification bell unread count increases and blinks.
- Automatic trading events like SIGNAL_GENERATED, ORDER_PLACED, POSITION_CLOSED also appear in the RN notification center.
```

Do not paste private Firebase service-account JSON into React Native. It belongs only in Supabase Edge Function secrets.