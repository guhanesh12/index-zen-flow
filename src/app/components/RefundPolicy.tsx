// @ts-nocheck
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { DollarSign, AlertTriangle, Clock, Wallet, RefreshCw, FileText, ArrowLeft } from 'lucide-react';
import { SEO } from '../utils/seo';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
const logoColor = "/logo-color.png";

export function RefundPolicy() {
  const navigate = useNavigate();
  
  return (
    <>
      <SEO
        title="Refund Policy - IndexPilotAI"
        description="Learn about IndexPilotAI's wallet-based refund policy, 60-day inactivity auto-refund rules, and payment terms for our algorithmic trading platform."
        keywords="refund policy, wallet system, payment terms, no refund policy, IndexPilotAI refunds"
        canonical="/refund-policy"
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
                <DollarSign className="size-8 text-emerald-400" />
                <CardTitle className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent">
                  Refund Policy
                </CardTitle>
              </div>
              <p className="text-sm text-slate-400">Last Updated: 01/04/2026</p>
            </CardHeader>

            <CardContent className="p-6">
              <ScrollArea className="h-[70vh] pr-4">
                <div className="space-y-6 text-slate-300">
                  
                  {/* Introduction */}
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                    <p className="leading-relaxed">
                      This Refund Policy applies to all payments made on <span className="font-semibold text-emerald-400">IndexPilotAI</span> (https://indexpilotai.com).
                    </p>
                    <p className="mt-3 leading-relaxed font-semibold">
                      By using our platform and making any payment, you agree to this Refund Policy.
                    </p>
                  </div>

                  {/* 1. GENERAL POLICY */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3 flex items-center gap-2">
                      <FileText className="size-5 text-emerald-400" />
                      1. GENERAL POLICY
                    </h2>
                    <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                      <p className="mb-3">
                        IndexPilotAI operates on a <span className="font-bold text-emerald-400">prepaid wallet / recharge-based system</span>.
                      </p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2">
                          <span className="text-emerald-400">•</span>
                          <span>Users must add funds to their wallet before using services</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-emerald-400">•</span>
                          <span>All payments are considered advance usage credits</span>
                        </li>
                      </ul>
                    </div>
                  </section>

                  {/* 2. NO DIRECT REFUNDS */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3 flex items-center gap-2">
                      <AlertTriangle className="size-5 text-red-400" />
                      2. NO DIRECT REFUNDS
                    </h2>
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 space-y-3">
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2">
                          <span className="text-red-400">✗</span>
                          <span>All payments made are <span className="font-bold text-white">non-refundable to bank account / UPI / card</span></span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-red-400">✗</span>
                          <span>Once funds are added, they cannot be withdrawn as cash</span>
                        </li>
                      </ul>
                      <p className="mt-4 font-bold text-red-400 text-lg">
                        ⚠️ NO BANK REFUNDS WILL BE PROCESSED
                      </p>
                    </div>
                  </section>

                  {/* 3. WALLET USAGE */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3 flex items-center gap-2">
                      <Wallet className="size-5 text-purple-400" />
                      3. WALLET USAGE
                    </h2>
                    <ul className="space-y-2 ml-6">
                      <li className="flex gap-2">
                        <span className="text-purple-400">•</span>
                        <span>Wallet balance can be used only for platform services</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-purple-400">•</span>
                        <span>It is the user's responsibility to utilize the wallet balance</span>
                      </li>
                    </ul>
                  </section>

                  {/* 4. 60-DAY INACTIVITY AUTO REFUND */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3 flex items-center gap-2">
                      <Clock className="size-5 text-cyan-400" />
                      4. 60-DAY INACTIVITY AUTO REFUND
                    </h2>
                    
                    <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-5 space-y-4">
                      <div>
                        <p className="font-semibold text-white mb-2">If a user does NOT use the platform:</p>
                        <ul className="space-y-2 ml-6">
                          <li className="flex gap-2">
                            <span className="text-cyan-400">•</span>
                            <span>For a continuous period of <span className="font-bold text-white">60 days</span>, and</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-cyan-400">•</span>
                            <span>No trading / service activity is detected</span>
                          </li>
                        </ul>
                      </div>

                      <div>
                        <p className="font-semibold text-white mb-2">Then:</p>
                        <ul className="space-y-2 ml-6">
                          <li className="flex gap-2">
                            <span className="text-green-400">✓</span>
                            <span>The remaining wallet balance will be <span className="font-bold text-white">automatically adjusted / refunded internally</span></span>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-green-400">✓</span>
                            <span>The refund will be processed to the <span className="font-bold text-white">user's IndexPilotAI wallet only</span></span>
                          </li>
                        </ul>
                      </div>

                      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                        <p className="font-semibold text-yellow-300 mb-2">This means:</p>
                        <ul className="space-y-2 ml-6">
                          <li className="flex gap-2">
                            <span className="text-yellow-400">•</span>
                            <span>No external payout will be made</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-yellow-400">•</span>
                            <span>Amount remains within the platform ecosystem</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </section>

                  {/* 5. INACTIVITY CONDITIONS */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">5. INACTIVITY CONDITIONS</h2>
                    <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                      <p className="mb-3">Inactivity includes:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2">
                          <span className="text-blue-400">•</span>
                          <span>No login activity</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-blue-400">•</span>
                          <span>No trading activity</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-blue-400">•</span>
                          <span>No API usage</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-blue-400">•</span>
                          <span>No subscription usage</span>
                        </li>
                      </ul>
                      <div className="mt-4 bg-yellow-500/10 border border-yellow-500/30 rounded p-3">
                        <p className="font-semibold text-yellow-300">
                          ⚠️ If any activity is detected, the 60-day period resets.
                        </p>
                      </div>
                    </div>
                  </section>

                  {/* 6. DUPLICATE PAYMENT */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3 flex items-center gap-2">
                      <RefreshCw className="size-5 text-orange-400" />
                      6. DUPLICATE PAYMENT
                    </h2>
                    <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4 space-y-3">
                      <p>In case of duplicate transactions:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2">
                          <span className="text-orange-400">•</span>
                          <span>Users must contact support within <span className="font-bold text-white">48 hours</span></span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-orange-400">•</span>
                          <span>After verification, the amount may be credited to wallet</span>
                        </li>
                      </ul>
                      <p className="mt-3 font-bold text-red-400">
                        No bank refunds will be processed.
                      </p>
                    </div>
                  </section>

                  {/* 7. USER RESPONSIBILITY */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3 flex items-center gap-2">
                      <AlertTriangle className="size-5 text-yellow-400" />
                      7. USER RESPONSIBILITY
                    </h2>
                    <p className="mb-2">Users must:</p>
                    <ul className="space-y-2 ml-6">
                      <li className="flex gap-2">
                        <span className="text-yellow-400">•</span>
                        <span>Understand platform functionality before recharge</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-yellow-400">•</span>
                        <span>Use funds within a reasonable time</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-yellow-400">•</span>
                        <span>Monitor their wallet balance</span>
                      </li>
                    </ul>
                  </section>

                  {/* 8. SYSTEM LIMITATIONS */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">8. SYSTEM LIMITATIONS</h2>
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                      <p className="mb-2">IndexPilotAI is not responsible for:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2">
                          <span className="text-red-400">✗</span>
                          <span>Unused wallet balance</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-red-400">✗</span>
                          <span>Loss due to misunderstanding of services</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-red-400">✗</span>
                          <span>Failure to use platform features</span>
                        </li>
                      </ul>
                    </div>
                  </section>

                  {/* 9. MODIFICATION OF POLICY */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">9. MODIFICATION OF POLICY</h2>
                    <p>We reserve the right to update this Refund Policy at any time.</p>
                  </section>

                  {/* 10. CONTACT */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-3">10. CONTACT</h2>
                    <p className="mb-2">For refund-related queries:</p>
                    <ul className="space-y-2 ml-6">
                      <li className="flex gap-2">
                        <span className="text-emerald-400">•</span>
                        <span>Email: <a href="mailto:support@indexpilotai.com" className="text-emerald-400 hover:underline">support@indexpilotai.com</a></span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-emerald-400">•</span>
                        <span>Website: <a href="https://indexpilotai.com" className="text-emerald-400 hover:underline">https://indexpilotai.com</a></span>
                      </li>
                    </ul>
                  </section>

                  {/* FINAL ACKNOWLEDGMENT */}
                  <section className="bg-gradient-to-r from-emerald-500/10 to-green-500/10 border border-emerald-500/30 rounded-lg p-6 mt-6">
                    <h2 className="text-2xl font-bold text-white mb-3">FINAL ACKNOWLEDGMENT</h2>
                    <p className="mb-3">By making a payment on IndexPilotAI, you confirm that:</p>
                    <ul className="space-y-2 ml-6">
                      <li className="flex gap-2">
                        <span className="text-green-400">✓</span>
                        <span>You understand this is a wallet-based system</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-green-400">✓</span>
                        <span>You accept no bank refund policy</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-green-400">✓</span>
                        <span>You agree to 60-day inactivity rules</span>
                      </li>
                    </ul>
                    <p className="mt-4 font-bold text-yellow-400 text-lg">
                      Use the platform at your own risk.
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