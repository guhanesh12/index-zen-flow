// @ts-nocheck
import { ArrowLeft, TrendingUp } from 'lucide-react';
import { Button } from './ui/button';

interface PrivacyPageProps {
  onBack: () => void;
}

export default function PrivacyPage({ onBack }: PrivacyPageProps) {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">IndexpilotAI</h1>
                <p className="text-xs text-slate-400">Privacy Policy</p>
              </div>
            </div>
            <Button variant="outline" onClick={onBack} className="border-slate-700 text-white hover:bg-slate-800">
              <ArrowLeft className="mr-2 w-4 h-4" />
              Back
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="prose prose-invert prose-slate max-w-none">
          <h1 className="text-4xl font-bold text-white mb-4">Privacy Policy</h1>
          <p className="text-slate-400 mb-8">Last Updated: March 5, 2026</p>

          <div className="space-y-8">
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">1. Introduction</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                IndexpilotAI ("we", "us", or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our AI-powered automated trading platform.
              </p>
              <p className="text-slate-300 leading-relaxed">
                By using IndexpilotAI, you agree to the collection and use of information in accordance with this policy. If you do not agree with our policies and practices, please do not use our Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">2. Information We Collect</h2>
              
              <h3 className="text-xl font-semibold text-white mb-3 mt-6">2.1 Personal Information</h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                When you register for IndexpilotAI, we collect the following personal information:
              </p>
              <ul className="list-disc list-inside space-y-2 text-slate-300 ml-4">
                <li><strong className="text-white">Full Name:</strong> To identify your account</li>
                <li><strong className="text-white">Email Address:</strong> For account communication and notifications</li>
                <li><strong className="text-white">Mobile Number:</strong> For OTP verification and important alerts</li>
                <li><strong className="text-white">Location (Country, State, City):</strong> For regulatory compliance and service optimization</li>
                <li><strong className="text-white">Password:</strong> Encrypted and securely stored for account access</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">2.2 Trading Account Information</h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                To enable automated trading, we collect:
              </p>
              <ul className="list-disc list-inside space-y-2 text-slate-300 ml-4">
                <li><strong className="text-white">Dhan Broker API Keys:</strong> For connecting to your trading account</li>
                <li><strong className="text-white">Trading Preferences:</strong> Risk parameters, strategy settings</li>
                <li><strong className="text-white">Account Balance Information:</strong> To monitor available funds</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">2.3 Trading Activity Data</h3>
              <ul className="list-disc list-inside space-y-2 text-slate-300 ml-4">
                <li>Trade history and order details</li>
                <li>Profit and loss information</li>
                <li>Position data and portfolio composition</li>
                <li>AI signal performance and execution data</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">2.4 Technical Information</h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                We automatically collect certain technical information:
              </p>
              <ul className="list-disc list-inside space-y-2 text-slate-300 ml-4">
                <li>IP address and device information</li>
                <li>Browser type and version</li>
                <li>Operating system</li>
                <li>Login times and activity logs</li>
                <li>Cookies and similar tracking technologies</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">2.5 Payment Information</h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                Payment processing is handled by Razorpay. We do not store your complete credit card information. We may store:
              </p>
              <ul className="list-disc list-inside space-y-2 text-slate-300 ml-4">
                <li>Payment transaction IDs</li>
                <li>Billing amounts and dates</li>
                <li>Payment status information</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">3. How We Use Your Information</h2>
              <p className="text-slate-300 leading-relaxed mb-3">
                We use your information for the following purposes:
              </p>
              <ul className="list-disc list-inside space-y-2 text-slate-300 ml-4">
                <li><strong className="text-white">Service Provision:</strong> To provide and maintain our trading platform services</li>
                <li><strong className="text-white">Trade Execution:</strong> To execute automated trades on your behalf through Dhan API</li>
                <li><strong className="text-white">AI Analysis:</strong> To generate trading signals using our AI algorithms</li>
                <li><strong className="text-white">Risk Management:</strong> To implement stop-loss, daily limits, and position monitoring</li>
                <li><strong className="text-white">Account Management:</strong> To manage your account and provide customer support</li>
                <li><strong className="text-white">Notifications:</strong> To send trade alerts, important updates, and service notifications</li>
                <li><strong className="text-white">Billing:</strong> To calculate profit-based fees and process payments</li>
                <li><strong className="text-white">Security:</strong> To detect and prevent fraud, abuse, and security incidents</li>
                <li><strong className="text-white">Analytics:</strong> To analyze usage patterns and improve our services</li>
                <li><strong className="text-white">Compliance:</strong> To comply with legal obligations and regulatory requirements</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">4. Data Security</h2>
              <p className="text-slate-300 leading-relaxed mb-3">
                We implement industry-standard security measures to protect your information:
              </p>
              
              <h3 className="text-xl font-semibold text-white mb-3 mt-6">4.1 Encryption</h3>
              <ul className="list-disc list-inside space-y-2 text-slate-300 ml-4">
                <li>256-bit SSL/TLS encryption for data transmission</li>
                <li>End-to-end encryption for sensitive data</li>
                <li>Encrypted password storage using bcrypt</li>
                <li>API keys stored with AES-256 encryption</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">4.2 Access Controls</h3>
              <ul className="list-disc list-inside space-y-2 text-slate-300 ml-4">
                <li>Role-based access control (RBAC)</li>
                <li>Multi-factor authentication (MFA) available</li>
                <li>Regular security audits and penetration testing</li>
                <li>Strict employee access policies</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">4.3 Infrastructure Security</h3>
              <ul className="list-disc list-inside space-y-2 text-slate-300 ml-4">
                <li>Hosted on Supabase with enterprise-grade security</li>
                <li>Regular backups and disaster recovery procedures</li>
                <li>DDoS protection and firewall configurations</li>
                <li>Continuous monitoring for security threats</li>
              </ul>

              <div className="bg-cyan-900/20 border border-cyan-800 rounded-xl p-6 mt-6">
                <p className="text-cyan-400 font-semibold mb-2">🔒 Security Note</p>
                <p className="text-slate-300 leading-relaxed">
                  While we implement robust security measures, no method of transmission over the Internet is 100% secure. You are responsible for maintaining the confidentiality of your account credentials.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">5. Third-Party Services</h2>
              <p className="text-slate-300 leading-relaxed mb-3">
                We use the following third-party services that may collect information:
              </p>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">5.1 Dhan Broker API</h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                We integrate with Dhan's official API for trade execution and market data. Data shared with Dhan is subject to their privacy policy.
              </p>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">5.2 Supabase</h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                We use Supabase for authentication, database, and backend infrastructure. Supabase complies with GDPR and SOC 2 Type II standards.
              </p>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">5.3 2factor.in</h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                We use 2factor.in for mobile OTP verification. Your mobile number is shared for verification purposes only.
              </p>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">5.4 Razorpay</h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                Payment processing is handled by Razorpay. We do not store complete payment card information. Razorpay is PCI DSS compliant.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">6. Data Retention</h2>
              <p className="text-slate-300 leading-relaxed mb-3">
                We retain your information for as long as necessary to provide our services and comply with legal obligations:
              </p>
              <ul className="list-disc list-inside space-y-2 text-slate-300 ml-4">
                <li><strong className="text-white">Active Accounts:</strong> Data retained while your account is active</li>
                <li><strong className="text-white">Closed Accounts:</strong> Most data deleted within 90 days of account closure</li>
                <li><strong className="text-white">Trading Records:</strong> Retained for 7 years for regulatory compliance</li>
                <li><strong className="text-white">Financial Records:</strong> Retained as required by Indian tax and accounting laws</li>
                <li><strong className="text-white">Logs:</strong> System logs retained for 180 days for security purposes</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">7. Your Rights and Choices</h2>
              <p className="text-slate-300 leading-relaxed mb-3">
                You have the following rights regarding your personal information:
              </p>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">7.1 Access and Portability</h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                You can request a copy of your personal data in a structured, machine-readable format.
              </p>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">7.2 Correction</h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                You can update your personal information through your account settings or by contacting support.
              </p>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">7.3 Deletion</h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                You can request deletion of your account and personal data, subject to legal retention requirements.
              </p>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">7.4 Marketing Communications</h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                You can opt-out of marketing emails by clicking the unsubscribe link or updating your preferences.
              </p>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">7.5 Cookies</h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                You can control cookies through your browser settings. Note that disabling cookies may affect functionality.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">8. Cookies and Tracking</h2>
              <p className="text-slate-300 leading-relaxed mb-3">
                We use cookies and similar technologies to:
              </p>
              <ul className="list-disc list-inside space-y-2 text-slate-300 ml-4">
                <li>Maintain your login session</li>
                <li>Remember your preferences</li>
                <li>Analyze usage patterns</li>
                <li>Enhance security</li>
                <li>Provide personalized experience</li>
              </ul>
              <p className="text-slate-300 leading-relaxed mt-3">
                Types of cookies we use: Session cookies, Persistent cookies, Authentication cookies, Analytics cookies.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">9. Children's Privacy</h2>
              <p className="text-slate-300 leading-relaxed">
                Our Service is not intended for individuals under 18 years of age. We do not knowingly collect personal information from children. If you believe we have collected information from a minor, please contact us immediately.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">10. International Users</h2>
              <p className="text-slate-300 leading-relaxed mb-3">
                IndexpilotAI is operated from India and is intended for users in India. If you access our Service from outside India, please be aware that your information may be transferred to, stored, and processed in India where our servers and databases are located.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">11. Changes to Privacy Policy</h2>
              <p className="text-slate-300 leading-relaxed mb-3">
                We may update this Privacy Policy from time to time. We will notify you of any material changes by:
              </p>
              <ul className="list-disc list-inside space-y-2 text-slate-300 ml-4">
                <li>Posting the updated policy on our platform</li>
                <li>Sending an email notification to registered users</li>
                <li>Displaying a prominent notice on the dashboard</li>
              </ul>
              <p className="text-slate-300 leading-relaxed mt-3">
                Your continued use of the Service after changes become effective constitutes acceptance of the updated Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">12. Contact Us</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                If you have questions about this Privacy Policy or our data practices, please contact us:
              </p>
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                <p className="text-slate-300 mb-2"><strong className="text-white">Email:</strong> privacy@indexpilotai.com</p>
                <p className="text-slate-300 mb-2"><strong className="text-white">Data Protection Officer:</strong> dpo@indexpilotai.com</p>
                <p className="text-slate-300 mb-2"><strong className="text-white">Phone:</strong> +91-XXXXXXXXXX</p>
                <p className="text-slate-300"><strong className="text-white">Address:</strong> [Your Registered Office Address]</p>
              </div>
            </section>

            <section className="border-t border-slate-800 pt-8 mt-12">
              <p className="text-slate-400 text-sm italic">
                By using IndexpilotAI, you acknowledge that you have read and understood this Privacy Policy and agree to the collection and use of your information as described herein.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
