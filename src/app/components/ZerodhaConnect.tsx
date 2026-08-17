// @ts-nocheck
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Key, CheckCircle2, XCircle, RefreshCw, ExternalLink, ShieldCheck, Zap } from "lucide-react";
import { toast } from "sonner";
import { fetchWithAuth, getAccessToken } from "../utils/apiClient";

interface Props {
  serverUrl: string;
  accessToken: string;
  onConnected?: () => void;
}

const DEFAULT_REDIRECT =
  "https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7/broker/kite/callback";

export function ZerodhaConnect({ serverUrl, accessToken, onConnected }: Props) {
  const [row, setRow] = useState<any>(null);
  const [liveCheck, setLiveCheck] = useState<any>(null);
  const [activeBroker, setActiveBroker] = useState<string>("dhan");
  const [form, setForm] = useState({ apiKey: "", apiSecret: "", redirectUrl: DEFAULT_REDIRECT });
  const [busy, setBusy] = useState<"" | "save" | "login" | "consume" | "verify" | "disconnect" | "activate">("");
  const [loading, setLoading] = useState(false);

  const getToken = async () => (await getAccessToken()) || accessToken;

  const loadStatus = async () => {
    try {
      setLoading(true);
      const tok = await getToken();
      const res = await fetchWithAuth(`${serverUrl}/broker/kite/status`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      const data = await res.json();
      setRow(data?.credentials || null);
      setLiveCheck(data?.liveCheck || null);
      setActiveBroker(data?.activeBroker || "dhan");
      if (data?.credentials) {
        setForm((f) => ({
          ...f,
          apiKey: data.credentials.api_key || f.apiKey,
          redirectUrl: data.credentials.redirect_url || f.redirectUrl,
        }));
      }
    } catch (e) {
      console.error("kite status error", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Zerodha callback popup → postMessage with request_token
  useEffect(() => {
    const handler = async (ev: MessageEvent) => {
      const data: any = ev.data;
      if (!data || data.type !== "KITE_OAUTH_TOKEN" || !data.requestToken) return;
      await consumeRequestToken(String(data.requestToken));
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrl, accessToken]);

  const saveKeys = async () => {
    if (!form.apiKey || !form.apiSecret) {
      toast.error("Enter your Kite API Key and API Secret");
      return;
    }
    setBusy("save");
    try {
      const tok = await getToken();
      const res = await fetchWithAuth(`${serverUrl}/broker/kite/save-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to save");
      toast.success("Kite API Key & Secret saved");
      setRow(data.credentials);
      setForm((f) => ({ ...f, apiSecret: "" }));
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setBusy("");
    }
  };

  const startLogin = async () => {
    setBusy("login");
    try {
      const tok = await getToken();
      const res = await fetchWithAuth(`${serverUrl}/broker/kite/login-url`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      const data = await res.json();
      if (!res.ok || !data.loginUrl) throw new Error(data.error || "Could not build login URL");
      window.open(data.loginUrl, "kite_login", "width=520,height=720");
    } catch (e: any) {
      toast.error(e.message || "Login failed");
    } finally {
      setBusy("");
    }
  };

  const consumeRequestToken = async (requestToken: string) => {
    setBusy("consume");
    try {
      const tok = await getToken();
      const res = await fetchWithAuth(`${serverUrl}/broker/kite/consume`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ requestToken }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Session exchange failed");
      toast.success("Zerodha connected");
      setRow(data.credentials);
      setLiveCheck(data.liveCheck);
      setActiveBroker(data.activeBroker || activeBroker);
      onConnected?.();
    } catch (e: any) {
      toast.error(e.message || "Zerodha login failed");
    } finally {
      setBusy("");
    }
  };

  const verify = async () => {
    setBusy("verify");
    try {
      const tok = await getToken();
      const res = await fetchWithAuth(`${serverUrl}/broker/kite/verify`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}` },
      });
      const data = await res.json();
      setLiveCheck(data.liveCheck || null);
      if (data?.liveCheck?.ok) toast.success("Zerodha session is live");
      else toast.error(data?.liveCheck?.error || data?.error || "Session invalid");
    } catch (e: any) {
      toast.error(e.message || "Verify failed");
    } finally {
      setBusy("");
    }
  };

  const makeActive = async () => {
    setBusy("activate");
    try {
      const tok = await getToken();
      const res = await fetchWithAuth(`${serverUrl}/broker/active`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ broker: "zerodha" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Could not switch broker");
      setActiveBroker("zerodha");
      toast.success("Orders will now be placed through Zerodha");
      onConnected?.();
    } catch (e: any) {
      toast.error(e.message || "Switch failed");
    } finally {
      setBusy("");
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    try {
      const tok = await getToken();
      await fetchWithAuth(`${serverUrl}/broker/kite/disconnect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}` },
      });
      setRow(null);
      setLiveCheck(null);
      setActiveBroker("dhan");
      toast.success("Zerodha disconnected");
      onConnected?.();
    } catch (e: any) {
      toast.error(e.message || "Disconnect failed");
    } finally {
      setBusy("");
    }
  };

  const connected = !!row?.access_token_set && liveCheck?.ok !== false;

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="w-5 h-5 text-orange-500" />
          Zerodha Kite Connect
          {connected ? (
            <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-700">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="text-zinc-400 border-zinc-700">
              <XCircle className="w-3 h-3 mr-1" /> Not connected
            </Badge>
          )}
          {activeBroker === "zerodha" && (
            <Badge className="bg-orange-600/20 text-orange-400 border-orange-700">Active broker</Badge>
          )}
        </CardTitle>
        <CardDescription className="text-zinc-400">
          Login with your Kite Connect app. Orders route through your existing dedicated static IP —
          the same VPS already used for Dhan. Kite access tokens reset daily at 6:00 AM IST.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>API Key</Label>
            <Input
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              placeholder="Kite Connect API key"
              className="bg-zinc-950 border-zinc-800"
            />
          </div>
          <div className="space-y-1.5">
            <Label>API Secret</Label>
            <Input
              type="password"
              value={form.apiSecret}
              onChange={(e) => setForm({ ...form, apiSecret: e.target.value })}
              placeholder={row?.api_secret_set ? "•••••••• (saved)" : "Kite Connect API secret"}
              className="bg-zinc-950 border-zinc-800"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Redirect URL (paste this in your Kite app settings)</Label>
            <Input
              value={form.redirectUrl}
              onChange={(e) => setForm({ ...form, redirectUrl: e.target.value })}
              className="bg-zinc-950 border-zinc-800 text-xs"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={saveKeys} disabled={busy === "save"} className="bg-zinc-800 hover:bg-zinc-700">
            {busy === "save" ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
            Save Keys
          </Button>
          <Button onClick={startLogin} disabled={busy === "login" || !row?.api_secret_set} className="bg-orange-600 hover:bg-orange-500">
            <ExternalLink className="w-4 h-4 mr-2" /> Login with Zerodha
          </Button>
          <Button variant="outline" onClick={verify} disabled={busy === "verify" || !row?.access_token_set} className="border-zinc-700">
            <RefreshCw className={`w-4 h-4 mr-2 ${busy === "verify" ? "animate-spin" : ""}`} /> Test Connection
          </Button>
          {connected && activeBroker !== "zerodha" && (
            <Button onClick={makeActive} disabled={busy === "activate"} className="bg-emerald-600 hover:bg-emerald-500">
              <Zap className="w-4 h-4 mr-2" /> Use Zerodha for orders
            </Button>
          )}
          {row && (
            <Button variant="ghost" onClick={disconnect} disabled={busy === "disconnect"} className="text-rose-400">
              Disconnect
            </Button>
          )}
        </div>

        {row?.kite_user_id && (
          <div className="text-xs text-zinc-400">
            Kite user: <span className="text-zinc-200">{row.kite_user_name || row.kite_user_id}</span>
            {row.access_token_expiry && (
              <> · session valid till {new Date(row.access_token_expiry).toLocaleString("en-IN")}</>
            )}
          </div>
        )}

        {liveCheck && (
          <Alert className={liveCheck.ok ? "border-emerald-800 bg-emerald-950/40" : "border-rose-900 bg-rose-950/40"}>
            <AlertDescription className="text-sm">
              {liveCheck.ok
                ? `Live check OK${liveCheck.balance !== undefined ? ` · Available margin ₹${Number(liveCheck.balance).toLocaleString("en-IN")}` : ""}`
                : `Live check failed: ${liveCheck.error || "unknown error"}`}
            </AlertDescription>
          </Alert>
        )}

        {loading && <p className="text-xs text-zinc-500">Loading status…</p>}
      </CardContent>
    </Card>
  );
}

export default ZerodhaConnect;
