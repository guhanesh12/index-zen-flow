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
    base: '/',
    server: {
      host: "::",
      port: 8080,
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
    build: {
      target: 'es2020',
      cssCodeSplit: true,
      sourcemap: false,
      minify: 'esbuild',
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('react-dom') || id.includes('react/') || id.includes('react-router') || id.includes('scheduler')) return 'react-vendor';
            if (id.includes('framer-motion') || id.includes('motion')) return 'motion';
            if (id.includes('@radix-ui') || id.includes('cmdk') || id.includes('vaul') || id.includes('sonner')) return 'radix';
            if (id.includes('@mui') || id.includes('@emotion') || id.includes('@popperjs')) return 'mui';
            if (id.includes('firebase')) return 'firebase';
            if (id.includes('recharts') || id.includes('d3-')) return 'charts';
            if (id.includes('xlsx')) return 'xlsx';
            if (id.includes('react-slick') || id.includes('slick-carousel') || id.includes('embla-carousel')) return 'carousel';
            if (id.includes('@supabase')) return 'supabase';
            if (id.includes('lucide-react')) return 'icons';
            if (id.includes('@tanstack')) return 'query';
            return 'vendor';
          },
        },
      },
    },
  };
});
