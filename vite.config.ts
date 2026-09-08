import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const buildTimestamp = Date.now();
  const buildTime = new Date(buildTimestamp).toISOString();
  const buildVersion = String(buildTimestamp);
  const versionPayload = JSON.stringify(
    {
      version: buildVersion,
      buildTime,
      timestamp: buildTimestamp,
    },
    null,
    2,
  );

  return {
    base: './',
    build: {
      target: 'es2020',
      cssCodeSplit: true,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return;
            if (
              id.includes('clsx') ||
              id.includes('tailwind-merge') ||
              id.includes('class-variance-authority')
            ) return 'utils';
            if (id.includes('react-router')) return 'router';

            if (id.includes('/react/') || id.includes('react-dom') || id.includes('scheduler')) return 'react';
            
            if (id.includes('@supabase')) return 'supabase';
            if (id.includes('firebase')) return 'firebase';
            if (id.includes('xlsx')) return 'xlsx';
            if (id.includes('lucide-react')) return 'icons';
            if (id.includes('@radix-ui')) return 'radix';
            if (id.includes('@mui') || id.includes('@emotion')) return 'mui';
            if (id.includes('framer-motion') || id.includes('/motion/')) return 'motion';
            // everything else: let Rollup split per-route so lazy pages
            // don't drag their dependencies into the landing bundle.
            return undefined;

          },
        },
      },
    },
    server: {
      host: "0.0.0.0",
      port: 3000,
      allowedHosts: true,
      hmr: {
        overlay: false,
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(buildVersion),
      __APP_BUILD_TIME__: JSON.stringify(buildTime),
      __APP_BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      {
        name: "indexpilot-api-cors-proxy",
        configureServer(server: any) {
          server.middlewares.use(async (req: any, res: any, next: any) => {
            const rawUrl = req.url || "";
            const pathname = rawUrl.split("?")[0];
            const isFunctions = pathname.startsWith("/functions/v1");
            const isApi = pathname.startsWith("/api");
            const isSupabaseProxy = pathname.startsWith("/supabase-proxy");

            if (!isFunctions && !isApi && !isSupabaseProxy) {
              return next();
            }

            // Determine client origin to guarantee valid CORS with credentials
            let clientOrigin = req.headers.origin || "";
            if (!clientOrigin && req.headers.referer) {
              try {
                clientOrigin = new URL(req.headers.referer).origin;
              } catch {
                clientOrigin = "";
              }
            }
            if (!clientOrigin && req.headers.host) {
              clientOrigin = `https://${req.headers.host}`;
            }

            const applyCorsHeaders = () => {
              if (clientOrigin) {
                res.setHeader("Access-Control-Allow-Origin", clientOrigin);
                res.setHeader("Access-Control-Allow-Credentials", "true");
              } else {
                res.setHeader("Access-Control-Allow-Origin", "*");
                // DO NOT set Access-Control-Allow-Credentials: true with wildcard origin '*'
              }
              res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, DELETE, PATCH, OPTIONS");
              res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, apikey, x-client-info, x-supabase-auth, Accept, Origin");
            };

            applyCorsHeaders();

            if (req.method === "OPTIONS") {
              res.statusCode = 204;
              res.setHeader("Content-Length", "0");
              res.end();
              return;
            }

            let targetHost = "oklgqelcaujxntgjyuis.supabase.co";
            let targetPath = rawUrl;

            if (isSupabaseProxy) {
              targetPath = rawUrl.replace(/^\/supabase-proxy/, "");
            }

            // Ensure correct edge function path prefix
            if (!targetPath.startsWith("/functions/v1/make-server-c4d79cb7")) {
              if (targetPath.startsWith("/functions/v1/")) {
                targetPath = targetPath.replace("/functions/v1", "/functions/v1/make-server-c4d79cb7");
              } else {
                targetPath = `/functions/v1/make-server-c4d79cb7${targetPath.startsWith("/") ? targetPath : "/" + targetPath}`;
              }
            }

            // Read request body if present
            let bodyBuffer: Buffer | undefined;
            if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method || "")) {
              const chunks: Buffer[] = [];
              for await (const chunk of req) {
                chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
              }
              if (chunks.length > 0) {
                bodyBuffer = Buffer.concat(chunks);
              }
            }

            const sendUpstream = async (host: string, path: string) => {
              const url = `https://${host}${path}`;
              const forwardHeaders: Record<string, string> = {};
              for (const [key, val] of Object.entries(req.headers)) {
                const lower = key.toLowerCase();
                if (!["host", "connection", "content-length", "accept-encoding"].includes(lower) && typeof val === "string") {
                  forwardHeaders[key] = val;
                }
              }
              forwardHeaders["host"] = host;
              forwardHeaders["origin"] = `https://${host}`;
              if (!forwardHeaders["apikey"]) {
                forwardHeaders["apikey"] = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rbGdxZWxjYXVqeG50Z2p5dWlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MTA0NjUsImV4cCI6MjA3NTA4NjQ2NX0.FnFcNQXGXGpsQXvR4TW1LDc23FlIBBglLhZsRdn9VV0";
              }
              if (!forwardHeaders["authorization"]) {
                forwardHeaders["authorization"] = `Bearer ${forwardHeaders["apikey"]}`;
              }
              if (bodyBuffer) {
                forwardHeaders["content-length"] = String(bodyBuffer.length);
              }

              return await fetch(url, {
                method: req.method,
                headers: forwardHeaders,
                body: bodyBuffer,
                signal: AbortSignal.timeout(15000),
              });
            };

            try {
              const response = await sendUpstream(targetHost, targetPath);

              res.statusCode = response.status;
              response.headers.forEach((val, key) => {
                const k = key.toLowerCase();
                if (
                  !k.startsWith("access-control-") &&
                  k !== "content-encoding" &&
                  k !== "transfer-encoding"
                ) {
                  res.setHeader(key, val);
                }
              });

              const contentType = response.headers.get("content-type") || "";
              if (contentType.includes("application/json")) {
                const json = await response.text();
                res.end(json);
              } else {
                const text = await response.text();
                try {
                  JSON.parse(text);
                  res.end(text);
                } catch {
                  res.setHeader("content-type", "application/json");
                  res.end(JSON.stringify({ success: response.ok, message: text.slice(0, 300), status: response.status }));
                }
              }
            } catch (proxyError: any) {
              console.error("[Proxy Fatal Error]", proxyError);
              res.statusCode = 502;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  error: "Bad Gateway",
                  message: proxyError.message,
                  path: targetPath,
                })
              );
            }
          });
        },
      },
      {
        name: "indexpilot-version-json",
        configureServer(server: any) {
          server.middlewares.use((req: any, res: any, next: any) => {
            if (req.url?.split("?")[0] !== "/version.json") {
              next();
              return;
            }

            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
            res.setHeader("Pragma", "no-cache");
            res.setHeader("Expires", "0");
            res.end(versionPayload);
          });
        },
        generateBundle() {
          (this as any).emitFile({
            type: "asset",
            fileName: "version.json",
            source: versionPayload,
          });
        },
      },
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
  };
});
