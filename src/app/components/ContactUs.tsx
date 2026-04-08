import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { Mail, Clock, Wrench, AlertTriangle, Shield, Briefcase, MessageCircle, Globe, ArrowLeft } from 'lucide-react';
import { SEO } from '../utils/seo';
import { useNavigate } from 'react-router';
import { Button } from './ui/button';
const logoColor = "/logo-color.png";

export function ContactUs() {
  const navigate = useNavigate();
  
  return (
    <>
      <SEO
        title="Contact Us - IndexPilotAI"
        description="Get in touch with IndexPilotAI support team. Technical support for platform issues, account help, and broker API connections. Available Monday to Saturday, 9 AM - 6 PM IST."
        keywords="contact IndexPilotAI, customer support, technical support, help desk, platform support, trading support"
        canonical="/contact"
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
                <Mail className="size-8 text-cyan-400" />
                <CardTitle className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                  Contact Us
                </CardTitle>
              </div>
              <p className="text-slate-300 text-lg">We are here to assist you with any questions, technical issues, or support related to our platform.</p>
            </CardHeader>

            <CardContent className="p-6">
              <ScrollArea className="h-[70vh] pr-4">
                <div className="space-y-6 text-slate-300">
                  
                  {/* Introduction */}
                  <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-lg p-5">
                    <p className="leading-relaxed text-center">
                      <span className="font-semibold text-cyan-400">IndexPilotAI</span> (https://indexpilotai.com)
                    </p>
                  </div>

                  {/* SUPPORT CONTACT */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                      <Mail className="size-6 text-cyan-400" />
                      📧 SUPPORT CONTACT
                    </h2>
                    <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-6">
                      <p className="mb-4 text-lg">If you need help, please reach out to us:</p>
                      <div className="space-y-3 bg-slate-900/50 rounded-lg p-4 border border-cyan-400/30">
                        <div>
                          <p className="font-semibold text-white text-lg">Email:</p>
                          <a 
                            href="mailto:support@indexpilotai.com" 
                            className="text-cyan-400 hover:underline text-lg"
                          >
                            support@indexpilotai.com
                          </a>
                        </div>
                        <div className="pt-2 border-t border-slate-700">
                          <p className="font-semibold text-white text-lg">Website:</p>
                          <a 
                            href="https://indexpilotai.com" 
                            className="text-cyan-400 hover:underline text-lg"
                          >
                            https://indexpilotai.com
                          </a>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* SUPPORT HOURS */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                      <Clock className="size-6 text-green-400" />
                      🕒 SUPPORT HOURS
                    </h2>
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6">
                      <p className="mb-4">Our support team is available:</p>
                      <div className="bg-slate-900/50 rounded-lg p-5 border border-green-400/30 text-center">
                        <p className="text-xl font-bold text-white mb-2">Monday to Saturday</p>
                        <p className="text-2xl font-bold text-green-400">09:00 AM – 06:00 PM (IST)</p>
                      </div>
                      <div className="mt-4 bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                        <p className="text-center">
                          We aim to respond to all queries within <span className="font-bold text-blue-400">24 to 48 hours</span>.
                        </p>
                      </div>
                    </div>
                  </section>

                  {/* TECHNICAL SUPPORT */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                      <Wrench className="size-6 text-orange-400" />
                      🛠 TECHNICAL SUPPORT
                    </h2>
                    <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-5 space-y-4">
                      <p>For issues related to:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2">
                          <span className="text-orange-400">•</span>
                          <span>Account login problems</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-orange-400">•</span>
                          <span>Broker API connection</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-orange-400">•</span>
                          <span>Order execution issues</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-orange-400">•</span>
                          <span>Platform errors or bugs</span>
                        </li>
                      </ul>

                      <div className="mt-4 pt-4 border-t border-orange-500/30">
                        <p className="font-semibold text-white mb-3">Please email us with detailed information, including:</p>
                        <ul className="space-y-2 ml-6">
                          <li className="flex gap-2">
                            <span className="text-cyan-400">✓</span>
                            <span>Your registered email ID</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-cyan-400">✓</span>
                            <span>Description of the issue</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-cyan-400">✓</span>
                            <span>Screenshots (if applicable)</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </section>

                  {/* IMPORTANT NOTICE */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                      <AlertTriangle className="size-6 text-red-400" />
                      ⚠️ IMPORTANT NOTICE
                    </h2>
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-5 space-y-4">
                      <p className="font-bold text-white text-lg">
                        IndexPilotAI provides <span className="text-red-400">technical platform support only</span>.
                      </p>

                      <div className="bg-slate-900/50 rounded-lg p-4 border border-red-400/30">
                        <p className="font-semibold text-white mb-2">We do NOT provide:</p>
                        <ul className="space-y-2 ml-6">
                          <li className="flex gap-2">
                            <span className="text-red-400">✗</span>
                            <span>Trading advice</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-red-400">✗</span>
                            <span>Investment recommendations</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-red-400">✗</span>
                            <span>Profit guarantees</span>
                          </li>
                        </ul>
                      </div>

                      <p className="mt-4 font-bold text-white">
                        All trading-related decisions are the responsibility of the user.
                      </p>
                    </div>
                  </section>

                  {/* SECURITY NOTICE */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                      <Shield className="size-6 text-yellow-400" />
                      🔐 SECURITY NOTICE
                    </h2>
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-5">
                      <ul className="space-y-3">
                        <li className="flex gap-3 items-start">
                          <span className="text-yellow-400 text-xl">⚠️</span>
                          <div>
                            <p className="font-semibold text-white">Do NOT share your login credentials</p>
                            <p className="text-sm text-slate-400">Keep your username and password private</p>
                          </div>
                        </li>
                        <li className="flex gap-3 items-start">
                          <span className="text-yellow-400 text-xl">⚠️</span>
                          <div>
                            <p className="font-semibold text-white">Do NOT share API keys via email</p>
                            <p className="text-sm text-slate-400">API keys should remain confidential</p>
                          </div>
                        </li>
                        <li className="flex gap-3 items-start">
                          <span className="text-yellow-400 text-xl">⚠️</span>
                          <div>
                            <p className="font-semibold text-white">Our team will never ask for your password</p>
                            <p className="text-sm text-slate-400">Legitimate support never requires passwords</p>
                          </div>
                        </li>
                      </ul>
                    </div>
                  </section>

                  {/* BUSINESS & PARTNERSHIP */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                      <Briefcase className="size-6 text-purple-400" />
                      📩 BUSINESS & PARTNERSHIP
                    </h2>
                    <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-5">
                      <p className="mb-3">For business inquiries or partnerships:</p>
                      <div className="bg-slate-900/50 rounded-lg p-4 border border-purple-400/30">
                        <p className="font-semibold text-white">Email:</p>
                        <a 
                          href="mailto:support@indexpilotai.com" 
                          className="text-purple-400 hover:underline text-lg"
                        >
                          support@indexpilotai.com
                        </a>
                      </div>
                    </div>
                  </section>

                  {/* RESPONSE POLICY */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                      <MessageCircle className="size-6 text-blue-400" />
                      📢 RESPONSE POLICY
                    </h2>
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-5">
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2">
                          <span className="text-blue-400">•</span>
                          <span>Queries are handled on a priority basis</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-blue-400">•</span>
                          <span>Delays may occur during high-volume periods</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-blue-400">•</span>
                          <span>Support is limited to platform-related issues only</span>
                        </li>
                      </ul>
                    </div>
                  </section>

                  {/* STAY CONNECTED */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                      <Globe className="size-6 text-cyan-400" />
                      🌐 STAY CONNECTED
                    </h2>
                    <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-5 text-center">
                      <p className="mb-3">Visit our website regularly for updates:</p>
                      <a 
                        href="https://indexpilotai.com" 
                        className="text-cyan-400 hover:underline text-xl font-semibold"
                      >
                        https://indexpilotai.com
                      </a>
                    </div>
                  </section>

                  {/* FOOTER */}
                  <div className="text-center py-6 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-lg">
                    <p className="text-xl font-bold text-white mb-2">IndexPilotAI Support Team</p>
                    <p className="text-slate-300 italic">Helping you trade smarter with technology.</p>
                  </div>

                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}