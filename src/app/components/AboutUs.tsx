// @ts-nocheck
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { Building2, Target, Eye, Award, ShieldCheck, Users, TrendingUp, Lightbulb, ArrowLeft } from 'lucide-react';
import { SEO } from '../utils/seo';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
const logoColor = "/logo-color.png";

export function AboutUs() {
  const navigate = useNavigate();
  
  return (
    <>
      <SEO
        title="About Us - IndexPilotAI"
        description="Learn about IndexPilotAI - a modern algorithmic trading platform providing automated trading tools, broker integrations, and real-time monitoring for Indian stock markets."
        keywords="about IndexPilotAI, algorithmic trading platform, automated trading, broker integration, trading technology"
        canonical="/about"
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
                <Building2 className="size-8 text-cyan-400" />
                <CardTitle className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                  About Us
                </CardTitle>
              </div>
              <p className="text-slate-300 text-lg italic">Powering Smart Trading with Technology</p>
            </CardHeader>

            <CardContent className="p-6">
              <ScrollArea className="h-[70vh] pr-4">
                <div className="space-y-6 text-slate-300">
                  
                  {/* Introduction */}
                  <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-lg p-5">
                    <h2 className="text-xl font-bold text-white mb-3">Welcome to IndexPilotAI</h2>
                    <p className="leading-relaxed">
                      <span className="font-semibold text-cyan-400">IndexPilotAI</span> (https://indexpilotai.com) is a modern 
                      algorithmic trading platform designed to simplify, automate, and enhance the trading experience for individuals 
                      in the financial markets.
                    </p>
                  </div>

                  {/* WHO WE ARE */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                      <Users className="size-6 text-blue-400" />
                      WHO WE ARE
                    </h2>
                    <div className="bg-slate-900/50 rounded-lg p-5 border border-slate-700 space-y-3">
                      <p>IndexPilotAI is a technology-driven platform focused on providing:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2">
                          <span className="text-blue-400">•</span>
                          <span>Algorithmic trading tools</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-blue-400">•</span>
                          <span>Strategy-based automation</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-blue-400">•</span>
                          <span>Real-time trade monitoring</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-blue-400">•</span>
                          <span>Broker API integrations</span>
                        </li>
                      </ul>
                      <p className="mt-4 font-semibold text-white">
                        Our goal is to empower traders with advanced tools while keeping full control in the hands of the user.
                      </p>
                    </div>
                  </section>

                  {/* WHAT WE DO */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                      <TrendingUp className="size-6 text-green-400" />
                      WHAT WE DO
                    </h2>
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-5 space-y-4">
                      <p>We provide a system that allows users to:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2">
                          <span className="text-green-400">✓</span>
                          <span>Connect their broker accounts securely</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-green-400">✓</span>
                          <span>Execute trades using automated strategies</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-green-400">✓</span>
                          <span>Receive and act on trading signals</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-green-400">✓</span>
                          <span>Monitor performance through dashboards</span>
                        </li>
                      </ul>

                      <div className="mt-4 pt-4 border-t border-green-500/30">
                        <p className="mb-2 font-semibold">Our platform is built to support seamless integration with brokers such as:</p>
                        <div className="grid grid-cols-2 gap-3 ml-6">
                          <div className="flex gap-2">
                            <span className="text-cyan-400">•</span>
                            <span>Dhan</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-cyan-400">•</span>
                            <span>Alice Blue</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-cyan-400">•</span>
                            <span>IIFL</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-cyan-400">•</span>
                            <span>Other supported APIs</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* OUR VISION */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                      <Eye className="size-6 text-purple-400" />
                      OUR VISION
                    </h2>
                    <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-5">
                      <p className="mb-3">Our vision is to make algorithmic trading:</p>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-slate-900/50 rounded-lg p-4 border border-purple-400/30 text-center">
                          <p className="text-xl font-bold text-purple-400">Simple</p>
                        </div>
                        <div className="bg-slate-900/50 rounded-lg p-4 border border-purple-400/30 text-center">
                          <p className="text-xl font-bold text-purple-400">Accessible</p>
                        </div>
                        <div className="bg-slate-900/50 rounded-lg p-4 border border-purple-400/30 text-center">
                          <p className="text-xl font-bold text-purple-400">Efficient</p>
                        </div>
                      </div>
                      <p className="mt-4 text-center font-semibold">
                        for every trader, regardless of their experience level.
                      </p>
                    </div>
                  </section>

                  {/* OUR MISSION */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                      <Target className="size-6 text-orange-400" />
                      OUR MISSION
                    </h2>
                    <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-5">
                      <p className="mb-3">We aim to:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2">
                          <span className="text-orange-400">•</span>
                          <span>Provide reliable trading infrastructure</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-orange-400">•</span>
                          <span>Deliver high-speed execution support</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-orange-400">•</span>
                          <span>Build user-friendly tools for automation</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-orange-400">•</span>
                          <span>Continuously improve technology for better performance</span>
                        </li>
                      </ul>
                    </div>
                  </section>

                  {/* IMPORTANT NOTICE */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                      <ShieldCheck className="size-6 text-red-400" />
                      IMPORTANT NOTICE
                    </h2>
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-5 space-y-4">
                      <div>
                        <p className="font-bold text-white mb-2">IndexPilotAI is NOT:</p>
                        <ul className="space-y-2 ml-6">
                          <li className="flex gap-2">
                            <span className="text-red-400">✗</span>
                            <span>A stock broker</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-red-400">✗</span>
                            <span>A financial advisor</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-red-400">✗</span>
                            <span>A SEBI-registered investment advisor</span>
                          </li>
                        </ul>
                      </div>

                      <div className="pt-3 border-t border-red-500/30">
                        <p className="font-bold text-white mb-2">We do NOT:</p>
                        <ul className="space-y-2 ml-6">
                          <li className="flex gap-2">
                            <span className="text-red-400">✗</span>
                            <span>Manage user funds</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-red-400">✗</span>
                            <span>Guarantee profits</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-red-400">✗</span>
                            <span>Provide investment recommendations</span>
                          </li>
                        </ul>
                      </div>

                      <p className="mt-4 font-bold text-white text-lg pt-3 border-t border-red-500/30">
                        We only provide technology and tools. All trading decisions are made by users at their own risk.
                      </p>
                    </div>
                  </section>

                  {/* WHY CHOOSE INDEXPILOTAI */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                      <Award className="size-6 text-yellow-400" />
                      WHY CHOOSE INDEXPILOTAI
                    </h2>
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-5">
                      <ul className="space-y-3">
                        <li className="flex gap-3 items-start">
                          <span className="text-yellow-400 text-xl">✓</span>
                          <div>
                            <p className="font-semibold text-white">Advanced automation tools</p>
                            <p className="text-sm text-slate-400">Powerful algorithms for smart trading</p>
                          </div>
                        </li>
                        <li className="flex gap-3 items-start">
                          <span className="text-yellow-400 text-xl">✓</span>
                          <div>
                            <p className="font-semibold text-white">Broker integration support</p>
                            <p className="text-sm text-slate-400">Seamless connection with major brokers</p>
                          </div>
                        </li>
                        <li className="flex gap-3 items-start">
                          <span className="text-yellow-400 text-xl">✓</span>
                          <div>
                            <p className="font-semibold text-white">Real-time monitoring</p>
                            <p className="text-sm text-slate-400">Track your trades as they happen</p>
                          </div>
                        </li>
                        <li className="flex gap-3 items-start">
                          <span className="text-yellow-400 text-xl">✓</span>
                          <div>
                            <p className="font-semibold text-white">Secure and scalable infrastructure</p>
                            <p className="text-sm text-slate-400">Built on reliable technology</p>
                          </div>
                        </li>
                        <li className="flex gap-3 items-start">
                          <span className="text-yellow-400 text-xl">✓</span>
                          <div>
                            <p className="font-semibold text-white">User-controlled trading environment</p>
                            <p className="text-sm text-slate-400">You maintain full control at all times</p>
                          </div>
                        </li>
                      </ul>
                    </div>
                  </section>

                  {/* USER RESPONSIBILITY */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                      <ShieldCheck className="size-6 text-cyan-400" />
                      USER RESPONSIBILITY
                    </h2>
                    <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-5">
                      <p className="mb-3">Users are fully responsible for:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2">
                          <span className="text-cyan-400">•</span>
                          <span>Their trading strategies</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-cyan-400">•</span>
                          <span>Risk management</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-cyan-400">•</span>
                          <span>Profit and loss outcomes</span>
                        </li>
                      </ul>
                      <p className="mt-4 font-semibold text-white">
                        Trading involves risk, and users should trade responsibly.
                      </p>
                    </div>
                  </section>

                  {/* OUR COMMITMENT */}
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                      <Lightbulb className="size-6 text-green-400" />
                      OUR COMMITMENT
                    </h2>
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-5">
                      <p className="mb-3">We are committed to:</p>
                      <ul className="space-y-2 ml-6">
                        <li className="flex gap-2">
                          <span className="text-green-400">✓</span>
                          <span>Providing a stable and secure platform</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-green-400">✓</span>
                          <span>Ensuring transparency in our services</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-green-400">✓</span>
                          <span>Continuously upgrading our system</span>
                        </li>
                      </ul>
                    </div>
                  </section>

                  {/* CONTACT US */}
                  <section className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-lg p-6">
                    <h2 className="text-2xl font-bold text-white mb-4">CONTACT US</h2>
                    <ul className="space-y-2">
                      <li className="flex gap-2">
                        <span className="text-cyan-400">•</span>
                        <span>Website: <a href="https://indexpilotai.com" className="text-cyan-400 hover:underline">https://indexpilotai.com</a></span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-cyan-400">•</span>
                        <span>Email: <a href="mailto:support@indexpilotai.com" className="text-cyan-400 hover:underline">support@indexpilotai.com</a></span>
                      </li>
                    </ul>
                  </section>

                  {/* TAGLINE */}
                  <div className="text-center py-4">
                    <p className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                      IndexPilotAI – Powering Smart Trading with Technology
                    </p>
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