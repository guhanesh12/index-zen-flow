import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { FileText, AlertTriangle, Scale, UserCheck, Shield, Ban, DollarSign, Clock, ArrowLeft } from 'lucide-react';
import { SEO } from '../utils/seo';
import { useNavigate } from 'react-router';
import { Button } from './ui/button';
const logoColor = "/logo-color.png";

export function TermsAndConditions() {
  const navigate = useNavigate();
  
  return (
    <>
      <SEO
        title="Terms & Conditions - IndexPilotAI"
        description="Terms and Conditions for using IndexPilotAI algorithmic trading platform. User agreement, platform rules, and legal disclaimers for algorithmic trading services."
        keywords="terms and conditions, user agreement, platform terms, trading terms, IndexPilotAI terms"
        canonical="/terms"
      />
      
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-4 flex items-center justify-between">
            <Button
              onClick={() => navigate(-1)}
              variant="outline"
              size="sm"
              className="bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <img src={logoColor} alt="IndexpilotAI Logo" className="h-10 w-auto" />
          </div>
          
          <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm shadow-2xl">
            <CardHeader className="border-b border-slate-700">
              <div className="flex items-center gap-3 mb-2">
                <Scale className="size-8 text-blue-400" />
                <CardTitle className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  Terms and Conditions
                </CardTitle>
              </div>
              <p className="text-sm text-slate-400">Last Updated: 01/04/2026</p>
            </CardHeader>

            <CardContent className="p-6">
              <ScrollArea className="h-[70vh] pr-4">
                <div className="space-y-6 text-slate-300">
                  
                  {/* Introduction */}
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                    <p className="leading-relaxed">
                      Welcome to <span className="font-semibold text-blue-400">IndexPilotAI</span> (https://indexpilotai.com). 
                      These Terms and Conditions ("Terms") govern your access to and use of the IndexPilotAI platform, 
                      including all services, features, tools, and applications provided by us.
                    </p>
                    <p className="mt-3 leading-relaxed">
                      By accessing or using our platform, you agree to be legally bound by these Terms. 
                      If you do not agree, you must not use the platform.
                    </p>
                  </div>

                  {/* 1. DEFINITIONS */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3 flex items-center gap-2">
                      <FileText className="size-5 text-blue-400" />
                      1. DEFINITIONS
                    </h2>
                    <ul className="space-y-2 ml-6">
                      <li className="flex gap-2">
                        <span className="text-blue-400">•</span>
                        <span><strong className="text-white">"Platform"</strong> refers to IndexPilotAI website, software, and services</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-blue-400">•</span>
                        <span><strong className="text-white">"User"</strong> refers to any individual accessing or using the platform</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-blue-400">•</span>
                        <span><strong className="text-white">"Services"</strong> include algorithmic trading tools, signal generation, automation features, dashboards, and integrations</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-blue-400">•</span>
                        <span><strong className="text-white">"Broker"</strong> refers to third-party trading service providers such as Dhan, Alice Blue, IIFL, etc.</span>
                      </li>
                    </ul>
                  </section>

                  {/* 2. ELIGIBILITY */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">2. ELIGIBILITY</h2>
                    <ul className="space-y-2 ml-6">
                      <li className="flex gap-2">
                        <span className="text-blue-400">•</span>
                        <span>You must be at least 18 years old</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-blue-400">•</span>
                        <span>You must have a valid trading account with a registered broker</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-blue-400">•</span>
                        <span>You must comply with all applicable laws and regulations in India</span>
                      </li>
                    </ul>
                  </section>

                  {/* 3. NATURE OF SERVICES */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">3. NATURE OF SERVICES</h2>
                    <div className="space-y-3">
                      <p className="font-semibold text-white">IndexPilotAI provides:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2"><span className="text-green-400">✓</span> Algorithmic trading tools</li>
                        <li className="flex gap-2"><span className="text-green-400">✓</span> Signal-based execution systems</li>
                        <li className="flex gap-2"><span className="text-green-400">✓</span> Strategy automation features</li>
                        <li className="flex gap-2"><span className="text-green-400">✓</span> Trade monitoring dashboards</li>
                      </ul>

                      <p className="font-semibold text-white mt-4">We DO NOT:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2"><span className="text-red-400">✗</span> Provide investment advice</li>
                        <li className="flex gap-2"><span className="text-red-400">✗</span> Manage user funds</li>
                        <li className="flex gap-2"><span className="text-red-400">✗</span> Act as a broker or intermediary</li>
                      </ul>

                      <p className="mt-3 font-semibold">All decisions are user-controlled or user-authorized.</p>
                    </div>
                  </section>

                  {/* 4. NO INVESTMENT ADVICE */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3 flex items-center gap-2">
                      <AlertTriangle className="size-5 text-yellow-400" />
                      4. NO INVESTMENT ADVICE
                    </h2>
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 space-y-3">
                      <p>All content, signals, strategies, and tools provided on the platform are strictly for:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2"><span className="text-yellow-400">•</span> Educational purposes</li>
                        <li className="flex gap-2"><span className="text-yellow-400">•</span> Informational purposes</li>
                      </ul>
                      <p className="font-bold text-white">We are NOT SEBI-registered investment advisors.</p>
                      <p>Nothing on this platform should be considered:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2"><span className="text-red-400">✗</span> Financial advice</li>
                        <li className="flex gap-2"><span className="text-red-400">✗</span> Investment recommendation</li>
                        <li className="flex gap-2"><span className="text-red-400">✗</span> Trading guarantee</li>
                      </ul>
                    </div>
                  </section>

                  {/* 5. USER RESPONSIBILITY */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">5. USER RESPONSIBILITY</h2>
                    <p className="mb-3">You acknowledge and agree that:</p>
                    <ul className="space-y-2 ml-6">
                      <li className="flex gap-2"><span className="text-blue-400">•</span> You are fully responsible for your trading decisions</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> You understand market risks</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> You accept all profit and loss outcomes</li>
                    </ul>
                    <p className="mt-3 mb-2">You are solely responsible for:</p>
                    <ul className="space-y-2 ml-6">
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Connecting your broker account</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Executing trades (manual or automated)</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Monitoring positions</li>
                    </ul>
                  </section>

                  {/* 6. RISK DISCLOSURE */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3 flex items-center gap-2">
                      <Shield className="size-5 text-red-400" />
                      6. RISK DISCLOSURE
                    </h2>
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 space-y-3">
                      <p className="font-bold text-white">Trading in financial markets involves significant risk, including:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2"><span className="text-red-400">•</span> Loss of capital</li>
                        <li className="flex gap-2"><span className="text-red-400">•</span> Volatility risk</li>
                        <li className="flex gap-2"><span className="text-red-400">•</span> Execution delays</li>
                        <li className="flex gap-2"><span className="text-red-400">•</span> System errors</li>
                      </ul>
                      <p className="font-bold text-red-400 text-lg mt-3">You may lose your entire investment.</p>
                      <p className="mt-3">IndexPilotAI does NOT guarantee:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2"><span className="text-red-400">✗</span> Profit</li>
                        <li className="flex gap-2"><span className="text-red-400">✗</span> Accuracy of signals</li>
                        <li className="flex gap-2"><span className="text-red-400">✗</span> Continuous performance</li>
                      </ul>
                    </div>
                  </section>

                  {/* 7. THIRD-PARTY INTEGRATIONS */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">7. THIRD-PARTY INTEGRATIONS</h2>
                    <p className="mb-2">Our platform may integrate with third-party services such as:</p>
                    <ul className="space-y-2 ml-6 mb-3">
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Broker APIs</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Trading platforms</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Data providers</li>
                    </ul>
                    <p className="mb-2">We are NOT responsible for:</p>
                    <ul className="space-y-2 ml-6">
                      <li className="flex gap-2"><span className="text-red-400">✗</span> Broker failures</li>
                      <li className="flex gap-2"><span className="text-red-400">✗</span> API downtime</li>
                      <li className="flex gap-2"><span className="text-red-400">✗</span> Incorrect executions by brokers</li>
                    </ul>
                    <p className="mt-3 font-semibold">All such services are used at your own risk.</p>
                  </section>

                  {/* 8. ORDER EXECUTION DISCLAIMER */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">8. ORDER EXECUTION DISCLAIMER</h2>
                    <ul className="space-y-2 ml-6 mb-3">
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Orders are executed via third-party broker APIs</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> We do not control order execution timing or price</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Slippage, delays, or rejection may occur</li>
                    </ul>
                    <p className="mb-2">IndexPilotAI is NOT responsible for:</p>
                    <ul className="space-y-2 ml-6">
                      <li className="flex gap-2"><span className="text-red-400">✗</span> Order failures</li>
                      <li className="flex gap-2"><span className="text-red-400">✗</span> Incorrect trades</li>
                      <li className="flex gap-2"><span className="text-red-400">✗</span> Network or API issues</li>
                    </ul>
                  </section>

                  {/* 9. STATIC IP & API USAGE */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">9. STATIC IP & API USAGE</h2>
                    <p className="mb-2">Users acknowledge:</p>
                    <ul className="space-y-2 ml-6 mb-3">
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Trading APIs may require static IP configuration</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Compliance with broker and SEBI rules is the user's responsibility</li>
                    </ul>
                    <p className="mb-2">IndexPilotAI is not liable for:</p>
                    <ul className="space-y-2 ml-6">
                      <li className="flex gap-2"><span className="text-red-400">✗</span> API restrictions</li>
                      <li className="flex gap-2"><span className="text-red-400">✗</span> Broker limitations</li>
                      <li className="flex gap-2"><span className="text-red-400">✗</span> Regulatory violations</li>
                    </ul>
                  </section>

                  {/* 10. ACCOUNT SECURITY */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">10. ACCOUNT SECURITY</h2>
                    <p className="mb-2">You are responsible for:</p>
                    <ul className="space-y-2 ml-6 mb-3">
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Keeping login credentials secure</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Protecting API keys and secrets</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Preventing unauthorized access</li>
                    </ul>
                    <p className="mb-2">We are not liable for losses due to:</p>
                    <ul className="space-y-2 ml-6">
                      <li className="flex gap-2"><span className="text-red-400">✗</span> Account hacking</li>
                      <li className="flex gap-2"><span className="text-red-400">✗</span> Credential sharing</li>
                      <li className="flex gap-2"><span className="text-red-400">✗</span> Unauthorized usage</li>
                    </ul>
                  </section>

                  {/* 11. PROHIBITED ACTIVITIES */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">11. PROHIBITED ACTIVITIES</h2>
                    <p className="mb-2">Users must NOT:</p>
                    <ul className="space-y-2 ml-6">
                      <li className="flex gap-2"><span className="text-red-400">✗</span> Attempt to hack or disrupt the platform</li>
                      <li className="flex gap-2"><span className="text-red-400">✗</span> Use the platform for illegal trading</li>
                      <li className="flex gap-2"><span className="text-red-400">✗</span> Share or resell access without permission</li>
                      <li className="flex gap-2"><span className="text-red-400">✗</span> Reverse engineer the system</li>
                    </ul>
                    <p className="mt-3 font-bold text-red-400">Violation may result in immediate termination.</p>
                  </section>

                  {/* 12. SUBSCRIPTION & PAYMENTS */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">12. SUBSCRIPTION & PAYMENTS</h2>
                    <ul className="space-y-2 ml-6">
                      <li className="flex gap-2"><span className="text-blue-400">•</span> All payments are final and non-refundable</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Services are provided on a subscription basis (if applicable)</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Failure to renew may result in service interruption</li>
                    </ul>
                  </section>

                  {/* 13. SERVICE AVAILABILITY */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">13. SERVICE AVAILABILITY</h2>
                    <p className="mb-2">We do not guarantee:</p>
                    <ul className="space-y-2 ml-6 mb-3">
                      <li className="flex gap-2"><span className="text-yellow-400">•</span> 100% uptime</li>
                      <li className="flex gap-2"><span className="text-yellow-400">•</span> Error-free operation</li>
                      <li className="flex gap-2"><span className="text-yellow-400">•</span> Continuous availability</li>
                    </ul>
                    <p className="mb-2">Downtime may occur due to:</p>
                    <ul className="space-y-2 ml-6">
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Maintenance</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Technical issues</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Server failures</li>
                    </ul>
                  </section>

                  {/* 14. LIMITATION OF LIABILITY */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">14. LIMITATION OF LIABILITY</h2>
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                      <p className="mb-2">To the maximum extent permitted by law, IndexPilotAI shall NOT be liable for:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2"><span className="text-red-400">✗</span> Any financial losses</li>
                        <li className="flex gap-2"><span className="text-red-400">✗</span> Loss of profits or capital</li>
                        <li className="flex gap-2"><span className="text-red-400">✗</span> Trading errors</li>
                        <li className="flex gap-2"><span className="text-red-400">✗</span> Missed opportunities</li>
                        <li className="flex gap-2"><span className="text-red-400">✗</span> System failures</li>
                      </ul>
                      <p className="mt-3 font-bold text-white">Your use of the platform is entirely at your own risk.</p>
                    </div>
                  </section>

                  {/* 15-20 Additional Sections */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">15. INDEMNIFICATION</h2>
                    <p>You agree to indemnify and hold harmless IndexPilotAI from any claims, damages, or losses arising from:</p>
                    <ul className="space-y-2 ml-6 mt-2">
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Your trading activity</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Misuse of the platform</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Violation of these Terms</li>
                    </ul>
                  </section>

                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">16. INTELLECTUAL PROPERTY</h2>
                    <p className="mb-2">All content, software, and branding on the platform are owned by IndexPilotAI.</p>
                    <p className="mb-2">You may NOT:</p>
                    <ul className="space-y-2 ml-6">
                      <li className="flex gap-2"><span className="text-red-400">✗</span> Copy</li>
                      <li className="flex gap-2"><span className="text-red-400">✗</span> Modify</li>
                      <li className="flex gap-2"><span className="text-red-400">✗</span> Distribute</li>
                      <li className="flex gap-2"><span className="text-red-400">✗</span> Reuse</li>
                    </ul>
                    <p className="mt-2">without written permission.</p>
                  </section>

                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">17. TERMINATION</h2>
                    <p className="mb-2">We reserve the right to:</p>
                    <ul className="space-y-2 ml-6">
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Suspend or terminate accounts</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Restrict access</li>
                    </ul>
                    <p className="mt-2">for violations of these Terms or suspicious activity.</p>
                  </section>

                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">18. MODIFICATIONS TO TERMS</h2>
                    <p>We may update these Terms at any time.</p>
                    <p className="mt-2">Continued use of the platform means you accept the updated Terms.</p>
                  </section>

                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">19. GOVERNING LAW</h2>
                    <p>These Terms are governed by the laws of India.</p>
                    <p className="mt-2">Any disputes shall be subject to the jurisdiction of Indian courts.</p>
                  </section>

                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">20. CONTACT</h2>
                    <p className="mb-2">For any questions:</p>
                    <ul className="space-y-2 ml-6">
                      <li className="flex gap-2">
                        <span className="text-blue-400">•</span>
                        <span>Email: <a href="mailto:support@indexpilotai.com" className="text-blue-400 hover:underline">support@indexpilotai.com</a></span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-blue-400">•</span>
                        <span>Website: <a href="https://indexpilotai.com" className="text-blue-400 hover:underline">https://indexpilotai.com</a></span>
                      </li>
                    </ul>
                  </section>

                  {/* FINAL ACKNOWLEDGMENT */}
                  <section className="bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/30 rounded-lg p-6 mt-6">
                    <h2 className="text-2xl font-bold text-white mb-3">FINAL ACKNOWLEDGMENT</h2>
                    <p className="mb-3">By using IndexPilotAI, you confirm that:</p>
                    <ul className="space-y-2 ml-6">
                      <li className="flex gap-2"><span className="text-green-400">✓</span> You understand trading risks</li>
                      <li className="flex gap-2"><span className="text-green-400">✓</span> You accept full responsibility</li>
                      <li className="flex gap-2"><span className="text-green-400">✓</span> You agree to all terms</li>
                    </ul>
                    <p className="mt-4 font-bold text-red-400 text-lg">Use the platform at your own risk.</p>
                  </section>

                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}