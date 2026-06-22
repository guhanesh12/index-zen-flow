// Fallback landing content used by the static /index route.
// The main application landing is rendered by ModernLandingPage via the app router.

const Index = () => {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
          IndexpilotAI — AI-Powered NIFTY Options Algo Trading for India
        </h1>
        <p className="mt-6 text-lg text-muted-foreground">
          IndexpilotAI is India's AI-powered NIFTY, BANKNIFTY and SENSEX options
          algo trading platform. Get real-time AI signals, automatic order
          execution through Dhan, dedicated VPS hosting and smart risk
          management — all from one app.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <article>
            <h2 className="text-2xl font-semibold">Real-time AI signals</h2>
            <p className="mt-2 text-muted-foreground">
              Our engine scans NSE option chains continuously and surfaces
              high-confidence NIFTY and BANKNIFTY entries with strike, lot size
              and stop-loss already calculated for you.
            </p>
          </article>
          <article>
            <h2 className="text-2xl font-semibold">Dhan broker auto-execute</h2>
            <p className="mt-2 text-muted-foreground">
              Connect your Dhan account once and IndexpilotAI places, modifies
              and exits orders for you within milliseconds of each signal — no
              manual taps required.
            </p>
          </article>
          <article>
            <h2 className="text-2xl font-semibold">Dedicated low-latency VPS</h2>
            <p className="mt-2 text-muted-foreground">
              Every active trader gets a dedicated VPS slot so orders ship to
              NSE without depending on your phone, Wi-Fi or browser tab being
              open during market hours.
            </p>
          </article>
          <article>
            <h2 className="text-2xl font-semibold">Smart risk management</h2>
            <p className="mt-2 text-muted-foreground">
              Per-trade SL, daily loss limits, and automatic square-off keep
              your capital protected. Track live P&amp;L, wallet balance and
              order history from the dashboard.
            </p>
          </article>
        </div>

        <p className="mt-12 text-base text-muted-foreground">
          Free Android app available on Google Play. Web and mobile use the same
          account, the same wallet, and the same real-time signals.
        </p>
      </section>
    </main>
  );
};

export default Index;
