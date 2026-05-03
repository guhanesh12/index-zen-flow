import { useState } from "react";

export default function DeleteAccount() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", reason: "" });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const subject = encodeURIComponent("Account Deletion Request - IndexPilot AI");
      const body = encodeURIComponent(
        `Name: ${form.name}\nEmail: ${form.email}\nPhone: ${form.phone}\nReason: ${form.reason}\n\nI request permanent deletion of my IndexPilot AI account and all associated data.`
      );
      window.location.href = `mailto:support@indexpilotai.com?subject=${subject}&body=${body}`;
      setSubmitted(true);
    } catch (err: any) {
      setError(err?.message || "Failed to submit request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground py-12 px-4">
      <article className="max-w-2xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Delete Your Account</h1>
          <p className="text-muted-foreground">
            Request permanent deletion of your IndexPilot AI account and personal data.
          </p>
        </header>

        <section className="bg-card border border-border rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-3">What gets deleted</h2>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>Your account profile and login credentials</li>
            <li>Personal information (name, email, phone)</li>
            <li>Broker connections and API keys</li>
            <li>Trading preferences, strategies, and watchlists</li>
            <li>Notification subscriptions and device tokens</li>
          </ul>

          <h2 className="text-xl font-semibold mt-6 mb-3">What is retained</h2>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>Transaction & trade records required by SEBI / tax law (retained up to 7 years)</li>
            <li>Anonymised analytics that cannot identify you</li>
          </ul>

          <p className="text-sm text-muted-foreground mt-4">
            Requests are processed within <strong>30 days</strong>. You will receive a confirmation email once deletion is complete.
          </p>
        </section>

        {submitted ? (
          <div className="bg-card border border-border rounded-lg p-6 text-center">
            <h2 className="text-xl font-semibold mb-2">Request Submitted</h2>
            <p className="text-muted-foreground text-sm">
              We have opened your email client. If it didn't open, email us directly at{" "}
              <a href="mailto:support@indexpilotai.com" className="text-primary underline">
                support@indexpilotai.com
              </a>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-6 space-y-4">
            <h2 className="text-xl font-semibold">Submit Deletion Request</h2>

            <div>
              <label className="block text-sm font-medium mb-1">Full Name *</label>
              <input
                required
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Account Email *</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Phone (optional)</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Reason (optional)</label>
              <textarea
                rows={3}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-md"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 bg-destructive text-destructive-foreground rounded-md font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Submitting..." : "Request Account Deletion"}
            </button>

            <p className="text-xs text-muted-foreground text-center">
              Or email us directly at{" "}
              <a href="mailto:support@indexpilotai.com" className="text-primary underline">
                support@indexpilotai.com
              </a>
            </p>
          </form>
        )}
      </article>
    </main>
  );
}
