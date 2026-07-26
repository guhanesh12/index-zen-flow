# RN Notification Screen — Full Prompt (A→Z)

Backend is IndexPilot's Supabase + `push-notify` edge fn.
Every notification pushed to a user is also **saved server-side** at
`kv_store_c4d79cb7` with key `user_notifications:{userId}` and served by
`GET /make-server-c4d79cb7/user/notifications`.

## Base
- API base: `https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/make-server-c4d79cb7`
- Supabase anon key: value of `VITE_SUPABASE_PUBLISHABLE_KEY` (must be sent as `apikey` header on EVERY call).
- Auth: user's Supabase JWT (`session.access_token`) as `Authorization: Bearer <token>`.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET    | `/user/notifications` | list all (last 24h, auto-trimmed server-side) |
| POST   | `/user/notifications/:id/read` | mark 1 read |
| POST   | `/user/notifications/read-all` | mark all read |
| DELETE | `/user/notifications` | clear all |
| POST   | `/functions/v1/push-subscribe` (invoke) | register FCM device token |

## Notification shape (from server)
```ts
type Notification = {
  id: string;
  type: string;            // 'SIGNAL_GENERATED' | 'ORDER_PLACED' | 'POSITION_CLOSED_PROFIT' | 'MARKET_OPEN' | ...
  title: string;
  message: string;
  timestamp: number;       // ms
  read: boolean;
  data?: {
    imageUrl?: string;     // render as <Image> if present
    targetUrl?: string;    // deep-link / webview
    symbol?: string;
    pnl?: number;
    price?: number;
    [k: string]: any;
  };
};
```

## Fetch helper
```ts
import { supabase } from './supabase';
const API = 'https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/make-server-c4d79cb7';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

async function api(path: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON,
      'Authorization': `Bearer ${session.access_token}`,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

export const NotificationsAPI = {
  list:      () => api('/user/notifications').then(r => r.notifications ?? []),
  markRead:  (id: string) => api(`/user/notifications/${id}/read`, { method: 'POST' }),
  markAll:   () => api('/user/notifications/read-all', { method: 'POST' }),
  clearAll:  () => api('/user/notifications', { method: 'DELETE' }),
};
```

## Screen skeleton
```tsx
import { FlatList, Image, Text, TouchableOpacity, View, RefreshControl } from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { NotificationsAPI } from './notifications-api';

export function NotificationsScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try { setItems(await NotificationsAPI.list()); } finally { setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const onPress = async (n: any) => {
    if (!n.read) { await NotificationsAPI.markRead(n.id); load(); }
    // if (n.data?.targetUrl) Linking.openURL(n.data.targetUrl);
  };

  return (
    <FlatList
      data={items}
      keyExtractor={(x) => x.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
      ListEmptyComponent={<Text style={{ color:'#888', textAlign:'center', marginTop:40 }}>No notifications</Text>}
      renderItem={({ item }) => (
        <TouchableOpacity onPress={() => onPress(item)} style={{
          padding:14, marginHorizontal:12, marginVertical:6, borderRadius:14,
          backgroundColor: item.read ? '#111827' : '#1E293B',
          borderWidth:1, borderColor: item.read ? '#1F2937' : '#3B82F6',
        }}>
          <View style={{ flexDirection:'row', justifyContent:'space-between' }}>
            <Text style={{ color:'#fff', fontWeight:'700', flex:1 }}>{item.title}</Text>
            <Text style={{ color:'#64748b', fontSize:11 }}>
              {new Date(item.timestamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}
            </Text>
          </View>
          <Text style={{ color:'#cbd5e1', marginTop:6 }}>{item.message}</Text>
          {item.data?.imageUrl ? (
            <Image source={{ uri: item.data.imageUrl }} style={{ width:'100%', height:160, marginTop:10, borderRadius:10 }} />
          ) : null}
          {item.data?.pnl !== undefined && (
            <Text style={{ color: item.data.pnl >= 0 ? '#22c55e' : '#ef4444', marginTop:6, fontWeight:'700' }}>
              {item.data.pnl >= 0 ? '+' : ''}₹{Number(item.data.pnl).toFixed(2)}
            </Text>
          )}
        </TouchableOpacity>
      )}
    />
  );
}
```

## Foreground FCM
When FCM `onMessage` fires while the app is open, call `NotificationsAPI.list()` to refresh — the server has already stored it. Do NOT insert local-only items; that causes drift.

## Auto-behaviours (server-side, nothing to do in the app)
- Every notification auto-deletes after **24h**.
- Market Open push at **09:00 IST**, Market Close at **15:30 IST**, only on NSE trading days (Sun + holidays skipped).
- Admin can edit title/body/image in the Admin → Push Notifications → Auto Notifications section.
