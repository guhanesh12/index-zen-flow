import { ArrowLeft, TrendingUp } from 'lucide-react';
import { Button } from './ui/button';

interface TermsPageProps {
  onBack: () => void;
}

export default function TermsPage({ onBack }: TermsPageProps) {
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
                <p className="text-xs text-slate-400">Terms & Conditions</p>
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
          <h1 className="text-4xl font-bold text-white mb-4">Terms & Conditions</h1>
          <p className="text-slate-400 mb-8">Last Updated: March 5, 2026</p>

          <div className="space-y-8">
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">1. Acceptance of Terms</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                By accessing and using IndexpilotAI ("Service", "Platform", "we", "us", or "our"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
              </p>
              <p className="text-slate-300 leading-relaxed">
                IndexpilotAI is an AI-powered automated trading platform for Indian options markets (NIFTY and BANKNIFTY). The platform integrates with Dhan broker API for real-time market data and trade execution.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">2. User Eligibility</h2>
              <p className="text-slate-300 leading-relaxed mb-3">You must meet the following criteria to use our Service:</p>
              <ul className="list-disc list-inside space-y-2 text-slate-300 ml-4">
                <li>Be at least 18 years of age</li>
                <li>Be a resident of India</li>
                <li>Have a valid trading account with Dhan broker</li>
                <li>Have necessary KYC documentation completed</li>
                <li>Have basic understanding of options trading and associated risks</li>
                <li>Not be prohibited from trading in securities markets by SEBI or any regulatory authority</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">3. Account Registration and Security</h2>
              <p className="text-slate-300 leading-relaxed mb-3">
                <strong className="text-white">3.1 Registration:</strong> To access the Platform, you must register by providing accurate, complete, and current information including your full name, email address, mobile number, and location details.
              </p>
              <p className="text-slate-300 leading-relaxed mb-3">
                <strong className="text-white">3.2 Mobile Verification:</strong> We use OTP-based mobile verification through 2factor.in API to ensure account security. You must have access to the mobile number you register with.
              </p>
              <p className="text-slate-300 leading-relaxed mb-3">
                <strong className="text-white">3.3 Account Security:</strong> You are responsible for maintaining the confidentiality of your account credentials. You agree to notify us immediately of any unauthorized use of your account.
              </p>
              <p className="text-slate-300 leading-relaxed">
                <strong className="text-white">3.4 Broker Integration:</strong> You must connect your Dhan trading account securely. We do not store your broker login credentials. All API keys must be kept confidential.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">4. Service Description</h2>
              <p className="text-slate-300 leading-relaxed mb-3">
                <strong className="text-white">4.1 AI Trading System:</strong> IndexpilotAI uses advanced artificial intelligence algorithms with triple-layer verification (EMA, VWAP, Pattern Recognition) to generate trading signals and execute trades automatically.
              </p>
              <p className="text-slate-300 leading-relaxed mb-3">
                <strong className="text-white">4.2 Broker Integration:</strong> The Platform currently supports Dhan broker only. We integrate with Dhan's official API for real-time market data and trade execution.
              </p>
              <p className="text-slate-300 leading-relaxed mb-3">
                <strong className="text-white">4.3 Trading Features:</strong> Our platform provides:
              </p>
              <ul className="list-disc list-inside space-y-2 text-slate-300 ml-4 mb-3">
                <li>Real-time AI-powered trading signals</li>
                <li>Automated trade execution</li>
                <li>Risk management with stop-loss and daily loss limits</li>
                <li>Position monitoring and P&L tracking</li>
                <li>Trade history and performance analytics</li>
                <li>Smart alerts and notifications</li>
              </ul>
              <p className="text-slate-300 leading-relaxed">
                <strong className="text-white">4.4 Supported Instruments:</strong> Currently limited to NIFTY and BANKNIFTY index options traded on NSE.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">5. Pricing and Payment Terms</h2>
              <p className="text-slate-300 leading-relaxed mb-3">
                <strong className="text-white">5.1 Daily Fixed Fee Pricing:</strong> IndexpilotAI operates on a simple, transparent daily fixed fee model based on your net profit. You only pay a small fixed amount each day when you make a profit. No percentage cuts, no monthly subscriptions.
              </p>
              <p className="text-slate-300 leading-relaxed mb-3">
                <strong className="text-white">5.2 Pricing Tiers (Daily Net Profit):</strong>
              </p>
              <ul className="list-disc list-inside space-y-2 text-slate-300 ml-4 mb-3">
                <li><strong className="text-green-400">₹0 – ₹100:</strong> ₹0 per day (Completely free)</li>
                <li><strong className="text-cyan-400">₹101 – ₹500:</strong> ₹29 per day</li>
                <li><strong className="text-blue-400">₹501 – ₹1,000:</strong> ₹49 per day</li>
                <li><strong className="text-purple-400">₹1,001 – ₹2,000:</strong> ₹69 per day</li>
                <li><strong className="text-yellow-400">₹2,001+:</strong> ₹89 per day</li>
              </ul>
              <p className="text-slate-300 leading-relaxed mb-3">
                <strong className="text-white">5.3 Daily Fee Calculation:</strong> Your daily fee is determined by your net profit (total profit minus total loss) at the end of each trading day. The fee is automatically calculated and you will be notified of the daily charge.
              </p>
              <p className="text-slate-300 leading-relaxed mb-3">
                <strong className="text-white">5.4 No Profit, No Fee:</strong> If you do not make any profit or make a loss on a given day, no fees will be charged for that day. You only pay on profitable days.
              </p>
              <p className="text-slate-300 leading-relaxed mb-3">
                <strong className="text-white">5.5 Payment Collection:</strong> Fees are automatically debited from your wallet balance at the end of each profitable trading day. No upfront payment is required. Your wallet is charged only when you make a profit, based on your daily profit tier. You will receive notifications for each debit.
              </p>
              <p className="text-slate-300 leading-relaxed mb-3">
                <strong className="text-white">5.6 Wallet System:</strong> You maintain a wallet balance on the platform. Fees are automatically deducted from this wallet. You can add funds to your wallet at any time through Razorpay payment gateway. You will receive alerts when your wallet balance is low.
              </p>
              <p className="text-slate-300 leading-relaxed mb-3">
                <strong className="text-white">5.7 Example:</strong> If you make ₹800 profit on Monday, ₹49 is automatically debited from your wallet at day end. If you make ₹50 profit on Tuesday, ₹0 is charged. If you make a loss on Wednesday, ₹0 is charged. Your wallet is only debited on profitable days.
              </p>
              <p className="text-slate-300 leading-relaxed">
                <strong className="text-white">5.8 Refunds:</strong> Due to the nature of our service and automatic wallet debit system, all payments are final and non-refundable once fees have been deducted for the provided service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">6. Trading Risks and Disclaimers</h2>
              <div className="bg-red-900/20 border border-red-800 rounded-xl p-6 mb-4">
                <p className="text-red-400 font-semibold mb-2">⚠️ IMPORTANT RISK DISCLOSURE</p>
                <p className="text-slate-300 leading-relaxed">
                  Trading in options and derivatives is highly speculative and involves substantial risk of loss. You should carefully consider whether such trading is suitable for you in light of your circumstances, knowledge, and financial resources.
                </p>
              </div>
              <p className="text-slate-300 leading-relaxed mb-3">
                <strong className="text-white">6.1 Market Risks:</strong> Options trading involves significant risk and is not suitable for all investors. You may lose your entire investment.
              </p>
              <p className="text-slate-300 leading-relaxed mb-3">
                <strong className="text-white">6.2 No Guarantee:</strong> While our AI algorithms are sophisticated, we do not guarantee profits or specific returns. Past performance does not indicate future results.
              </p>
              <p className="text-slate-300 leading-relaxed mb-3">
                <strong className="text-white">6.3 System Risk:</strong> Automated trading systems may experience technical failures, connectivity issues, or errors that could result in losses.
              </p>
              <p className="text-slate-300 leading-relaxed mb-3">
                <strong className="text-white">6.4 Broker Risk:</strong> Trading is subject to broker terms and conditions. We are not responsible for broker-related issues, downtime, or execution problems.
              </p>
              <p className="text-slate-300 leading-relaxed">
                <strong className="text-white">6.5 User Responsibility:</strong> You are solely responsible for all trading decisions and outcomes. We provide tools and signals, but final responsibility lies with you.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">7. User Obligations</h2>
              <p className="text-slate-300 leading-relaxed mb-3">You agree to:</p>
              <ul className="list-disc list-inside space-y-2 text-slate-300 ml-4">
                <li>Provide accurate and complete information during registration</li>
                <li>Maintain sufficient funds in your trading account</li>
                <li>Monitor your trading account and positions regularly</li>
                <li>Set appropriate risk parameters (stop-loss, daily limits)</li>
                <li>Not share your account credentials with others</li>
                <li>Comply with all applicable trading regulations and laws</li>
                <li>Not use the Platform for any illegal or unauthorized purpose</li>
                <li>Not attempt to reverse engineer or manipulate the AI system</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">8. Intellectual Property</h2>
              <p className="text-slate-300 leading-relaxed mb-3">
                All content, features, functionality, AI algorithms, designs, logos, and trademarks on the Platform are owned by IndexpilotAI and are protected by international copyright, trademark, and other intellectual property laws.
              </p>
              <p className="text-slate-300 leading-relaxed">
                You may not copy, modify, distribute, sell, or lease any part of our services or software without express written permission.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">9. Limitation of Liability</h2>
              <p className="text-slate-300 leading-relaxed mb-3">
                To the maximum extent permitted by law, IndexpilotAI shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, or other intangible losses resulting from:
              </p>
              <ul className="list-disc list-inside space-y-2 text-slate-300 ml-4">
                <li>Your use or inability to use the Service</li>
                <li>Trading losses incurred through automated or manual trading</li>
                <li>System downtime, technical failures, or connectivity issues</li>
                <li>Errors or inaccuracies in AI signals or data</li>
                <li>Unauthorized access to your account</li>
                <li>Broker-related issues or failures</li>
                <li>Changes in market conditions or regulatory environment</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">10. Termination</h2>
              <p className="text-slate-300 leading-relaxed mb-3">
                <strong className="text-white">10.1 Termination by User:</strong> You may terminate your account at any time by contacting our support team. Outstanding fees must be settled before termination.
              </p>
              <p className="text-slate-300 leading-relaxed mb-3">
                <strong className="text-white">10.2 Termination by Us:</strong> We reserve the right to suspend or terminate your account if you violate these Terms, engage in fraudulent activity, or for any other reason at our sole discretion.
              </p>
              <p className="text-slate-300 leading-relaxed">
                <strong className="text-white">10.3 Effect of Termination:</strong> Upon termination, your right to use the Service will immediately cease. We are not obligated to provide refunds for any fees already paid.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">11. Modifications to Terms</h2>
              <p className="text-slate-300 leading-relaxed mb-3">
                We reserve the right to modify these Terms at any time. We will notify users of any material changes via email or platform notification. Your continued use of the Service after such modifications constitutes acceptance of the updated Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">12. Governing Law and Jurisdiction</h2>
              <p className="text-slate-300 leading-relaxed mb-3">
                These Terms shall be governed by and construed in accordance with the laws of India. Any disputes arising from these Terms or use of the Service shall be subject to the exclusive jurisdiction of courts in [Your City], India.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">13. Contact Information</h2>
              <p className="text-slate-300 leading-relaxed mb-3">
                For questions about these Terms or the Service, please contact us:
              </p>
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                <p className="text-slate-300 mb-2"><strong className="text-white">Email:</strong> support@indexpilotai.com</p>
                <p className="text-slate-300 mb-2"><strong className="text-white">Phone:</strong> +91-XXXXXXXXXX</p>
                <p className="text-slate-300"><strong className="text-white">Address:</strong> [Your Registered Office Address]</p>
              </div>
            </section>

            <section className="border-t border-slate-800 pt-8 mt-12">
              <p className="text-slate-400 text-sm italic">
                By using IndexpilotAI, you acknowledge that you have read, understood, and agree to be bound by these Terms & Conditions.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
