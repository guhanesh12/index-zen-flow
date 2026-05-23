// @ts-nocheck
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Key, CheckCircle2, XCircle, RefreshCw, ExternalLink, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { fetchWithAuth, getAccessToken } from "../utils/apiClient";

interface Props {
  serverUrl: string;
  accessToken: string;
  onConnected?: () => void;
}

interface BrokerRow {
  dhan_client_id?: string;
  dhan_client_name?: string;
  dhan_client_ucc?: string;
  api_key?: string;
  api_secret_set?: boolean;
  access_token?: string;
  access_token_expiry?: string | null;
  api_key_expiry?: string | null;
  redirect_url?: string;
  postback_url?: string | null;
  last_status?: string;
  last_error?: string | null;
}

// MUST match exactly what's pasted in the Dhan portal when generating the API key.
// This is the backend Edge Function URL (custom domain) that Dhan 302-redirects
// to with ?tokenId=… — it then renders the success tick + auto-redirects to
// https://indexpilotai.com/dashboard.
const DEFAULT_REDIRECT =
  "https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7/broker/oauth/callback";

export function BrokerOAuthConnect({ serverUrl, accessToken, onConnected }: Props) {
  const [row, setRow] = useState<BrokerRow | null>(null);
  const [form, setForm] = useState({
    dhanClientId: "",
    apiKey: "",
    apiSecret: "",
    redirectUrl: DEFAULT_REDIRECT,
    postbackUrl: "",
  });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "consent" | "consume" | "disconnect" | "verify">("");
  const [liveCheck, setLiveCheck] = useState<{ ok: boolean; balance?: number; error?: string; errorCode?: string } | null>(null);

  const getToken = async () => (await getAccessToken()) || accessToken;

  const loadStatus = async () => {
    try {
      setLoading(true);
      const tok = await getToken();
      const res = await fetchWithAuth(`${serverUrl}/broker/oauth/status`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      const data = await res.json();
      const r: BrokerRow | null = data?.credentials || null;
      setRow(r);
      if (data?.liveCheck) setLiveCheck(data.liveCheck);
      if (r) {
        setForm((f) => ({
          ...f,
          dhanClientId: r.dhan_client_id || f.dhanClientId,
          apiKey: r.api_key || f.apiKey,
          redirectUrl: r.redirect_url || f.redirectUrl,
          postbackUrl: r.postback_url || f.postbackUrl,
        }));
      }
    } catch (e: any) {
      console.error("loadStatus error", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for postMessage from /broker/oauth/callback popup
  useEffect(() => {
    const handler = async (ev: MessageEvent) => {
      const data: any = ev.data;
      if (!data || data.type !== "DHAN_OAUTH_TOKEN" || !data.tokenId) return;
      await consumeTokenId(String(data.tokenId));
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrl, accessToken]);

  const saveKeys = async () => {
    if (!form.dhanClientId || !form.apiKey || !form.apiSecret || !form.redirectUrl) {
      toast.error("Fill Client ID, API Key, API Secret and Redirect URL");
      return;
    }
    setBusy("save");
    try {
      const tok = await getToken();
      const res = await fetchWithAuth(`${serverUrl}/broker/oauth/save-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to save");
      toast.success("API Key & Secret saved (valid 12 months)");
      setRow(data.credentials);
      setForm((f) => ({ ...f, apiSecret: "" }));
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setBusy("");
    }
  };

  const generateConsent = async () => {
    setBusy("consent");
    try {
      const tok = await getToken();
      const res = await fetchWithAuth(`${serverUrl}/broker/oauth/generate-consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Consent failed");
      const popup = window.open(data.loginUrl, "dhan-oauth", "width=520,height=720");
      if (!popup) {
        toast.warning("Popup blocked. Opening in new tab.");
        window.open(data.loginUrl, "_blank");
      } else {
        toast.info("Complete login in the Dhan window…");
      }
    } catch (e: any) {
      toast.error(e.message || "Consent failed");
    } finally {
      setBusy("");
    }
  };

  const consumeTokenId = async (tokenId: string) => {
    setBusy("consume");
    try {
      const tok = await getToken();
      const res = await fetchWithAuth(`${serverUrl}/broker/oauth/consume`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ tokenId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Consume failed");
      if (data.liveCheck) setLiveCheck(data.liveCheck);

      // Backend now runs a live Dhan funds check after saving the token.
      // If it fails the toast must reflect reality — otherwise we'd lie that
      // the broker is connected while orders/funds/market data won't work.
      if (data.liveCheck && data.liveCheck.ok === false) {
        toast.error(`Dhan rejected the token: [${data.liveCheck.errorCode || "?"}] ${data.liveCheck.error || "verification failed"}. Check the Dhan account you logged into matches your API Key.`);
        setRow(data.credentials);
        return;
      }

      const balanceMsg = data.liveCheck?.balance != null
        ? ` Balance ₹${Number(data.liveCheck.balance).toLocaleString("en-IN")}.`
        : "";
      toast.success(`Dhan connected ✅${balanceMsg} Redirecting to dashboard…`);
      setRow(data.credentials);
      onConnected?.();
      window.dispatchEvent(new CustomEvent("credentials-updated"));
      setTimeout(() => {
        try {
          if (window.location.pathname !== "/dashboard") {
            window.location.assign("/dashboard?dhan=connected");
          } else {
            window.dispatchEvent(new CustomEvent("dhan-connected"));
          }
        } catch {}
      }, 1200);
    } catch (e: any) {
      toast.error(e.message || "Consume failed");
    } finally {
      setBusy("");
    }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect Dhan OAuth? You'll need to reconnect to trade.")) return;
    setBusy("disconnect");
    try {
      const tok = await getToken();
      const res = await fetchWithAuth(`${serverUrl}/broker/oauth/disconnect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Disconnect failed");
      toast.success("Disconnected");
      setRow(null);
      setForm({ dhanClientId: "", apiKey: "", apiSecret: "", redirectUrl: DEFAULT_REDIRECT, postbackUrl: "" });
    } catch (e: any) {
      toast.error(e.message || "Disconnect failed");
    } finally {
      setBusy("");
    }
  };

  const verifyConnection = async () => {
    setBusy("verify");
    try {
      const tok = await getToken();
      const res = await fetchWithAuth(`${serverUrl}/broker/oauth/verify`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Verify failed");
      setLiveCheck(data.liveCheck);
      if (data.liveCheck?.ok) {
        const bal = data.liveCheck.balance != null ? ` · Balance ₹${Number(data.liveCheck.balance).toLocaleString("en-IN")}` : "";
        toast.success(`Dhan token is valid ✅${bal}`);
      } else {
        toast.error(`Dhan rejected token: [${data.liveCheck?.errorCode || "?"}] ${data.liveCheck?.error || "invalid"}`);
      }
      await loadStatus();
    } catch (e: any) {
      toast.error(e.message || "Verify failed");
    } finally {
      setBusy("");
    }
  };

  const tokenExpiry = row?.access_token_expiry ? new Date(row.access_token_expiry) : null;
  const tokenHoursLeft = tokenExpiry ? (tokenExpiry.getTime() - Date.now()) / 3_600_000 : null;
  const keyExpiry = row?.api_key_expiry ? new Date(row.api_key_expiry) : null;
  const keyDaysLeft = keyExpiry ? Math.floor((keyExpiry.getTime() - Date.now()) / 86_400_000) : null;
  const tokenLive = liveCheck?.ok === true;
  const tokenRejected = liveCheck?.ok === false || row?.last_status === "token_invalid";
  const isConnected = !!(row?.access_token && tokenHoursLeft && tokenHoursLeft > 0 && !tokenRejected);

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          Dhan OAuth (API Key &amp; Secret · 12 months)
          {tokenRejected ? (
            <Badge className="bg-red-500/20 text-red-300 border-red-500/40 ml-auto">
              <XCircle className="w-3 h-3 mr-1" /> Dhan rejected token
            </Badge>
          ) : isConnected ? (
            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 ml-auto">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Connected{tokenLive && liveCheck?.balance != null ? ` · ₹${Number(liveCheck.balance).toLocaleString("en-IN")}` : ""}
            </Badge>
          ) : (
            <Badge variant="outline" className="ml-auto text-zinc-400">
              <XCircle className="w-3 h-3 mr-1" /> Not connected
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="text-zinc-400">
          One-time setup. Generate API Key &amp; Secret on{" "}
          <a href="https://web.dhan.co" target="_blank" rel="noreferrer" className="text-blue-400 underline">
            web.dhan.co
          </a>{" "}
          → My Profile → Access DhanHQ APIs → API Key tab. Use the redirect URL shown below as your
          app's Redirect URL on Dhan.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Status panel */}
        {row && (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-zinc-800/50 rounded p-3 border border-zinc-700">
              <div className="text-zinc-500 mb-1">Access Token</div>
              <div className="text-zinc-200 font-medium">
                {row.access_token ? (
                  tokenHoursLeft !== null && tokenHoursLeft > 0 ? (
                    <span className="text-emerald-400">
                      ✓ Active · {Math.floor(tokenHoursLeft)}h {Math.floor((tokenHoursLeft % 1) * 60)}m left
                    </span>
                  ) : (
                    <span className="text-red-400">Expired — reconnect</span>
                  )
                ) : (
                  <span className="text-zinc-500">—</span>
                )}
              </div>
            </div>
            <div className="bg-zinc-800/50 rounded p-3 border border-zinc-700">
              <div className="text-zinc-500 mb-1">API Key (12 mo)</div>
              <div className="text-zinc-200 font-medium">
                {keyDaysLeft !== null ? (
                  keyDaysLeft > 0 ? (
                    <span className="text-emerald-400">{keyDaysLeft} days left</span>
                  ) : (
                    <span className="text-red-400">Expired</span>
                  )
                ) : (
                  <span className="text-zinc-500">—</span>
                )}
              </div>
            </div>
            {row.dhan_client_name && (
              <div className="col-span-2 bg-zinc-800/50 rounded p-3 border border-zinc-700">
                <div className="text-zinc-500 mb-1">Linked account</div>
                <div className="text-zinc-200">
                  {row.dhan_client_name} · UCC {row.dhan_client_ucc} · DDPI{" "}
                  {row.given_power_of_attorney ? "✓" : "✗"}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Form */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Dhan Client ID</Label>
            <Input
              placeholder="1000000001"
              value={form.dhanClientId}
              onChange={(e) => setForm({ ...form, dhanClientId: e.target.value })}
              className="bg-zinc-800 border-zinc-700 text-zinc-100"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300">API Key</Label>
            <Input
              placeholder="App ID from Dhan"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              className="bg-zinc-800 border-zinc-700 text-zinc-100"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300">
              API Secret {row?.api_secret_set && <span className="text-emerald-400 text-xs">(saved · paste again only to update)</span>}
            </Label>
            <Input
              type="password"
              placeholder={row?.api_secret_set ? "•••••• already saved" : "App Secret from Dhan"}
              value={form.apiSecret}
              onChange={(e) => setForm({ ...form, apiSecret: e.target.value })}
              className="bg-zinc-800 border-zinc-700 text-zinc-100"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Redirect URL (paste this on Dhan)</Label>
            <div className="flex gap-2">
              <Input
                value={form.redirectUrl}
                onChange={(e) => setForm({ ...form, redirectUrl: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 flex-1 font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(form.redirectUrl);
                  toast.success("Copied");
                }}
                className="shrink-0"
              >
                Copy
              </Button>
            </div>
            <p className="text-[11px] text-zinc-500">
              Use this exact URL as your "Redirect URL" when generating the API Key on Dhan.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Postback URL (optional)</Label>
            <Input
              placeholder="https://your-app.com/postback"
              value={form.postbackUrl}
              onChange={(e) => setForm({ ...form, postbackUrl: e.target.value })}
              className="bg-zinc-800 border-zinc-700 text-zinc-100"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            onClick={saveKeys}
            disabled={busy !== ""}
            variant="outline"
            className="flex-1 bg-zinc-800 border-zinc-700 hover:bg-zinc-700"
          >
            <Key className="w-4 h-4 mr-2" />
            {busy === "save" ? "Saving…" : row?.api_secret_set ? "Update Keys" : "Save Keys"}
          </Button>
          <Button
            onClick={generateConsent}
            disabled={busy !== "" || !row?.api_secret_set}
            className="flex-1 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            {busy === "consent" ? "Opening…" : isConnected ? "Reconnect" : "Connect with Dhan"}
          </Button>
          {row?.access_token && (
            <Button
              onClick={verifyConnection}
              disabled={busy !== ""}
              variant="outline"
              className="bg-blue-500/10 border-blue-500/30 text-blue-300 hover:bg-blue-500/20"
            >
              <ShieldCheck className="w-4 h-4 mr-2" />
              {busy === "verify" ? "Testing…" : "Test Connection"}
            </Button>
          )}
          {row && (
            <Button
              onClick={disconnect}
              disabled={busy !== ""}
              variant="outline"
              className="bg-red-500/10 border-red-500/30 text-red-300 hover:bg-red-500/20"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Disconnect
            </Button>
          )}
        </div>

        {row?.last_error && (
          <Alert className="bg-red-500/10 border-red-500/40">
            <AlertDescription className="text-red-300 text-xs">
              Last error: {row.last_error}
            </AlertDescription>
          </Alert>
        )}

        <Alert className="bg-blue-500/10 border-blue-500/40">
          <AlertDescription className="text-blue-200 text-xs leading-relaxed">
            <strong>Flow:</strong> 1) Save Keys → 2) Click "Connect with Dhan" → 3) Login on Dhan
            popup → 4) We exchange the returned tokenId for a 24-hour access token automatically.
            API Key &amp; Secret stay valid for 12 months — only re-run step 2 when the access
            token expires.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

export default BrokerOAuthConnect;
