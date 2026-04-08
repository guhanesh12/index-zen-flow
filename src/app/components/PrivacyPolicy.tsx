import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { Shield, Eye, Lock, Database, UserX, Share2, Globe, Mail, ArrowLeft, FileText, AlertTriangle } from 'lucide-react';
import { SEO } from '../utils/seo';
import { useNavigate } from 'react-router';
import { Button } from './ui/button';
const logoColor = "/logo-color.png";

export function PrivacyPolicy() {
  const navigate = useNavigate();
  
  return (
    <>
      <SEO
        title="Privacy Policy - IndexPilotAI"
        description="Learn how IndexPilotAI collects, uses, and protects your personal data. Our privacy policy covers data collection, security, cookies, and user rights."
        keywords="privacy policy, data protection, user privacy, data security, GDPR, IndexPilotAI privacy"
        canonical="/privacy"
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
                <Lock className="size-8 text-green-400" />
                <CardTitle className="text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
                  Privacy Policy
                </CardTitle>
              </div>
              <p className="text-sm text-slate-400">Last Updated: 01/04/2026</p>
            </CardHeader>

            <CardContent className="p-6">
              <ScrollArea className="h-[70vh] pr-4">
                <div className="space-y-6 text-slate-300">
                  
                  {/* Introduction */}
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                    <p className="leading-relaxed">
                      This Privacy Policy describes how <span className="font-semibold text-green-400">IndexPilotAI</span> (https://indexpilotai.com) 
                      collects, uses, and protects your personal data when you use our platform.
                    </p>
                    <p className="mt-3 leading-relaxed font-semibold">
                      By accessing or using our services, you agree to this Privacy Policy.
                    </p>
                  </div>

                  {/* 1. INTRODUCTION */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3 flex items-center gap-2">
                      <FileText className="size-5 text-green-400" />
                      1. INTRODUCTION
                    </h2>
                    <p>
                      IndexPilotAI is an algorithmic trading platform that provides tools, automation, and integrations 
                      with third-party brokers. We are committed to protecting your privacy and ensuring transparency 
                      in how your data is handled.
                    </p>
                  </section>

                  {/* 2. INFORMATION WE COLLECT */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3 flex items-center gap-2">
                      <Database className="size-5 text-blue-400" />
                      2. INFORMATION WE COLLECT
                    </h2>
                    <p className="mb-3">We may collect the following types of information:</p>

                    <div className="space-y-4">
                      {/* 2.1 Personal Information */}
                      <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                        <h3 className="text-lg font-bold text-white mb-2">2.1 Personal Information</h3>
                        <ul className="space-y-2 ml-6">
                          <li className="flex gap-2"><span className="text-blue-400">•</span> Full name</li>
                          <li className="flex gap-2"><span className="text-blue-400">•</span> Email address</li>
                          <li className="flex gap-2"><span className="text-blue-400">•</span> Phone number</li>
                        </ul>
                      </div>

                      {/* 2.2 Account Information */}
                      <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                        <h3 className="text-lg font-bold text-white mb-2">2.2 Account Information</h3>
                        <ul className="space-y-2 ml-6">
                          <li className="flex gap-2"><span className="text-purple-400">•</span> Login credentials</li>
                          <li className="flex gap-2"><span className="text-purple-400">•</span> User preferences</li>
                          <li className="flex gap-2"><span className="text-purple-400">•</span> Account settings</li>
                        </ul>
                      </div>

                      {/* 2.3 Trading & Technical Data */}
                      <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                        <h3 className="text-lg font-bold text-white mb-2">2.3 Trading & Technical Data</h3>
                        <ul className="space-y-2 ml-6">
                          <li className="flex gap-2"><span className="text-cyan-400">•</span> Trading activity logs</li>
                          <li className="flex gap-2"><span className="text-cyan-400">•</span> Strategy configurations</li>
                          <li className="flex gap-2"><span className="text-cyan-400">•</span> API connection details (encrypted)</li>
                          <li className="flex gap-2"><span className="text-cyan-400">•</span> Broker integration data</li>
                        </ul>
                      </div>

                      {/* 2.4 Device & Usage Data */}
                      <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                        <h3 className="text-lg font-bold text-white mb-2">2.4 Device & Usage Data</h3>
                        <ul className="space-y-2 ml-6">
                          <li className="flex gap-2"><span className="text-yellow-400">•</span> IP address</li>
                          <li className="flex gap-2"><span className="text-yellow-400">•</span> Browser type</li>
                          <li className="flex gap-2"><span className="text-yellow-400">•</span> Device information</li>
                          <li className="flex gap-2"><span className="text-yellow-400">•</span> Log files and access timestamps</li>
                        </ul>
                      </div>
                    </div>
                  </section>

                  {/* 3. HOW WE USE YOUR INFORMATION */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3 flex items-center gap-2">
                      <Eye className="size-5 text-purple-400" />
                      3. HOW WE USE YOUR INFORMATION
                    </h2>
                    <p className="mb-2">We use your data to:</p>
                    <ul className="space-y-2 ml-6">
                      <li className="flex gap-2"><span className="text-green-400">✓</span> Provide and operate our services</li>
                      <li className="flex gap-2"><span className="text-green-400">✓</span> Enable trading automation and integrations</li>
                      <li className="flex gap-2"><span className="text-green-400">✓</span> Improve platform performance</li>
                      <li className="flex gap-2"><span className="text-green-400">✓</span> Send updates, alerts, and notifications</li>
                      <li className="flex gap-2"><span className="text-green-400">✓</span> Ensure security and prevent fraud</li>
                    </ul>
                  </section>

                  {/* 4. DATA SECURITY */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3 flex items-center gap-2">
                      <Shield className="size-5 text-green-400" />
                      4. DATA SECURITY
                    </h2>
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 space-y-3">
                      <p>We implement industry-standard security measures, including:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2"><span className="text-green-400">✓</span> Encryption of sensitive data</li>
                        <li className="flex gap-2"><span className="text-green-400">✓</span> Secure servers and firewalls</li>
                        <li className="flex gap-2"><span className="text-green-400">✓</span> Access control mechanisms</li>
                      </ul>
                      <p className="mt-3 font-semibold text-yellow-300">
                        However, no system is completely secure. You use the platform at your own risk.
                      </p>
                    </div>
                  </section>

                  {/* 5. DATA STORAGE */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">5. DATA STORAGE</h2>
                    <ul className="space-y-2 ml-6">
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Your data may be stored on cloud servers or VPS infrastructure</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Data retention depends on operational and legal requirements</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> We may retain logs for audit and compliance purposes</li>
                    </ul>
                  </section>

                  {/* 6. THIRD-PARTY SERVICES */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">6. THIRD-PARTY SERVICES</h2>
                    <p className="mb-2">We may use third-party services such as:</p>
                    <ul className="space-y-2 ml-6 mb-3">
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Broker APIs (Dhan, Alice Blue, IIFL, etc.)</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Hosting providers</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Analytics tools</li>
                    </ul>

                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mt-3">
                      <p className="mb-2 font-semibold">We are NOT responsible for:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2"><span className="text-red-400">✗</span> Their data handling practices</li>
                        <li className="flex gap-2"><span className="text-red-400">✗</span> Their privacy policies</li>
                      </ul>
                      <p className="mt-3 font-semibold">Users should review third-party policies separately.</p>
                    </div>
                  </section>

                  {/* 7. NO DATA SELLING */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">7. NO DATA SELLING</h2>
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                      <p className="font-bold text-green-400 text-lg">
                        We do NOT sell, rent, or trade your personal data to third parties.
                      </p>
                    </div>
                  </section>

                  {/* 8. DATA SHARING */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">8. DATA SHARING</h2>
                    <p className="mb-2">We may share data only in the following cases:</p>
                    <ul className="space-y-2 ml-6">
                      <li className="flex gap-2"><span className="text-blue-400">•</span> With brokers (only when you connect your account)</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> To comply with legal obligations</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> To protect our platform from fraud or misuse</li>
                    </ul>
                  </section>

                  {/* 9. USER RESPONSIBILITIES */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3 flex items-center gap-2">
                      <AlertTriangle className="size-5 text-yellow-400" />
                      9. USER RESPONSIBILITIES
                    </h2>
                    <p className="mb-2">You are responsible for:</p>
                    <ul className="space-y-2 ml-6 mb-3">
                      <li className="flex gap-2"><span className="text-yellow-400">•</span> Keeping your login credentials secure</li>
                      <li className="flex gap-2"><span className="text-yellow-400">•</span> Protecting API keys and broker access</li>
                      <li className="flex gap-2"><span className="text-yellow-400">•</span> Avoiding unauthorized sharing of your account</li>
                    </ul>
                    <p className="font-semibold text-red-400">
                      We are not liable for breaches caused by user negligence.
                    </p>
                  </section>

                  {/* 10. COOKIES & TRACKING */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">10. COOKIES & TRACKING</h2>
                    <p className="mb-2">We may use cookies and tracking technologies to:</p>
                    <ul className="space-y-2 ml-6 mb-3">
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Improve user experience</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Analyze traffic</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Store preferences</li>
                    </ul>
                    <p className="text-slate-400 italic">
                      You can disable cookies through your browser settings.
                    </p>
                  </section>

                  {/* 11. YOUR RIGHTS */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">11. YOUR RIGHTS</h2>
                    <p className="mb-2">You may:</p>
                    <ul className="space-y-2 ml-6 mb-3">
                      <li className="flex gap-2"><span className="text-green-400">✓</span> Request access to your data</li>
                      <li className="flex gap-2"><span className="text-green-400">✓</span> Request correction of incorrect data</li>
                      <li className="flex gap-2"><span className="text-green-400">✓</span> Request deletion of your account</li>
                    </ul>
                    <p className="font-semibold">Requests can be sent to our support email.</p>
                  </section>

                  {/* 12. CHILDREN'S PRIVACY */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">12. CHILDREN'S PRIVACY</h2>
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                      <p>
                        Our services are <span className="font-bold text-white">not intended for individuals under 18 years of age</span>. 
                        We do not knowingly collect data from minors.
                      </p>
                    </div>
                  </section>

                  {/* 13. REGULATORY COMPLIANCE */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">13. REGULATORY COMPLIANCE</h2>
                    <p className="mb-2">Users are responsible for complying with:</p>
                    <ul className="space-y-2 ml-6">
                      <li className="flex gap-2"><span className="text-blue-400">•</span> SEBI regulations</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Broker-specific policies</li>
                      <li className="flex gap-2"><span className="text-blue-400">•</span> Applicable financial laws</li>
                    </ul>
                    <p className="mt-3 font-semibold">
                      IndexPilotAI does not assume regulatory responsibility for user activity.
                    </p>
                  </section>

                  {/* 14. LIMITATION OF LIABILITY */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">14. LIMITATION OF LIABILITY</h2>
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                      <p className="mb-2">We are not responsible for:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2"><span className="text-red-400">✗</span> Data breaches caused by external attacks</li>
                        <li className="flex gap-2"><span className="text-red-400">✗</span> Broker system failures</li>
                        <li className="flex gap-2"><span className="text-red-400">✗</span> API misuse by users</li>
                      </ul>
                      <p className="mt-3 font-bold text-white">Use the platform at your own risk.</p>
                    </div>
                  </section>

                  {/* 15. CHANGES TO THIS POLICY */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">15. CHANGES TO THIS POLICY</h2>
                    <p>We may update this Privacy Policy at any time.</p>
                    <p className="mt-2 font-semibold">
                      Continued use of the platform means acceptance of the updated policy.
                    </p>
                  </section>

                  {/* 16. CONTACT US */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">16. CONTACT US</h2>
                    <p className="mb-2">For any privacy-related questions:</p>
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

                  {/* FINAL CONSENT */}
                  <section className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-lg p-6 mt-6">
                    <h2 className="text-2xl font-bold text-white mb-3">FINAL CONSENT</h2>
                    <p className="mb-3">By using IndexPilotAI, you confirm that:</p>
                    <ul className="space-y-2 ml-6">
                      <li className="flex gap-2"><span className="text-green-400">✓</span> You understand how your data is used</li>
                      <li className="flex gap-2"><span className="text-green-400">✓</span> You accept this Privacy Policy</li>
                      <li className="flex gap-2"><span className="text-green-400">✓</span> You use the platform at your own risk</li>
                    </ul>
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