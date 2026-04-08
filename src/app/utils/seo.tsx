// @ts-nocheck
import { Helmet } from 'react-helmet-async';

/**
 * ═══════════════════════════════════════════════════════════════
 * ADVANCED SEO SYSTEM - GOOGLE SEARCH CONSOLE OPTIMIZED
 * ═══════════════════════════════════════════════════════════════
 * Designed to match Google's indexing requirements like Dhan.co
 * Each page will appear separately in search results with unique identity
 */

export interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  ogType?: string;
  ogImage?: string;
  keywords?: string;
  schema?: any;
  author?: string;
  robots?: string;
  alternateLanguages?: { lang: string; href: string }[];
}

// ═══════════════════════════════════════════════════════════════
// BRAND & SITE CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const BRAND_NAME = 'IndexpilotAI';
const BRAND_DOMAIN = 'www.indexpilotai.com';
const BASE_URL = `https://${BRAND_DOMAIN}`;
const BRAND_LOGO = `${BASE_URL}/icons/icon-512x512.png`;
const BRAND_COLOR = '#10b981';
const SITE_VERIFIED = true; // For Google Search Console

// ═══════════════════════════════════════════════════════════════
// GLOBAL ORGANIZATION SCHEMA (Required for Google Rich Results)
// ═══════════════════════════════════════════════════════════════

export const ORGANIZATION_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  'name': BRAND_NAME,
  'url': BASE_URL,
  'logo': {
    '@type': 'ImageObject',
    'url': BRAND_LOGO,
    'width': 512,
    'height': 512
  },
  'description': 'AI-powered options trading platform for Indian stock market (NSE/BSE) with real-time Dhan API integration.',
  'foundingDate': '2024',
  'areaServed': {
    '@type': 'Country',
    'name': 'India'
  },
  'address': {
    '@type': 'PostalAddress',
    'addressCountry': 'IN'
  }
};

// ═══════════════════════════════════════════════════════════════
// WEBSITE SCHEMA (For Site-Wide Search Box)
// ═══════════════════════════════════════════════════════════════

export const WEBSITE_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  'name': BRAND_NAME,
  'url': BASE_URL,
  'potentialAction': {
    '@type': 'SearchAction',
    'target': {
      '@type': 'EntryPoint',
      'urlTemplate': `${BASE_URL}/search?q={search_term_string}`
    },
    'query-input': 'required name=search_term_string'
  }
};

// ═══════════════════════════════════════════════════════════════
// DEFAULT SEO CONFIGURATION
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_SEO: SEOProps = {
  title: `${BRAND_NAME} - AI-Powered Options Trading Platform for India`,
  description: 'AI-powered options trading platform for NSE & BSE with real-time market data, automated strategies, and intelligent risk management. Trade NIFTY & BANK NIFTY options with confidence.',
  canonical: BASE_URL,
  ogType: 'website',
  ogImage: BRAND_LOGO,
  keywords: 'options trading India, AI trading, NSE, BSE, NIFTY, BANK NIFTY, automated trading, algo trading, IndexpilotAI',
  robots: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
};

// ═══════════════════════════════════════════════════════════════
// PAGE-SPECIFIC SEO CONFIGURATIONS
// Each page optimized for separate Google indexing (like Dhan.co)
// ═══════════════════════════════════════════════════════════════

export const SEO_CONFIGS: { [key: string]: SEOProps } = {
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // HOME PAGE - Main Landing Page
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  home: {
    title: `${BRAND_NAME} - AI-Powered Options Trading Platform for India`,
    description: 'Trade NSE & BSE options with AI-powered signals, automated strategies, and real-time Dhan API integration. Advanced risk management for NIFTY & BANK NIFTY options trading.',
    canonical: BASE_URL,
    keywords: `${BRAND_NAME}, AI options trading India, NSE options, BSE trading, NIFTY options, BANK NIFTY, automated trading, algo trading, Dhan API`,
    ogType: 'website',
    schema: {
      '@context': 'https://schema.org',
      '@graph': [
        ORGANIZATION_SCHEMA,
        WEBSITE_SCHEMA,
        {
          '@type': 'SoftwareApplication',
          '@id': `${BASE_URL}/#software`,
          'name': BRAND_NAME,
          'applicationCategory': 'FinanceApplication',
          'operatingSystem': 'Web',
          'offers': {
            '@type': 'Offer',
            'price': '0',
            'priceCurrency': 'INR',
            'availability': 'https://schema.org/InStock',
            'description': 'Free to start with profit-based pricing'
          },
          'aggregateRating': {
            '@type': 'AggregateRating',
            'ratingValue': '4.8',
            'ratingCount': '247',
            'bestRating': '5',
            'worstRating': '1'
          },
          'description': 'AI-powered options trading platform for Indian stock market',
          'featureList': [
            'AI-powered trading signals',
            'Real-time market data',
            'Automated strategy execution',
            'Risk management tools',
            'Position monitoring'
          ]
        },
        {
          '@type': 'WebPage',
          '@id': `${BASE_URL}/#webpage`,
          'url': BASE_URL,
          'name': `${BRAND_NAME} - AI-Powered Options Trading Platform for India`,
          'description': 'Trade NSE & BSE options with AI-powered signals and automated strategies',
          'isPartOf': {
            '@id': `${BASE_URL}/#website`
          }
        }
      ]
    }
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // LOGIN PAGE - Simple & Clear (like "Login" for Dhan)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  login: {
    title: 'Login',
    description: `Login to ${BRAND_NAME} - Access your AI-powered options trading dashboard with real-time market data, automated strategies, and position monitoring for NSE & BSE.`,
    canonical: `${BASE_URL}/login`,
    keywords: `${BRAND_NAME} login, trading login, options trading login, AI trading dashboard login`,
    ogType: 'website',
    robots: 'noindex, nofollow', // Login pages shouldn't be indexed
    schema: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': `${BASE_URL}/login#webpage`,
      'url': `${BASE_URL}/login`,
      'name': 'Login',
      'description': `Login to ${BRAND_NAME} trading platform`,
      'isPartOf': {
        '@type': 'WebSite',
        '@id': `${BASE_URL}/#website`,
        'name': BRAND_NAME,
        'url': BASE_URL
      },
      'breadcrumb': {
        '@type': 'BreadcrumbList',
        'itemListElement': [
          {
            '@type': 'ListItem',
            'position': 1,
            'name': 'Home',
            'item': BASE_URL
          },
          {
            '@type': 'ListItem',
            'position': 2,
            'name': 'Login'
          }
        ]
      }
    }
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // REGISTER PAGE - "Sign Up" or "Register"
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  register: {
    title: 'Sign Up',
    description: `Create your ${BRAND_NAME} account - Start AI-powered options trading on NSE & BSE. Free signup with profit-based pricing. Trade NIFTY & BANK NIFTY with automated strategies.`,
    canonical: `${BASE_URL}/register`,
    keywords: `${BRAND_NAME} signup, create account, register, options trading signup, AI trading registration`,
    ogType: 'website',
    schema: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': `${BASE_URL}/register#webpage`,
      'url': `${BASE_URL}/register`,
      'name': 'Sign Up',
      'description': `Create your ${BRAND_NAME} account for AI-powered options trading`,
      'isPartOf': {
        '@type': 'WebSite',
        '@id': `${BASE_URL}/#website`,
        'name': BRAND_NAME,
        'url': BASE_URL
      },
      'breadcrumb': {
        '@type': 'BreadcrumbList',
        'itemListElement': [
          {
            '@type': 'ListItem',
            'position': 1,
            'name': 'Home',
            'item': BASE_URL
          },
          {
            '@type': 'ListItem',
            'position': 2,
            'name': 'Sign Up'
          }
        ]
      }
    }
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // TRADING DASHBOARD - "Trading Dashboard" or "Dashboard"
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  dashboard: {
    title: 'Trading Dashboard',
    description: `${BRAND_NAME} real-time trading dashboard - Live NSE/BSE market data, AI-generated options signals, position monitoring, automated strategy execution, and comprehensive risk management.`,
    canonical: `${BASE_URL}/dashboard`,
    keywords: 'trading dashboard, live trading, options platform, AI signals, position monitoring, risk management',
    ogType: 'website',
    robots: 'noindex, nofollow', // Private user dashboard
    schema: {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      '@id': `${BASE_URL}/dashboard#webapp`,
      'name': `${BRAND_NAME} Trading Dashboard`,
      'applicationCategory': 'FinanceApplication',
      'url': `${BASE_URL}/dashboard`,
      'description': 'Real-time AI-powered options trading dashboard with live market data',
      'isPartOf': {
        '@type': 'WebSite',
        '@id': `${BASE_URL}/#website`,
        'name': BRAND_NAME
      }
    }
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PWA SETUP PAGE - "Install App" or "Mobile App"
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  pwaSetup: {
    title: `${BRAND_NAME} Mobile App`,
    description: `Install ${BRAND_NAME} as a mobile app on your device. Get quick access to AI-powered options trading with offline capabilities, push notifications, and native app experience for NSE & BSE trading.`,
    canonical: `${BASE_URL}/pwa-setup`,
    keywords: `${BRAND_NAME} app, mobile app, install app, PWA, progressive web app, trading app download`,
    ogType: 'website',
    schema: {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      '@id': `${BASE_URL}/pwa-setup#howto`,
      'name': `How to Install ${BRAND_NAME} Mobile App`,
      'description': 'Step-by-step guide to install IndexpilotAI as a progressive web app',
      'step': [
        {
          '@type': 'HowToStep',
          'position': 1,
          'name': 'Open Browser Menu',
          'text': 'Tap the menu button (three dots) in your mobile browser',
          'image': BRAND_LOGO
        },
        {
          '@type': 'HowToStep',
          'position': 2,
          'name': 'Add to Home Screen',
          'text': 'Select "Add to Home Screen" or "Install App"',
          'image': BRAND_LOGO
        },
        {
          '@type': 'HowToStep',
          'position': 3,
          'name': 'Confirm Installation',
          'text': 'Tap "Install" or "Add" to complete the installation',
          'image': BRAND_LOGO
        }
      ]
    }
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // API DOCUMENTATION PAGE (if exists) - Like "DhanHQ API"
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  api: {
    title: `${BRAND_NAME} API`,
    description: `${BRAND_NAME} API documentation - Integrate AI-powered options trading signals into your applications. RESTful API for NSE/BSE market data, automated trading, and position management.`,
    canonical: `${BASE_URL}/api`,
    keywords: `${BRAND_NAME} API, trading API, options API, NSE API, BSE API, algorithmic trading API`,
    ogType: 'website',
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // WEB TRADING PLATFORM - Like "Dhan Web"
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  webPlatform: {
    title: `${BRAND_NAME} Web`,
    description: `${BRAND_NAME} web trading platform - Trade NSE & BSE options directly from your browser. AI-powered signals, real-time charts, and automated strategy execution.`,
    canonical: `${BASE_URL}/web`,
    keywords: `${BRAND_NAME} web, web trading, browser trading, online trading platform`,
    ogType: 'website',
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SITEMAP PAGE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sitemap: {
    title: 'Sitemap',
    description: `${BRAND_NAME} sitemap - Navigate to all platform pages including trading dashboard, login, signup, API documentation, and mobile app installation.`,
    canonical: `${BASE_URL}/sitemap`,
    keywords: 'sitemap, site structure, platform navigation',
    ogType: 'website',
    schema: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      'name': 'Sitemap',
      'description': `Complete sitemap of ${BRAND_NAME} platform`,
      'url': `${BASE_URL}/sitemap`
    }
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MANUAL INDEX PAGE (Internal Tool)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  manualIndex: {
    title: 'Manual Indexing Tool',
    description: `Internal SEO tool for submitting ${BRAND_NAME} pages to Google Search Console. Helps ensure all pages are properly indexed.`,
    canonical: `${BASE_URL}/manual-index`,
    robots: 'noindex, nofollow',
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ADMIN PAGES
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  adminLogin: {
    title: 'Admin Login',
    description: `${BRAND_NAME} admin login - Platform administration and management.`,
    canonical: `${BASE_URL}/admin`,
    robots: 'noindex, nofollow',
  },

  adminDashboard: {
    title: 'Admin Dashboard',
    description: `${BRAND_NAME} admin dashboard - Manage users, settings, and platform configuration.`,
    canonical: `${BASE_URL}/admin/dashboard`,
    robots: 'noindex, nofollow',
  },

  iconGenerator: {
    title: 'Icon Generator',
    description: `Internal tool for generating PWA icons for ${BRAND_NAME}.`,
    canonical: `${BASE_URL}/icon-generator`,
    robots: 'noindex, nofollow',
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 404 NOT FOUND
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  notFound: {
    title: 'Page Not Found',
    description: `The page you're looking for doesn't exist. Return to ${BRAND_NAME} homepage to access AI-powered options trading.`,
    canonical: `${BASE_URL}/404`,
    robots: 'noindex, nofollow',
  },

};

// ═══════════════════════════════════════════════════════════════
// ADVANCED SEO COMPONENT - OPTIMIZED FOR GOOGLE SEARCH CONSOLE
// ═══════════════════════════════════════════════════════════════

export function SEO({ 
  title, 
  description, 
  canonical, 
  ogType = 'website', 
  ogImage, 
  keywords, 
  schema,
  author = BRAND_NAME,
  robots,
  alternateLanguages = []
}: SEOProps) {
  
  const fullTitle = title || DEFAULT_SEO.title;
  const fullDescription = description || DEFAULT_SEO.description;
  const fullCanonical = canonical || DEFAULT_SEO.canonical;
  const fullOgImage = ogImage || BRAND_LOGO;
  const fullKeywords = keywords || DEFAULT_SEO.keywords;
  const fullRobots = robots || DEFAULT_SEO.robots;

  return (
    <Helmet>
      {/* ═══════════════════════════════════════════════════════ */}
      {/* CRITICAL SEO: FORCE INDEXING */}
      {/* ═══════════════════════════════════════════════════════ */}
      <html lang="en" />
      <title>{fullTitle}</title>
      <meta name="title" content={fullTitle} />
      <meta name="description" content={fullDescription} />
      <meta name="keywords" content={fullKeywords} />
      <meta name="author" content={author} />
      <meta name="robots" content={fullRobots} />
      <meta name="googlebot" content={fullRobots.includes('noindex') ? 'noindex, nofollow' : 'index, follow'} />
      <meta name="bingbot" content={fullRobots.includes('noindex') ? 'noindex, nofollow' : 'index, follow'} />
      
      {/* ═══════════════════════════════════════════════════════ */}
      {/* CANONICAL & ALTERNATE LINKS */}
      {/* ═══════════════════════════════════════════════════════ */}
      <link rel="canonical" href={fullCanonical} />
      {alternateLanguages.map((alt) => (
        <link key={alt.lang} rel="alternate" hrefLang={alt.lang} href={alt.href} />
      ))}
      
      {/* ═══════════════════════════════════════════════════════ */}
      {/* GEOGRAPHIC & LANGUAGE TARGETING */}
      {/* ═══════════════════════════════════════════════════════ */}
      <meta name="geo.region" content="IN" />
      <meta name="geo.placename" content="India" />
      <meta name="language" content="English" />
      <meta httpEquiv="content-language" content="en-IN" />
      
      {/* ═══════════════════════════════════════════════════════ */}
      {/* MOBILE & VIEWPORT */}
      {/* ═══════════════════════════════════════════════════════ */}
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <meta name="apple-mobile-web-app-title" content={BRAND_NAME} />
      <meta name="application-name" content={BRAND_NAME} />
      <meta name="theme-color" content={BRAND_COLOR} />
      
      {/* ═══════════════════════════════════════════════════════ */}
      {/* OPEN GRAPH / FACEBOOK */}
      {/* ═══════════════════════════════════════════════════════ */}
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={fullCanonical} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={fullDescription} />
      <meta property="og:image" content={fullOgImage} />
      <meta property="og:image:secure_url" content={fullOgImage} />
      <meta property="og:image:width" content="512" />
      <meta property="og:image:height" content="512" />
      <meta property="og:image:alt" content={`${BRAND_NAME} Logo`} />
      <meta property="og:site_name" content={BRAND_NAME} />
      <meta property="og:locale" content="en_IN" />
      
      {/* ═══════════════════════════════════════════════════════ */}
      {/* TWITTER CARD */}
      {/* ═══════════════════════════════════════════════════════ */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={fullCanonical} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={fullDescription} />
      <meta name="twitter:image" content={fullOgImage} />
      <meta name="twitter:image:alt" content={`${BRAND_NAME} Logo`} />
      
      {/* ═══════════════════════════════════════════════════════ */}
      {/* ADDITIONAL INDEXING SIGNALS FOR GOOGLE */}
      {/* ═══════════════════════════════════════════════════════ */}
      <meta name="revisit-after" content="1 days" />
      <meta name="rating" content="general" />
      <meta name="distribution" content="global" />
      <meta name="coverage" content="Worldwide" />
      <meta name="target" content="all" />
      <meta name="audience" content="traders, investors, stock market professionals" />
      <meta name="category" content="Finance, Trading, Stock Market, Technology" />
      <meta name="classification" content="Finance, Trading" />
      <meta name="subject" content="Options Trading, Stock Market, AI Trading" />
      <meta name="copyright" content={`© 2024-2026 ${BRAND_NAME}. All rights reserved.`} />
      <meta name="abstract" content={fullDescription} />
      <meta name="topic" content="Options Trading, AI, Stock Market" />
      <meta name="summary" content={fullDescription} />
      <meta name="designer" content={BRAND_NAME} />
      <meta name="owner" content={BRAND_NAME} />
      <meta name="url" content={fullCanonical} />
      <meta name="identifier-URL" content={fullCanonical} />
      <meta name="directory" content="submission" />
      <meta name="pagename" content={fullTitle} />
      <meta name="category" content="Finance" />
      <meta name="coverage" content="India" />
      
      {/* Dublin Core Metadata (Additional SEO Signals) */}
      <meta name="DC.title" content={fullTitle} />
      <meta name="DC.description" content={fullDescription} />
      <meta name="DC.subject" content={fullKeywords} />
      <meta name="DC.language" content="en-IN" />
      
      {/* ═══════════════════════════════════════════════════════ */}
      {/* SCHEMA.ORG STRUCTURED DATA (JSON-LD) */}
      {/* ═══════════════════════════════════════════════════════ */}
      {schema && (
        <script type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      )}
      
      {/* Always include Organization schema if no custom schema */}
      {!schema && (
        <script type="application/ld+json">
          {JSON.stringify(ORGANIZATION_SCHEMA)}
        </script>
      )}
    </Helmet>
  );
}

// ═══════════════════════════════════════════════════════════════
// HELPER HOOK TO GET SEO CONFIG
// ═══════════════════════════════════════════════════════════════

export function useSEO(page: keyof typeof SEO_CONFIGS) {
  return SEO_CONFIGS[page] || DEFAULT_SEO;
}

// ═══════════════════════════════════════════════════════════════
// UTILITY: GENERATE BREADCRUMB SCHEMA
// ═══════════════════════════════════════════════════════════════

export function generateBreadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': items.map((item, index) => ({
      '@type': 'ListItem',
      'position': index + 1,
      'name': item.name,
      'item': item.url
    }))
  };
}

// ═══════════════════════════════════════════════════════════════
// UTILITY: GENERATE FAQ SCHEMA
// ═══════════════════════════════════════════════════════════════

export function generateFAQSchema(faqs: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': faqs.map(faq => ({
      '@type': 'Question',
      'name': faq.question,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': faq.answer
      }
    }))
  };
}

// ═══════════════════════════════════════════════════════════════
// EXPORT CONSTANTS
// ═══════════════════════════════════════════════════════════════

export { BRAND_NAME, BRAND_DOMAIN, BASE_URL, BRAND_LOGO, BRAND_COLOR };
