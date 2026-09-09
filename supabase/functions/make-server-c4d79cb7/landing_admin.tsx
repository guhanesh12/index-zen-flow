// Landing Page Admin Routes
import { Context } from "npm:hono";
import * as kv from "./kv_store.tsx";

// Default landing page content
export const DEFAULT_LANDING_CONTENT = {
  hero: {
    badge: "AI-Powered Trading Platform",
    title: {
      part1: "Trade",
      part2: "NIFTY Options",
      part3: "with AI"
    },
    description: "Automated trading powered by advanced AI algorithms. Real-time data from Dhan with lightning-fast execution and intelligent position monitoring.",
    buttons: {
      primary: "Start Free Trial",
      secondary: "Watch Demo"
    },
    trustBadge: "5,000+ Active Traders",
    dhanAccountLink: "https://login.dhan.co/"
  },
  
  stats: [
    { value: '68%', label: 'Win Rate', icon: 'TrendingUp', color: 'green' },
    { value: '₹450', label: 'Avg Profit', icon: 'DollarSign', color: 'cyan' },
    { value: '500+', label: 'Active Users', icon: 'Users', color: 'purple' },
    { value: '1000+', label: 'Trades/Day', icon: 'Activity', color: 'yellow' }
  ],
  
  dhan: {
    badge: "Powered by Dhan",
    title: "Lightning-Fast Trading with Dhan API",
    description: "The only broker integration you need. Dhan delivers ultra-fast execution, real-time market data, and advanced position monitoring for professional traders.",
    features: [
      {
        title: "Real-time Market Data",
        description: "Live NIFTY & BANKNIFTY options chain with instant updates",
        icon: "Activity"
      },
      {
        title: "Lightning Execution",
        description: "Place orders in milliseconds with Dhan's powerful API",
        icon: "Zap"
      },
      {
        title: "Position Monitoring",
        description: "Track all your positions in real-time with P&L updates",
        icon: "BarChart3"
      }
    ]
  },
  
  features: [
    {
      title: "AI-Powered Signals",
      description: "Advanced machine learning algorithms analyze market patterns and generate high-probability trade signals in real-time.",
      icon: "Zap"
    },
    {
      title: "Risk Management",
      description: "Built-in stop-loss, position sizing, and risk controls to protect your capital.",
      icon: "Shield"
    },
    {
      title: "Real-time Analytics",
      description: "Live P&L tracking, win rate analysis, and comprehensive performance metrics.",
      icon: "BarChart3"
    }
  ],
  
  pricing: {
    title: "Pay Only When You Profit",
    description: "No fixed monthly fees. Pay a small daily fee only on profitable days.",
    tiers: [
      {
        range: '₹0 – ₹100',
        price: '₹0',
        description: 'Completely free',
        features: ['No charges', 'All AI signals', 'Basic support', 'Trade history']
      },
      {
        range: '₹101 – ₹500',
        price: '₹29',
        description: 'Getting started',
        features: ['Fixed daily fee', 'Advanced AI signals', 'Email support', 'Risk management']
      },
      {
        range: '₹501 – ₹1,000',
        price: '₹49',
        description: 'Most popular',
        features: ['Best value tier', 'Premium signals', 'Priority support', 'Custom strategies', 'Real-time alerts'],
        popular: true
      },
      {
        range: '₹1,001 – ₹2,000',
        price: '₹69',
        description: 'High performers',
        features: ['Dedicated support', 'Advanced analytics', 'Performance reports', 'API access']
      },
      {
        range: '₹2,001+',
        price: '₹89',
        description: 'Professional traders',
        features: ['VIP support', 'Custom strategies', 'Priority execution', 'Personal account manager']
      }
    ],
    explanation: "Your daily fee is calculated based on your net profit at the end of each trading day. If you make ₹750 profit in a day, you pay only ₹49. If you make no profit or a loss, you pay ₹0!",
    autoDebit: "No upfront payment required. Fees are automatically debited from your wallet only when you make profit. Your wallet is charged at the end of each profitable trading day based on your profit tier."
  },
  
  testimonials: [
    {
      name: 'Rajesh Kumar',
      role: 'Day Trader',
      rating: 5,
      text: 'Increased my win rate from 45% to 68% in just 2 months. The AI signals are incredibly accurate!',
      avatar: 'R'
    },
    {
      name: 'Priya Sharma',
      role: 'Options Trader',
      rating: 5,
      text: 'Best platform for NIFTY options. The Dhan integration is seamless and execution is lightning fast.',
      avatar: 'P'
    },
    {
      name: 'Amit Patel',
      role: 'Professional Trader',
      rating: 5,
      text: 'Made ₹2.5L in profit last month. The risk management features saved me from several big losses.',
      avatar: 'A'
    }
  ],
  
  trailingStopLoss: {
    badge: "ADVANCED FEATURE",
    title: {
      part1: "Unlimited",
      part2: "Profit Locking",
      part3: "with Trailing Stop-Loss"
    },
    subtitle: "The most powerful risk management tool. Lock in profits automatically as your position grows—with NO LIMIT on how much you can secure!",
    howItWorks: {
      title: "How It Works",
      steps: [
        {
          number: "1",
          title: "Set Activation Profit",
          description: "Choose when trailing starts (e.g., after ₹1,000 profit)",
          color: "blue"
        },
        {
          number: "2",
          title: "Configure Jump Amounts",
          description: "Set how much targets and stop-losses move (e.g., ₹500 jumps)",
          color: "cyan"
        },
        {
          number: "3",
          title: "Profits Lock Automatically! 🔒",
          description: "Stop-loss moves into positive territory—securing guaranteed profits even if market crashes!",
          color: "green"
        }
      ]
    },
    liveExample: {
      title: "Live Example",
      steps: [
        { profit: '₹1,000', target: '₹3,500', sl: '₹1,500', description: 'Trailing activated' },
        { profit: '₹2,500', target: '₹5,000', sl: '₹500', description: 'Getting close...' },
        { profit: '₹3,000', target: '₹5,500', sl: '₹0', description: 'Break-even!' },
        { profit: '₹5,000', target: '₹7,000', sl: '-₹2,000', description: '+₹2,000 LOCKED 🔒', locked: true },
        { profit: '₹5,500', target: '₹7,500', sl: '-₹2,500', description: '+₹2,500 LOCKED 🔒', locked: true },
        { profit: '₹6,000', target: '₹8,000', sl: '-₹3,000', description: '+₹3,000 LOCKED 🔒', locked: true }
      ],
      footer: "⚡ Continues FOREVER! No limit on profit locking! 🚀"
    },
    benefits: [
      {
        title: "Guaranteed Profits",
        description: "Once stop-loss moves into positive territory, you CANNOT lose—even if the market crashes. Your profit is mathematically guaranteed.",
        icon: "Shield"
      },
      {
        title: "Unlimited Trailing",
        description: "No cap on profit locking! Whether you make ₹5,000 or ₹50,000, the system keeps trailing and locking in higher profits automatically.",
        icon: "TrendingUp"
      },
      {
        title: "Fully Automated",
        description: "Set it once and forget it. The AI monitors every second and adjusts targets/stop-losses automatically. No manual intervention needed!",
        icon: "Zap"
      }
    ],
    cta: {
      title: "Start Trading with Trailing Stop-Loss Today!",
      description: "Join 500+ traders who are already protecting and maximizing their profits with our advanced trailing stop-loss system",
      button: "Get Started Free",
      features: ["No credit card required", "Setup in 2 minutes", "Works with Dhan"]
    }
  },
  
  cta: {
    title: "Ready to Transform Your Trading?",
    description: "Join thousands of traders who are already using AI to make smarter trades.",
    button: "Start Trading Now"
  },
  
  footer: {
    brand: "IndexpilotAI",
    tagline: "AI-Powered Trading",
    description: "India's most advanced AI-powered options trading platform.",
    sections: [
      {
        title: "Product",
        links: [
          { label: "Features", href: "#features" },
          { label: "Pricing", href: "#pricing" },
          { label: "How It Works", href: "#how-it-works" }
        ]
      },
      {
        title: "Company",
        links: [
          { label: "About", href: "#about" },
          { label: "Contact", href: "#contact" }
        ]
      },
      {
        title: "Legal",
        links: [
          { label: "Terms & Conditions", href: "/terms" },
          { label: "Privacy Policy", href: "/privacy" }
        ]
      }
    ],
    social: {
      twitter: "https://twitter.com/indexpilotai",
      linkedin: "https://linkedin.com/company/indexpilotai"
    },
    copyright: "© 2026 IndexpilotAI. All rights reserved.",
    disclaimer: "Trading in options involves risk. Past performance does not guarantee future results."
  }
};

// Get landing page content
export async function getLandingContent() {
  try {
    const content = await kv.get('landing_page_content');
    if (!content) {
      // Initialize with default content
      await kv.set('landing_page_content', DEFAULT_LANDING_CONTENT);
      return DEFAULT_LANDING_CONTENT;
    }
    return content;
  } catch (error) {
    console.error('Error fetching landing content:', error);
    return DEFAULT_LANDING_CONTENT;
  }
}

// Update landing page content
export async function updateLandingContent(section: string, data: any) {
  try {
    const currentContent = await getLandingContent();
    const updatedContent = {
      ...currentContent,
      [section]: data
    };
    await kv.set('landing_page_content', updatedContent);
    return updatedContent;
  } catch (error) {
    console.error('Error updating landing content:', error);
    throw error;
  }
}

// Get Terms & Conditions content
export async function getTermsContent() {
  try {
    const content = await kv.get('page_terms');
    if (!content) {
      const defaultTerms = {
        title: "Terms & Conditions",
        lastUpdated: "March 5, 2026",
        sections: [] // Will be populated from existing TermsPage component
      };
      await kv.set('page_terms', defaultTerms);
      return defaultTerms;
    }
    return content;
  } catch (error) {
    console.error('Error fetching terms content:', error);
    return null;
  }
}

// Update Terms & Conditions
export async function updateTermsContent(data: any) {
  try {
    await kv.set('page_terms', data);
    return data;
  } catch (error) {
    console.error('Error updating terms content:', error);
    throw error;
  }
}

// Get all dynamic pages
export async function getAllPages() {
  try {
    const pages = await kv.get('landing_pages') || [];
    if (pages.length === 0) {
      // Initialize with default pages with proper content
      const defaultPages = [
        {
          id: 'terms',
          title: 'Terms & Conditions',
          slug: 'terms',
          content: `# Terms & Conditions

**Last Updated: March 6, 2026**

## 1. Acceptance of Terms

By accessing and using IndexpilotAI (the "Platform"), operated by SMILYKART SERVICE PRIVATE LIMITED, you agree to be bound by these Terms & Conditions. If you do not agree to these terms, please do not use our Platform.

## 2. Description of Service

IndexpilotAI is an AI-powered options trading platform that provides:
- Automated trading signals for NIFTY, BANKNIFTY, and SENSEX options
- Real-time market data integration via Dhan broker API
- AI-driven trading strategies and position monitoring
- Risk management and profit tracking tools

## 3. User Responsibilities

### 3.1 Account Security
- You are responsible for maintaining the confidentiality of your account credentials
- You must notify us immediately of any unauthorized access to your account
- You are responsible for all activities that occur under your account

### 3.2 Trading Risks
- Options trading involves substantial risk and is not suitable for all investors
- You may lose some or all of your invested capital
- Past performance does not guarantee future results
- You are solely responsible for your trading decisions

## 4. Platform Usage

### 4.1 Permitted Use
- The Platform is for personal, non-commercial use only
- You agree to use the Platform in compliance with all applicable laws and regulations
- You will not attempt to reverse engineer, decompile, or hack the Platform

### 4.2 Prohibited Activities
- Manipulating or interfering with the Platform's functionality
- Using the Platform for fraudulent or illegal purposes
- Sharing your account credentials with unauthorized parties
- Creating multiple accounts to abuse free trials or promotions

## 5. SEBI Registration Disclaimer

**IMPORTANT: IndexpilotAI and SMILYKART SERVICE PRIVATE LIMITED are NOT registered with the Securities and Exchange Board of India (SEBI).**

- We do not provide SEBI-registered investment advisory services
- We are an educational and technology platform only
- No SEBI registration is required for algorithmic trading software platforms
- All trading signals are generated by AI algorithms for informational purposes only

## 6. Profit Disclaimer

### 6.1 No Guaranteed Returns
- We do NOT guarantee any fixed profits or returns
- All profit statistics shown are historical and for informational purposes only
- Individual results may vary significantly based on market conditions
- Automated trading does not eliminate risk

### 6.2 Performance Claims
- Any performance statistics displayed on our Platform are based on backtesting or historical data
- Past performance is not indicative of future results
- Actual trading results may differ from backtested or simulated performance

## 7. Broker Integration

- IndexpilotAI integrates with Dhan broker for trade execution
- You must have an active Dhan trading account to use our Platform
- We are not responsible for broker-side issues, delays, or errors
- Broker charges and fees are separate from our platform fees

## 8. Pricing and Payments

### 8.1 Tiered Pricing Model
Our Platform operates on a profit-based pricing model:
- **Free Tier**: ₹0 - ₹5,000 daily profit (No charge)
- **Standard Tier**: ₹5,001 - ₹15,000 daily profit (5% of profit)
- **Premium Tier**: ₹15,001+ daily profit (10% of profit)

### 8.2 Payment Terms
- Fees are calculated based on actual daily profits
- Payments are processed automatically from your wallet
- All fees are non-refundable unless required by law

## 9. Intellectual Property

- All content, software, and materials on the Platform are owned by SMILYKART SERVICE PRIVATE LIMITED
- You may not copy, reproduce, or distribute any Platform content without written permission
- Our AI algorithms and trading strategies are proprietary and confidential

## 10. Data Privacy

- Your use of the Platform is subject to our Privacy Policy
- We collect and process data to provide and improve our services
- We implement security measures to protect your data

## 11. Limitation of Liability

### 11.1 No Liability for Losses
- SMILYKART SERVICE PRIVATE LIMITED shall not be liable for any trading losses
- We are not responsible for market volatility, technical issues, or third-party failures
- Our maximum liability is limited to the fees paid to us in the last 30 days

### 11.2 Force Majeure
- We are not liable for delays or failures due to circumstances beyond our control
- This includes market closures, technical failures, natural disasters, or regulatory changes

## 12. Account Termination

### 12.1 Termination by User
- You may terminate your account at any time through the Platform settings
- Termination does not entitle you to any refunds

### 12.2 Termination by Us
We reserve the right to suspend or terminate your account if:
- You violate these Terms & Conditions
- You engage in fraudulent or illegal activities
- We cease operations or are required to do so by law

## 13. Modifications to Terms

- We reserve the right to modify these Terms & Conditions at any time
- Changes will be effective immediately upon posting on the Platform
- Your continued use of the Platform constitutes acceptance of modified terms

## 14. Governing Law

- These Terms & Conditions are governed by the laws of India
- Any disputes shall be subject to the exclusive jurisdiction of courts in India

## 15. Contact Information

For questions regarding these Terms & Conditions, please contact us:

**SMILYKART SERVICE PRIVATE LIMITED**

- **User Support**: usersupport@indexpilotai.com
- **Broker Support**: brokersupport@indexpilotai.com

## 16. Severability

If any provision of these Terms & Conditions is found to be invalid or unenforceable, the remaining provisions shall remain in full force and effect.

## 17. Entire Agreement

These Terms & Conditions, together with our Privacy Policy, constitute the entire agreement between you and SMILYKART SERVICE PRIVATE LIMITED regarding your use of the Platform.

---

**By using IndexpilotAI, you acknowledge that you have read, understood, and agree to be bound by these Terms & Conditions.**`,
          showInFooter: true,
          footerSection: 'Legal',
          order: 1,
          lastUpdated: 'March 6, 2026',
          enabled: true
        },
        {
          id: 'privacy',
          title: 'Privacy Policy',
          slug: 'privacy',
          content: `# Privacy Policy

**Last Updated: March 6, 2026**

## 1. Introduction

SMILYKART SERVICE PRIVATE LIMITED ("we", "our", or "us") operates IndexpilotAI (the "Platform"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Platform.

## 2. Information We Collect

### 2.1 Personal Information
We collect the following personal information:
- **Account Information**: Name, email address, phone number
- **Trading Account Details**: Dhan broker credentials, account ID
- **Financial Information**: Trading activity, profit/loss data, wallet balance
- **Payment Information**: Payment history and transaction details

### 2.2 Automatically Collected Information
- **Device Information**: IP address, browser type, device type
- **Usage Data**: Pages visited, features used, time spent on Platform
- **Cookies**: We use cookies to enhance user experience and track analytics

### 2.3 Trading Data
- Real-time market data accessed through your Dhan account
- Trade execution history and order details
- AI-generated trading signals and strategy parameters
- Risk management settings and position data

## 3. How We Use Your Information

We use your information for the following purposes:

### 3.1 Service Delivery
- Providing access to our AI-powered trading platform
- Executing trades through Dhan broker integration
- Generating personalized trading signals and strategies
- Monitoring positions and managing risk

### 3.2 Platform Improvement
- Analyzing usage patterns to improve features
- Developing new AI algorithms and trading strategies
- Testing and optimizing platform performance
- Conducting research and analytics

### 3.3 Communication
- Sending account notifications and updates
- Providing customer support and responding to inquiries
- Sending important platform announcements
- Marketing communications (with your consent)

### 3.4 Billing and Payments
- Processing profit-based fees according to our pricing tiers
- Managing your wallet and payment transactions
- Generating invoices and transaction records

### 3.5 Security and Compliance
- Detecting and preventing fraud
- Ensuring platform security and preventing unauthorized access
- Complying with legal obligations and regulations

## 4. How We Share Your Information

### 4.1 Third-Party Service Providers
We share information with:
- **Dhan Broker**: For trade execution and market data access
- **Payment Processors**: For processing subscription and fee payments
- **Cloud Hosting Providers**: For data storage and platform hosting
- **Analytics Services**: For understanding platform usage (anonymized data)

### 4.2 Legal Requirements
We may disclose your information if required by:
- Court orders or legal processes
- Government authorities or regulatory bodies
- Law enforcement agencies investigating illegal activities
- Protection of our rights, property, or safety

### 4.3 Business Transfers
In the event of a merger, acquisition, or sale of assets, your information may be transferred to the acquiring entity.

## 5. Data Security

### 5.1 Security Measures
We implement industry-standard security measures:
- Encryption of data in transit and at rest
- Secure authentication and access controls
- Regular security audits and vulnerability assessments
- Firewall protection and intrusion detection systems

### 5.2 Dhan API Security
- Your Dhan credentials are encrypted and securely stored
- We use OAuth 2.0 or API token authentication
- Trading API calls are made over secure HTTPS connections
- We do not store your Dhan password in plain text

### 5.3 Data Breach Protocol
In the event of a data breach:
- We will notify affected users within 72 hours
- We will take immediate action to contain and remedy the breach
- We will cooperate with authorities as required

## 6. Data Retention

### 6.1 Retention Period
- **Active Accounts**: We retain data for the duration of your account
- **Inactive Accounts**: Data is retained for 2 years after last activity
- **Legal Requirements**: Some data may be retained longer for compliance purposes

### 6.2 Data Deletion
- You can request account deletion at any time
- Upon deletion, we will remove personal data within 30 days
- Some data may be retained for legal or regulatory compliance

## 7. Your Privacy Rights

### 7.1 Access and Portability
- You have the right to access your personal information
- You can request a copy of your data in a portable format
- Contact us at usersupport@indexpilotai.com to exercise this right

### 7.2 Correction and Updates
- You can update your account information at any time through the Platform
- Contact us to correct any inaccurate information

### 7.3 Deletion and Erasure
- You can request deletion of your account and personal data
- Some information may be retained for legal compliance
- Deletion requests are processed within 30 days

### 7.4 Opt-Out
- You can opt out of marketing communications at any time
- You can disable certain cookies through your browser settings
- Essential cookies cannot be disabled without affecting Platform functionality

## 8. Cookies and Tracking

### 8.1 Types of Cookies
- **Essential Cookies**: Required for Platform functionality
- **Analytics Cookies**: Track usage patterns and performance
- **Preference Cookies**: Remember your settings and preferences
- **Marketing Cookies**: Deliver relevant advertisements (optional)

### 8.2 Cookie Management
- You can manage cookie preferences through your browser
- Disabling essential cookies may affect Platform functionality
- Third-party cookies are subject to third-party privacy policies

## 9. Children's Privacy

- IndexpilotAI is not intended for users under 18 years of age
- We do not knowingly collect information from minors
- If we discover data from a minor, we will delete it immediately

## 10. International Data Transfers

- Our Platform is hosted in India
- Your data may be transferred to and processed in other countries
- We ensure adequate safeguards for international data transfers

## 11. Third-Party Links

- Our Platform may contain links to third-party websites or services
- We are not responsible for third-party privacy practices
- Please review third-party privacy policies before providing information

## 12. AI and Algorithmic Processing

### 12.1 AI Trading Algorithms
- Our AI algorithms process your trading data to generate signals
- Algorithm decisions are based on historical patterns and market data
- You can disable automated trading at any time

### 12.2 Data Training
- We may use anonymized trading data to improve our AI models
- Personal identifiers are removed before data is used for training
- You can opt out of data training usage by contacting us

## 13. Changes to This Privacy Policy

- We may update this Privacy Policy from time to time
- Changes will be posted on this page with an updated "Last Updated" date
- Material changes will be communicated via email or Platform notification
- Your continued use of the Platform constitutes acceptance of changes

## 14. Contact Us

For privacy-related questions or requests:

**SMILYKART SERVICE PRIVATE LIMITED**

- **User Support**: usersupport@indexpilotai.com
- **Broker Support**: brokersupport@indexpilotai.com

### Data Protection Requests
To exercise your privacy rights, please email usersupport@indexpilotai.com with:
- Your full name and registered email address
- Specific request (access, correction, deletion, opt-out)
- Proof of identity (for security purposes)

We will respond to your request within 30 days.

## 15. Compliance

- We comply with applicable data protection laws in India
- We follow industry best practices for data security
- We are committed to protecting your privacy and personal information

---

**By using IndexpilotAI, you acknowledge that you have read, understood, and agree to this Privacy Policy.**`,
          showInFooter: true,
          footerSection: 'Legal',
          order: 2,
          lastUpdated: 'March 6, 2026',
          enabled: true
        },
        {
          id: 'about',
          title: 'About Us',
          slug: 'about',
          content: `# About IndexpilotAI

## Revolutionizing Options Trading with Artificial Intelligence

IndexpilotAI is India's most advanced AI-powered options trading platform, developed and operated by **SMILYKART SERVICE PRIVATE LIMITED**. We combine cutting-edge artificial intelligence with real-time market data to deliver intelligent, automated trading solutions for Indian stock market options.

## Our Mission

Our mission is to democratize algorithmic trading and make sophisticated AI-powered trading strategies accessible to retail traders. We believe that advanced technology should empower individual investors, not just institutional traders.

## What We Do

### AI-Powered Trading Platform
IndexpilotAI provides a comprehensive options trading solution that includes:

- **Automated Trading Engine**: Our proprietary AI algorithms analyze market conditions in real-time and execute trades automatically
- **Multi-Index Support**: Trade NIFTY, BANKNIFTY, and SENSEX options with specialized strategies for each index
- **Real-Time Market Data**: Seamless integration with Dhan broker for lightning-fast data and execution
- **Intelligent Risk Management**: Advanced position monitoring and automatic risk controls
- **Profit Tracking**: Comprehensive analytics and performance tracking

### Technology Stack
- Advanced machine learning algorithms for pattern recognition
- Real-time data processing and analysis
- Cloud-based infrastructure for 24/7 availability
- Secure API integration with Dhan broker
- Modern web and mobile applications

## Our Approach

### 1. AI-First Philosophy
We leverage the latest advances in artificial intelligence and machine learning:
- **Pattern Recognition**: Our AI identifies complex market patterns that humans might miss
- **Adaptive Learning**: Algorithms continuously learn from market behavior and trading outcomes
- **Multi-Factor Analysis**: Simultaneous analysis of technical indicators, price action, and market sentiment
- **Real-Time Decision Making**: Split-second analysis and execution for optimal entry and exit points

### 2. Transparency & Education
We believe in transparency:
- No hidden fees or surprise charges
- Clear profit-based pricing model (only pay when you profit)
- Educational resources and strategy explanations
- Full control over your trading parameters

### 3. Risk Management First
Trading safety is our priority:
- Configurable stop-loss and take-profit levels
- Position size limits and daily loss caps
- Real-time risk monitoring and alerts
- Emergency stop functionality

## Why Choose IndexpilotAI?

### ✅ No SEBI Registration Required
We are NOT a SEBI-registered advisory service. We provide technology and educational tools for algorithmic trading. SEBI registration is not required for trading software platforms.

### ✅ No Fixed Profit Guarantees
We are transparent about the risks of trading:
- We do NOT guarantee fixed profits
- All trading involves risk, and losses are possible
- Past performance does not guarantee future results
- You have complete control over your trading decisions

### ✅ Profit-Based Pricing
You only pay when you profit:
- **Free Tier**: ₹0-₹5,000 daily profit (No charge)
- **Standard Tier**: ₹5,001-₹15,000 daily profit (5% of profit)
- **Premium Tier**: ₹15,001+ daily profit (10% of profit)

### ✅ Advanced Features
- Multi-timeframe analysis (5M, 15M, 1H)
- Customizable AI strategies
- Backtesting and simulation tools
- Comprehensive trade journal
- Mobile app for on-the-go trading

### ✅ Reliable Infrastructure
- 99.9% uptime guarantee
- Cloud-based scalable architecture
- Secure data encryption
- Regular backups and disaster recovery

## Our Technology Partners

### Dhan Broker Integration
IndexpilotAI integrates seamlessly with Dhan, one of India's leading discount brokers:
- Ultra-fast trade execution (sub-second latency)
- Real-time options chain data
- Comprehensive market depth
- Competitive brokerage rates

### Cloud Infrastructure
We use enterprise-grade cloud services:
- Secure hosting with redundancy
- Global CDN for fast access
- Auto-scaling for peak loads
- 24/7 monitoring and support

## Company Information

**SMILYKART SERVICE PRIVATE LIMITED**

### Legal Status
- Registered private limited company in India
- Operating since 2025
- Focused exclusively on trading technology and education

### NOT SEBI Registered
**Important Disclosure**: We are NOT registered with the Securities and Exchange Board of India (SEBI). We are a technology platform providing:
- Algorithmic trading software
- Educational resources and tools
- Real-time data visualization
- Automated execution capabilities

We do NOT provide:
- SEBI-registered investment advisory
- Portfolio management services
- Guaranteed return schemes
- Fixed profit commitments

### Regulatory Compliance
While we are not SEBI-registered, we comply with:
- Indian IT laws and data protection regulations
- RBI guidelines for payment processing
- GST and tax regulations
- Consumer protection laws

## Our Values

### Innovation
We continuously improve our AI algorithms and platform features based on:
- Latest research in quantitative finance
- Advances in machine learning and deep learning
- User feedback and feature requests
- Market evolution and regulatory changes

### Integrity
We operate with complete transparency:
- Clear pricing with no hidden charges
- Honest communication about risks and limitations
- No false profit guarantees or misleading claims
- Ethical AI practices and responsible automation

### Customer Success
Your success is our success:
- Responsive customer support
- Comprehensive documentation and tutorials
- Active community engagement
- Regular platform updates and improvements

### Security
Protecting your data and funds:
- Bank-grade encryption
- Secure authentication (2FA available)
- Regular security audits
- No storage of broker passwords in plain text

## Product Roadmap

### Current Features (March 2026)
- ✅ NIFTY, BANKNIFTY, and SENSEX options trading
- ✅ Multi-timeframe AI analysis
- ✅ Automated trade execution via Dhan
- ✅ Real-time position monitoring
- ✅ Profit-based pricing model
- ✅ Mobile app (iOS & Android)
- ✅ Comprehensive trade journal
- ✅ Backtesting capabilities

### Upcoming Features
- 🔜 Multi-broker support (additional brokers beyond Dhan)
- 🔜 Strategy marketplace (share and use community strategies)
- 🔜 Social trading features (copy successful traders)
- 🔜 Advanced charting and technical analysis tools
- 🔜 AI strategy customization studio
- 🔜 Paper trading mode for practice

## Contact Us

We're here to help! Reach out to us:

### User Support
**Email**: usersupport@indexpilotai.com
- Account issues and login help
- Platform usage and feature questions
- Billing and payment inquiries
- General platform support

### Broker Support
**Email**: brokersupport@indexpilotai.com
- Dhan broker integration issues
- API connection problems
- Trade execution errors
- Order placement and modification help

### Business Hours
- Monday to Friday: 9:00 AM - 6:00 PM IST
- Saturday: 10:00 AM - 3:00 PM IST
- Sunday: Closed

### Emergency Support
For critical issues during market hours, we provide priority support through our platform's live chat feature.

## Join Our Community

Stay connected and learn from fellow traders:
- Follow us on social media (links in footer)
- Join our Telegram community for updates
- Subscribe to our blog for trading insights
- Attend our weekly webinars and training sessions

## Disclaimers

### Trading Risks
- Options trading carries significant risk
- You can lose your entire investment
- Past performance does not guarantee future results
- Market conditions can change rapidly

### No Financial Advice
- We are NOT providing financial advice
- All trading decisions are your sole responsibility
- Consult a SEBI-registered advisor for personalized advice
- Our AI signals are for informational purposes only

### Technology Limitations
- No algorithm can guarantee profits
- Market volatility can lead to unexpected results
- Technical issues may occasionally occur
- Internet connectivity affects platform performance

## Thank You

Thank you for choosing IndexpilotAI as your trading technology partner. We're committed to providing you with the most advanced, reliable, and transparent AI-powered trading platform in India.

**Happy Trading!**

*SMILYKART SERVICE PRIVATE LIMITED*
*IndexpilotAI Team*`,
          showInFooter: true,
          footerSection: 'Company',
          order: 1,
          lastUpdated: 'March 6, 2026',
          enabled: true
        },
        {
          id: 'contact',
          title: 'Contact Us',
          slug: 'contact',
          content: `# Contact Us

## Get in Touch with IndexpilotAI

We're here to help! Whether you have questions about our platform, need technical support, or want to provide feedback, our team at **SMILYKART SERVICE PRIVATE LIMITED** is ready to assist you.

## Support Channels

### 📧 Email Support

We maintain dedicated email channels for different types of inquiries:

#### User Support
**Email**: usersupport@indexpilotai.com

**For issues related to:**
- Account registration and login problems
- Password reset and account recovery
- Platform navigation and feature usage
- Billing, payments, and wallet management
- Subscription plans and pricing questions
- Platform bugs and technical issues
- Feature requests and suggestions
- General platform inquiries

**Expected Response Time**: Within 4-6 hours during business hours

---

#### Broker Support
**Email**: brokersupport@indexpilotai.com

**For issues related to:**
- Dhan broker integration and connection
- API configuration and credentials
- Trade execution errors and delays
- Order placement and modification issues
- Position monitoring and sync problems
- Market data connectivity issues
- Real-time data feed problems
- Broker-specific technical questions

**Expected Response Time**: Within 2-4 hours during market hours (priority support)

---

## Business Hours

### Regular Support Hours
- **Monday to Friday**: 9:00 AM - 6:00 PM IST
- **Saturday**: 10:00 AM - 3:00 PM IST
- **Sunday**: Closed

### Emergency Support
For **critical issues during market hours**, we provide priority support:
- **Market Days**: 9:15 AM - 3:30 PM IST
- **Access**: Through in-platform live chat
- **Response Time**: Within 30 minutes

## What to Include in Your Email

To help us assist you faster, please include:

### For User Support Emails:
1. **Your registered email address**
2. **Clear description of the issue**
3. **Screenshots** (if applicable)
4. **Steps to reproduce the problem**
5. **Browser/device information**
6. **Error messages** (copy exact text)

### For Broker Support Emails:
1. **Your Dhan account ID** (last 4 digits only)
2. **Timestamp of the issue**
3. **Specific orders/trades affected**
4. **Screenshots of error messages**
5. **Trading symbol and timeframe**
6. **API connection status**

## Frequently Asked Questions

Before reaching out, check if your question is answered below:

### Account & Registration
**Q: How do I reset my password?**
A: Click "Forgot Password" on the login page, or email usersupport@indexpilotai.com

**Q: Can I have multiple accounts?**
A: No, each user is allowed only one account per email address.

**Q: How do I delete my account?**
A: Email usersupport@indexpilotai.com with your deletion request.

### Broker Integration
**Q: Which brokers do you support?**
A: Currently, we support Dhan broker exclusively. More brokers coming soon.

**Q: Is my Dhan password safe?**
A: Yes, we use encrypted API tokens and never store your password in plain text.

**Q: Why are my trades not executing?**
A: Check your Dhan API connection status and available funds. Email brokersupport@indexpilotai.com if issues persist.

### Pricing & Payments
**Q: How does the profit-based pricing work?**
A: We charge based on daily profits:
- **Free**: ₹0-₹5,000 daily profit
- **Standard**: 5% of profit (₹5,001-₹15,000)
- **Premium**: 10% of profit (₹15,001+)

**Q: Are there any hidden charges?**
A: No, we have transparent pricing with no hidden fees.

**Q: What if I make a loss?**
A: You pay nothing. We only charge when you make a profit.

### Platform Features
**Q: Can I customize AI strategies?**
A: Yes, you can adjust risk parameters, timeframes, and trading preferences.

**Q: Is there a mobile app?**
A: Yes! IndexpilotAI is available on both iOS and Android with full functionality.

**Q: Can I backtest strategies?**
A: Yes, our platform includes comprehensive backtesting tools.

### Technical Issues
**Q: Why is my platform not loading?**
A: Try clearing cache, using a different browser, or checking your internet connection. Contact usersupport@indexpilotai.com if the issue persists.

**Q: Are there any platform maintenance windows?**
A: We schedule maintenance after market hours and notify users in advance.

**Q: What if I lose internet connection during trading?**
A: Our cloud-based system continues running. Reconnect as soon as possible to monitor positions.

## Feedback & Suggestions

We value your input! Help us improve IndexpilotAI:

### Share Your Experience
- **Email**: usersupport@indexpilotai.com
- **Subject**: "Feature Request" or "Feedback"
- **Include**: Detailed description of your suggestion

### Feature Requests
We actively consider user requests for:
- New trading strategies
- Additional technical indicators
- Platform UI/UX improvements
- Integration with new brokers
- Mobile app enhancements

## Social Media

Stay connected with us on social media:

- **Instagram**: Follow us for trading tips and platform updates
- **YouTube**: Watch tutorials, webinars, and strategy guides
- **LinkedIn**: Connect with us for company news and updates
- **Facebook**: Join our community of traders
- **X (Twitter)**: Get real-time platform updates and market insights

*Social media links are available in the footer of our website*

## Partnership & Business Inquiries

### For Business Collaborations
If you're interested in:
- Business partnerships
- Broker integrations
- Institutional licensing
- Media and press inquiries

**Email**: usersupport@indexpilotai.com with "Business Inquiry" in the subject line.

## Report a Bug

Found a bug? Help us fix it:

### Bug Reporting Guidelines
1. **Email**: usersupport@indexpilotai.com
2. **Subject**: "Bug Report: [Brief Description]"
3. **Include**:
   - Detailed description of the bug
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots or screen recordings
   - Browser/device information
   - Timestamp when it occurred

### Security Vulnerabilities
If you discover a security vulnerability:
- **Email**: usersupport@indexpilotai.com
- **Subject**: "SECURITY: [Brief Description]"
- **Do NOT** disclose publicly before we can fix it
- We appreciate responsible disclosure

## Legal & Compliance

For legal, compliance, or regulatory inquiries:
- **Email**: usersupport@indexpilotai.com
- **Subject**: "Legal Inquiry"

## Company Information

**SMILYKART SERVICE PRIVATE LIMITED**

**Operating Name**: IndexpilotAI

**Registered Office**: India (specific address available upon request)

**Business Type**: Technology Platform (Algorithmic Trading Software)

**SEBI Registration**: NOT registered with SEBI (we provide technology, not investment advisory)

## Support Team

Our support team consists of:
- **Customer Support Specialists**: Handle account and platform questions
- **Technical Support Engineers**: Resolve technical and integration issues
- **Trading Support Experts**: Assist with strategy and trading-related queries
- **Escalation Team**: Handle complex cases requiring senior attention

## Response Time Commitment

We strive to respond within:
- **Critical Issues (Trading Impact)**: 30 minutes - 2 hours
- **Broker Integration Issues**: 2-4 hours
- **General Support Queries**: 4-6 hours
- **Feature Requests & Feedback**: 24-48 hours

*Response times are for business hours. After-hours emails are queued for next business day.*

## Escalation Process

If you're not satisfied with the initial response:

1. **Reply to the support email** with "ESCALATE" in the subject
2. **Explain why** you need escalation
3. **Senior team member** will review within 4 hours
4. **Management review** available for unresolved critical issues

## We're Here to Help!

Your success is our priority. Don't hesitate to reach out with any questions, concerns, or feedback. Our team is dedicated to providing you with the best possible support experience.

### Quick Contact Summary

| Issue Type | Email | Expected Response |
|------------|-------|-------------------|
| Account & Platform | usersupport@indexpilotai.com | 4-6 hours |
| Broker & Trading | brokersupport@indexpilotai.com | 2-4 hours |
| Critical (Market Hours) | Live Chat (in-platform) | 30 minutes |

---

**Thank you for choosing IndexpilotAI!**

*SMILYKART SERVICE PRIVATE LIMITED*
*The IndexpilotAI Team*

**Disclaimer**: We are NOT SEBI-registered. We provide algorithmic trading technology and educational tools. All trading involves risk. We do NOT guarantee fixed profits. Trade responsibly.`,
          showInFooter: true,
          footerSection: 'Company',
          order: 2,
          lastUpdated: 'March 6, 2026',
          enabled: true
        },
        {
          id: 'refund-policy',
          title: 'Refund & Cancellation Policy',
          slug: 'refund-policy',
          content: `# Refund & Cancellation Policy

**Last Updated: March 6, 2026**

## Overview

At **IndexpilotAI**, operated by **SMILYKART SERVICE PRIVATE LIMITED**, we believe in fair and transparent policies. This document outlines our refund and cancellation policy.

## 1. Service Model

### 1.1 Profit-Based Pricing
IndexpilotAI operates on a unique profit-based pricing model:
- **Free Tier**: ₹0-₹5,000 daily profit (No charge)
- **Standard Tier**: ₹5,001-₹15,000 daily profit (5% of profit charged)
- **Premium Tier**: ₹15,001+ daily profit (10% of profit charged)

## 2. Refund Policy

### 2.1 Wallet Refunds
- Unused wallet balance can be refunded to your original payment method
- Refund requests must be submitted via email to usersupport@indexpilotai.com
- Minimum refund amount: ₹100
- Refunds are processed within 5-7 business days

### 2.2 Service Charges
**Service charges for profit-based fees are non-refundable** because charges are applied AFTER you have already realized profits.

## 3. Cancellation Policy

### 3.1 Service Cancellation
- You can cancel your IndexpilotAI account at any time
- No cancellation fees or penalties
- Email usersupport@indexpilotai.com with "Cancel Account" in the subject line

### 3.2 Wallet Balance After Cancellation
- Any remaining wallet balance will be refunded to your original payment method
- Refund processing time: 5-7 business days

## 4. Contact

For refund or cancellation requests:
- **Email**: usersupport@indexpilotai.com
- **Subject**: "Refund Request" or "Cancellation Request"

*SMILYKART SERVICE PRIVATE LIMITED*`,
          showInFooter: true,
          footerSection: 'Legal',
          order: 3,
          lastUpdated: 'March 6, 2026',
          enabled: true
        },
        {
          id: 'disclaimer',
          title: 'Disclaimer',
          slug: 'disclaimer',
          content: `# Disclaimer

**Last Updated: March 6, 2026**

## Important Legal Disclaimer

This disclaimer applies to the use of IndexpilotAI platform, operated by **SMILYKART SERVICE PRIVATE LIMITED**.

## 1. No SEBI Registration

- IndexpilotAI is a TECHNOLOGY PLATFORM, not an investment advisory service
- We are NOT registered with the Securities and Exchange Board of India (SEBI)
- We do NOT provide SEBI-registered investment advice
- We provide algorithmic trading software and educational tools only

## 2. No Guaranteed Profits

- **ALL TRADING INVOLVES RISK**
- You may lose PART or ALL of your invested capital
- Past performance does NOT guarantee future results
- We do NOT promise or guarantee any fixed percentage returns

## 3. Trading Risks

Options trading is highly speculative and involves substantial risk:
- **Total Loss**: You can lose 100% of your investment
- **Leverage Risk**: Options involve leverage, amplifying both gains and losses
- **Time Decay**: Options lose value as expiration approaches
- **Volatility Risk**: Rapid price movements can result in significant losses

## 4. User Responsibility

- YOU are solely responsible for YOUR trading decisions
- YOU must evaluate your own risk tolerance
- YOU should invest only what you can afford to lose
- Consult a SEBI-registered financial advisor for personalized advice

## 5. Liability Limitations

- We are NOT liable for any trading losses you incur
- Use of IndexpilotAI is entirely at your own risk
- We provide the platform "AS IS" without warranties

**BY USING INDEXPILOTAI, YOU ACKNOWLEDGE THAT:**

1. You accept all risks associated with options trading
2. You understand we do NOT guarantee profits
3. You will not hold us liable for any trading losses
4. You are using the platform entirely at your own risk

**TRADE RESPONSIBLY. NEVER INVEST MORE THAN YOU CAN AFFORD TO LOSE.**

*SMILYKART SERVICE PRIVATE LIMITED*`,
          showInFooter: true,
          footerSection: 'Legal',
          order: 4,
          lastUpdated: 'March 6, 2026',
          enabled: true
        },
        {
          id: 'risk-disclosure',
          title: 'Risk Disclosure',
          slug: 'risk-disclosure',
          content: `# Risk Disclosure Statement

**Last Updated: March 6, 2026**

## IMPORTANT: READ CAREFULLY BEFORE TRADING

This Risk Disclosure Statement is issued by **SMILYKART SERVICE PRIVATE LIMITED** (IndexpilotAI).

## ⚠️ WARNING: HIGH-RISK ACTIVITY

### Options trading is EXTREMELY RISKY and may not be suitable for all investors.
### You can lose 100% of your invested capital.
### Do NOT trade with money you cannot afford to lose.

## 1. Options Trading Risks

### 1.1 Total Capital Loss
- Options can expire worthless
- You may lose your ENTIRE investment
- Multiple consecutive losses can deplete your capital quickly

### 1.2 Leverage Risk
- Options provide leverage, amplifying both gains and losses
- Small market movements can result in large percentage losses

### 1.3 Time Decay (Theta)
- Options lose value as expiration approaches
- Time decay accelerates as expiration nears

### 1.4 Volatility Risk
- High volatility increases option premiums
- Volatility can drop suddenly, reducing option values

## 2. Market Risks

- Indian markets experience high volatility
- Gap openings after market close can bypass stop-losses
- Geopolitical events create uncertainty

## 3. Technology Risks

- Platform downtime can prevent trade execution
- Internet connectivity problems affect access
- AI algorithms have limitations

## 4. Mitigation Strategies

### Risk Management
- **Never risk more than 1-2% of capital per trade**
- Use stop-losses consistently
- Set daily and weekly loss limits
- Maintain adequate reserves

### Education
- Learn options trading fundamentals
- Understand Greeks (Delta, Gamma, Theta, Vega)
- Continuously improve trading knowledge

## 5. Final Risk Warning

**DO NOT TRADE IF:**
- You cannot afford to lose the money
- You don't understand options trading
- You have existing debts or financial obligations
- You are using borrowed money

**UNDERSTAND THAT:**
- Most retail traders lose money in options trading
- There is NO such thing as "easy money" in trading
- AI and automation do NOT eliminate risk
- You CAN lose your entire investment

## Acknowledgment

By using IndexpilotAI, you acknowledge that:

✅ You understand the substantial risks of options trading
✅ You accept full responsibility for your trading decisions
✅ You will not hold us liable for losses
✅ You understand that we do NOT guarantee profits

**"Trading derivatives carries a high level of risk to your capital. Trade responsibly."**

*SMILYKART SERVICE PRIVATE LIMITED*`,
          showInFooter: true,
          footerSection: 'Legal',
          order: 5,
          lastUpdated: 'March 6, 2026',
          enabled: true
        }
      ];
      await kv.set('landing_pages', defaultPages);
      return defaultPages;
    }
    return pages;
  } catch (error) {
    console.error('Error fetching pages:', error);
    return [];
  }
}

// Get single page by slug
export async function getPageBySlug(slug: string) {
  try {
    const pages = await getAllPages();
    return pages.find((p: any) => p.slug === slug);
  } catch (error) {
    console.error('Error fetching page:', error);
    return null;
  }
}

// Create or update page
export async function savePage(pageData: any) {
  try {
    const pages = await getAllPages();
    const existingIndex = pages.findIndex((p: any) => p.id === pageData.id);
    
    if (existingIndex >= 0) {
      // Update existing page
      pages[existingIndex] = { ...pages[existingIndex], ...pageData };
    } else {
      // Create new page
      const newPage = {
        id: pageData.id || `page_${Date.now()}`,
        ...pageData,
        lastUpdated: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      };
      pages.push(newPage);
    }
    
    await kv.set('landing_pages', pages);
    return pages;
  } catch (error) {
    console.error('Error saving page:', error);
    throw error;
  }
}

// Delete page
export async function deletePage(pageId: string) {
  try {
    const pages = await getAllPages();
    const filteredPages = pages.filter((p: any) => p.id !== pageId);
    await kv.set('landing_pages', filteredPages);
    return filteredPages;
  } catch (error) {
    console.error('Error deleting page:', error);
    throw error;
  }
}

// Get Privacy Policy content
export async function getPrivacyContent() {
  try {
    const content = await kv.get('page_privacy');
    if (!content) {
      const defaultPrivacy = {
        title: "Privacy Policy",
        lastUpdated: "March 5, 2026",
        sections: [] // Will be populated from existing PrivacyPage component
      };
      await kv.set('page_privacy', defaultPrivacy);
      return defaultPrivacy;
    }
    return content;
  } catch (error) {
    console.error('Error fetching privacy content:', error);
    return null;
  }
}

// Update Privacy Policy
export async function updatePrivacyContent(data: any) {
  try {
    await kv.set('page_privacy', data);
    return data;
  } catch (error) {
    console.error('Error updating privacy content:', error);
    throw error;
  }
}

// Social Media Links Management
export async function getSocialLinks() {
  try {
    const links = await kv.get('social_media_links');
    if (!links) {
      // Initialize with default social media links
      const defaultLinks = {
        instagram: 'https://instagram.com/indexpilotai',
        youtube: 'https://youtube.com/@indexpilotai',
        linkedin: 'https://linkedin.com/company/indexpilotai',
        facebook: 'https://facebook.com/indexpilotai',
        twitter: 'https://twitter.com/indexpilotai', // X (formerly Twitter)
        telegram: 'https://t.me/indexpilotai',
        lastUpdated: 'March 6, 2026'
      };
      await kv.set('social_media_links', defaultLinks);
      return defaultLinks;
    }
    return links;
  } catch (error) {
    console.error('Error fetching social links:', error);
    return {
      instagram: '',
      youtube: '',
      linkedin: '',
      facebook: '',
      twitter: '',
      telegram: '',
      lastUpdated: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    };
  }
}

// Update social media links
export async function updateSocialLinks(links: any) {
  try {
    const updatedLinks = {
      ...links,
      lastUpdated: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    };
    await kv.set('social_media_links', updatedLinks);
    return updatedLinks;
  } catch (error) {
    console.error('Error updating social links:', error);
    throw error;
  }
}