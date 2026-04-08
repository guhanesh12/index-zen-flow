// @ts-nocheck
import { Link } from "react-router";
import { Home, LogIn, UserPlus, FileText, Shield, Info, Sparkles, DollarSign, Mail } from "lucide-react";

export default function SitemapPage() {
  const publicPages = [
    {
      title: "Home",
      path: "/",
      description: "Welcome to IndexpilotAI - AI-Powered Options Trading Platform",
      icon: Home,
      priority: "high"
    },
    {
      title: "Login",
      path: "/login",
      description: "Sign in to your trading account",
      icon: LogIn,
      priority: "high"
    },
    {
      title: "Register",
      path: "/register",
      description: "Create a new trading account",
      icon: UserPlus,
      priority: "high"
    },
    {
      title: "About Us",
      path: "/page/about",
      description: "Learn about IndexpilotAI and our mission",
      icon: Info,
      priority: "medium"
    },
    {
      title: "Features",
      path: "/page/features",
      description: "Explore AI trading features and capabilities",
      icon: Sparkles,
      priority: "high"
    },
    {
      title: "Pricing",
      path: "/page/pricing",
      description: "View our tiered profit-based pricing plans",
      icon: DollarSign,
      priority: "high"
    },
    {
      title: "Contact",
      path: "/page/contact",
      description: "Get in touch with our support team",
      icon: Mail,
      priority: "medium"
    },
    {
      title: "Terms of Service",
      path: "/page/terms",
      description: "Read our terms and conditions",
      icon: FileText,
      priority: "low"
    },
    {
      title: "Privacy Policy",
      path: "/page/privacy",
      description: "Our commitment to your privacy",
      icon: Shield,
      priority: "low"
    }
  ];

  const priorityColors = {
    high: "from-emerald-600 to-blue-600",
    medium: "from-blue-600 to-purple-600",
    low: "from-zinc-700 to-zinc-600"
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-6">
          <Link to="/" className="inline-flex items-center gap-2 text-white hover:text-emerald-400 transition-colors">
            <Home className="w-5 h-5" />
            <span>Back to Home</span>
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-12">
        {/* Title Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Site Map
          </h1>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
            Navigate through all public pages of IndexpilotAI
          </p>
          
          {/* XML Sitemap Link */}
          <div className="mt-6 inline-block">
            <a 
              href="/sitemap.xml" 
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-zinc-300 transition-all duration-300"
            >
              <FileText className="w-4 h-4" />
              <span>View XML Sitemap</span>
            </a>
          </div>
        </div>

        {/* Pages Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {publicPages.map((page) => {
            const Icon = page.icon;
            return (
              <Link
                key={page.path}
                to={page.path}
                className="group relative bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-all duration-300 hover:shadow-2xl hover:shadow-emerald-500/10 hover:-translate-y-1"
              >
                {/* Priority Badge */}
                <div className="absolute top-4 right-4">
                  <span className={`text-xs px-2 py-1 rounded-full bg-gradient-to-r ${priorityColors[page.priority as keyof typeof priorityColors]} text-white font-medium`}>
                    {page.priority}
                  </span>
                </div>

                {/* Icon */}
                <div className="mb-4">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-600/20 to-blue-600/20 group-hover:from-emerald-600/30 group-hover:to-blue-600/30 transition-all duration-300">
                    <Icon className="w-6 h-6 text-emerald-400" />
                  </div>
                </div>

                {/* Title */}
                <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-emerald-400 transition-colors">
                  {page.title}
                </h3>

                {/* Description */}
                <p className="text-zinc-400 text-sm leading-relaxed">
                  {page.description}
                </p>

                {/* Path */}
                <div className="mt-4 pt-4 border-t border-zinc-800">
                  <code className="text-xs text-zinc-500 font-mono">{page.path}</code>
                </div>
              </Link>
            );
          })}
        </div>

        {/* SEO Info Section */}
        <div className="mt-16 max-w-4xl mx-auto">
          <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl p-8">
            <h2 className="text-2xl font-bold text-white mb-4">
              For Search Engines
            </h2>
            <div className="space-y-4 text-zinc-400">
              <p>
                <strong className="text-white">XML Sitemap URL:</strong><br />
                <code className="text-emerald-400">https://www.indexpilotai.com/sitemap.xml</code>
              </p>
              <p>
                <strong className="text-white">Robots.txt URL:</strong><br />
                <code className="text-emerald-400">https://www.indexpilotai.com/robots.txt</code>
              </p>
              <p className="text-sm">
                Our sitemap is automatically updated and submitted to Google Search Console, Bing Webmaster Tools, and other search engines.
              </p>
            </div>
          </div>
        </div>

        {/* Last Updated */}
        <div className="text-center mt-12">
          <p className="text-zinc-500 text-sm">
            Last Updated: March 5, 2026
          </p>
        </div>
      </div>
    </div>
  );
}
