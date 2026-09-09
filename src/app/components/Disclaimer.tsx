// @ts-nocheck
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { AlertTriangle, ShieldAlert, TrendingDown, Scale, Info, Target, ArrowLeft, UserX, Server, FileText } from 'lucide-react';
import { SEO } from '../utils/seo';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
const logoColor = "/logo-color.png";

export function Disclaimer() {
  const navigate = useNavigate();
  
  return (
    <>
      <SEO
        title="Disclaimer - IndexPilotAI"
        description="Important disclaimers and risk warnings for IndexPilotAI algorithmic trading platform. Trading involves high risk. No profit guarantees. Not SEBI registered."
        keywords="trading disclaimer, risk warning, no profit guarantee, investment risk, algorithmic trading risk"
        canonical="/disclaimer"
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
                <AlertTriangle className="size-8 text-red-400" />
                <CardTitle className="text-3xl font-bold bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">
                  Disclaimer
                </CardTitle>
              </div>
              <p className="text-sm text-slate-400">Last Updated: 01/04/2026</p>
            </CardHeader>

            <CardContent className="p-6">
              <ScrollArea className="h-[70vh] pr-4">
                <div className="space-y-6 text-slate-300">
                  
                  {/* Introduction */}
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                    <p className="leading-relaxed">
                      This Disclaimer applies to <span className="font-semibold text-red-400">IndexPilotAI</span> (https://indexpilotai.com) 
                      and all services, tools, features, and content provided through the platform.
                    </p>
                    <p className="mt-3 leading-relaxed font-semibold">
                      By accessing or using this platform, you agree to this Disclaimer.
                    </p>
                  </div>

                  {/* 1. NO INVESTMENT ADVICE */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3 flex items-center gap-2">
                      <UserX className="size-5 text-red-400" />
                      1. NO INVESTMENT ADVICE
                    </h2>
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 space-y-3">
                      <p className="font-semibold text-white">IndexPilotAI does NOT provide:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2">
                          <span className="text-red-400">✗</span>
                          <span>Investment advice</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-red-400">✗</span>
                          <span>Financial recommendations</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-red-400">✗</span>
                          <span>Portfolio management services</span>
                        </li>
                      </ul>

                      <div className="mt-4 bg-blue-500/10 border border-blue-500/30 rounded p-3">
                        <p className="mb-2">All tools, strategies, signals, and data provided are strictly for:</p>
                        <ul className="space-y-2 ml-6">
                          <li className="flex gap-2">
                            <span className="text-blue-400">•</span>
                            <span>Educational purposes</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-blue-400">•</span>
                            <span>Informational purposes</span>
                          </li>
                        </ul>
                      </div>

                      <p className="mt-4 font-bold text-red-400 text-lg">
                        ⚠️ We are NOT registered with SEBI as an investment advisor.
                      </p>
                    </div>
                  </section>

                  {/* 2. HIGH RISK WARNING */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3 flex items-center gap-2">
                      <TrendingDown className="size-5 text-orange-400" />
                      2. HIGH RISK WARNING
                    </h2>
                    <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4 space-y-3">
                      <p className="font-bold text-orange-400 text-lg">
                        ⚠️ Trading in financial markets involves substantial risk.
                      </p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2">
                          <span className="text-orange-400">•</span>
                          <span>You may lose partial or entire capital</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-orange-400">•</span>
                          <span>Market conditions can change rapidly</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-orange-400">•</span>
                          <span>Past performance does not guarantee future results</span>
                        </li>
                      </ul>
                      <p className="mt-4 font-bold text-white text-lg">
                        You should trade only with money you can afford to lose.
                      </p>
                    </div>
                  </section>

                  {/* 3. NO PROFIT GUARANTEE */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3 flex items-center gap-2">
                      <ShieldAlert className="size-5 text-red-400" />
                      3. NO PROFIT GUARANTEE
                    </h2>
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 space-y-3">
                      <p className="font-semibold text-white">IndexPilotAI does NOT guarantee:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2">
                          <span className="text-red-400">✗</span>
                          <span>Profits</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-red-400">✗</span>
                          <span>Accuracy of signals</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-red-400">✗</span>
                          <span>Success of strategies</span>
                        </li>
                      </ul>
                      <p className="mt-3 font-semibold">
                        All trading outcomes depend on market conditions and user actions.
                      </p>
                    </div>
                  </section>

                  {/* 4. USER RESPONSIBILITY */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3 flex items-center gap-2">
                      <AlertTriangle className="size-5 text-yellow-400" />
                      4. USER RESPONSIBILITY
                    </h2>
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 space-y-3">
                      <p className="mb-2">You are <span className="font-bold text-white">solely responsible</span> for:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2">
                          <span className="text-yellow-400">•</span>
                          <span>Your trading decisions</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-yellow-400">•</span>
                          <span>Broker account activity</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-yellow-400">•</span>
                          <span>Profit and loss</span>
                        </li>
                      </ul>
                      <p className="mt-4 font-bold text-white">
                        All trades executed using the platform are done at your own risk.
                      </p>
                    </div>
                  </section>

                  {/* 5. ALGORITHMIC TRADING RISKS */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3 flex items-center gap-2">
                      <Server className="size-5 text-cyan-400" />
                      5. ALGORITHMIC TRADING RISKS
                    </h2>
                    <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4 space-y-3">
                      <p className="mb-2">Our platform provides automation tools, which may involve:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2">
                          <span className="text-cyan-400">•</span>
                          <span>System delays</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-cyan-400">•</span>
                          <span>Execution errors</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-cyan-400">•</span>
                          <span>Incorrect signals</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-cyan-400">•</span>
                          <span>Network failures</span>
                        </li>
                      </ul>
                      <p className="mt-4 font-bold text-orange-400">
                        Automated trading does not eliminate risk and may increase losses in volatile conditions.
                      </p>
                    </div>
                  </section>

                  {/* 6. THIRD-PARTY BROKER DISCLAIMER */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">6. THIRD-PARTY BROKER DISCLAIMER</h2>
                    <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700 space-y-4">
                      <p>IndexPilotAI integrates with third-party brokers such as:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2">
                          <span className="text-blue-400">•</span>
                          <span>Dhan</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-blue-400">•</span>
                          <span>Alice Blue</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-blue-400">•</span>
                          <span>IIFL</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-blue-400">•</span>
                          <span>Others</span>
                        </li>
                      </ul>

                      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3">
                        <p className="mb-2 font-semibold">We do NOT control:</p>
                        <ul className="space-y-2 ml-6">
                          <li className="flex gap-2">
                            <span className="text-yellow-400">•</span>
                            <span>Order execution</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-yellow-400">•</span>
                            <span>Pricing</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-yellow-400">•</span>
                            <span>Broker systems</span>
                          </li>
                        </ul>
                      </div>

                      <div className="bg-red-500/10 border border-red-500/30 rounded p-3">
                        <p className="mb-2 font-semibold">We are NOT responsible for:</p>
                        <ul className="space-y-2 ml-6">
                          <li className="flex gap-2">
                            <span className="text-red-400">✗</span>
                            <span>Order rejection</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-red-400">✗</span>
                            <span>Slippage</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-red-400">✗</span>
                            <span>Broker downtime</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </section>

                  {/* 7. API & STATIC IP USAGE */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">7. API & STATIC IP USAGE</h2>
                    <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4 space-y-3">
                      <p className="mb-2">Users are responsible for:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2">
                          <span className="text-purple-400">•</span>
                          <span>Configuring API access correctly</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-purple-400">•</span>
                          <span>Using static IP if required by broker</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-purple-400">•</span>
                          <span>Following broker and SEBI guidelines</span>
                        </li>
                      </ul>

                      <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded p-3">
                        <p className="mb-2 font-semibold">IndexPilotAI is not liable for:</p>
                        <ul className="space-y-2 ml-6">
                          <li className="flex gap-2">
                            <span className="text-red-400">✗</span>
                            <span>API failures</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-red-400">✗</span>
                            <span>Access restrictions</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-red-400">✗</span>
                            <span>Regulatory violations</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </section>

                  {/* 8. TECHNICAL RISKS */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">8. TECHNICAL RISKS</h2>
                    <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                      <p className="mb-2">The platform may experience:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2">
                          <span className="text-orange-400">•</span>
                          <span>Server downtime</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-orange-400">•</span>
                          <span>Software bugs</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-orange-400">•</span>
                          <span>Connectivity issues</span>
                        </li>
                      </ul>
                      <p className="mt-3 font-semibold">
                        We do not guarantee uninterrupted or error-free service.
                      </p>
                    </div>
                  </section>

                  {/* 9. NO LIABILITY */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3 flex items-center gap-2">
                      <ShieldAlert className="size-5 text-red-400" />
                      9. NO LIABILITY
                    </h2>
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 space-y-3">
                      <p className="font-semibold text-white">
                        To the fullest extent permitted by law, IndexPilotAI shall NOT be liable for:
                      </p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2">
                          <span className="text-red-400">✗</span>
                          <span>Any financial loss</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-red-400">✗</span>
                          <span>Loss of capital or profits</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-red-400">✗</span>
                          <span>Trading errors or missed trades</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-red-400">✗</span>
                          <span>System or network failures</span>
                        </li>
                      </ul>
                      <p className="mt-4 font-bold text-red-400 text-lg">
                        ⚠️ Your use of the platform is entirely at your own risk.
                      </p>
                    </div>
                  </section>

                  {/* 10. REGULATORY COMPLIANCE */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">10. REGULATORY COMPLIANCE</h2>
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                      <p className="mb-2">Users must ensure compliance with:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2">
                          <span className="text-blue-400">•</span>
                          <span>SEBI regulations</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-blue-400">•</span>
                          <span>Broker-specific rules</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-blue-400">•</span>
                          <span>Applicable financial laws</span>
                        </li>
                      </ul>
                      <p className="mt-3 font-semibold">
                        IndexPilotAI does not take responsibility for user compliance.
                      </p>
                    </div>
                  </section>

                  {/* 11. EDUCATIONAL PURPOSE ONLY */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3 flex items-center gap-2">
                      <FileText className="size-5 text-green-400" />
                      11. EDUCATIONAL PURPOSE ONLY
                    </h2>
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                      <p className="mb-2">All content, including:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2">
                          <span className="text-green-400">•</span>
                          <span>Strategies</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-green-400">•</span>
                          <span>Signals</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-green-400">•</span>
                          <span>Data</span>
                        </li>
                      </ul>
                      <p className="mt-3 font-semibold text-white">
                        is provided for learning and informational purposes only.
                      </p>
                    </div>
                  </section>

                  {/* 12. CONSENT */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">12. CONSENT</h2>
                    <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                      <p className="mb-2">By using IndexPilotAI, you confirm that:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2">
                          <span className="text-cyan-400">✓</span>
                          <span>You understand trading risks</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-cyan-400">✓</span>
                          <span>You accept full responsibility</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-cyan-400">✓</span>
                          <span>You agree to this Disclaimer</span>
                        </li>
                      </ul>
                    </div>
                  </section>

                  {/* 13. CONTACT */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">13. CONTACT</h2>
                    <p className="mb-2">For any questions:</p>
                    <ul className="space-y-2 ml-6">
                      <li className="flex gap-2">
                        <span className="text-cyan-400">•</span>
                        <span>Email: <a href="mailto:support@indexpilotai.com" className="text-cyan-400 hover:underline">support@indexpilotai.com</a></span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-cyan-400">•</span>
                        <span>Website: <a href="https://indexpilotai.com" className="text-cyan-400 hover:underline">https://indexpilotai.com</a></span>
                      </li>
                    </ul>
                  </section>

                  {/* FINAL NOTICE */}
                  <section className="bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/30 rounded-lg p-6 mt-6">
                    <h2 className="text-2xl font-bold text-white mb-3">FINAL NOTICE</h2>
                    <p className="font-bold text-red-400 text-xl">
                      ⚠️ Use IndexPilotAI at your own risk.
                    </p>
                    <p className="mt-3 font-bold text-white text-lg">
                      No liability shall be attached to the company for any losses incurred.
                    </p>
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