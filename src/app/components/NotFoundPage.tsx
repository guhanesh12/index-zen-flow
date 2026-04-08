// @ts-nocheck
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';
import { SEO, SEO_CONFIGS } from '../utils/seo';

export default function NotFoundPage() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Check if this is a static file request - if so, don't show 404
  const isStaticFile = location.pathname.match(/\.(xml|txt|json|ico|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot|html)$/i);
  
  if (isStaticFile) {
    // Don't render anything for static files - let the server handle it
    return null;
  }
  
  return (
    <>
      <SEO {...SEO_CONFIGS.notFound} />
      
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full text-center">
          {/* Animated 404 */}
          <div className="mb-8">
            <h1 className="text-9xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 animate-pulse">
              404
            </h1>
          </div>
          
          {/* Error Message */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-white mb-4">
              Page Not Found
            </h2>
            <p className="text-gray-400 text-lg mb-2">
              The page you're looking for doesn't exist or has been moved.
            </p>
            <p className="text-gray-500 text-sm font-mono">
              {location.pathname}
            </p>
          </div>
          
          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-all duration-200 transform hover:scale-105"
            >
              <ArrowLeft className="w-5 h-5" />
              Go Back
            </button>
            
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg transition-all duration-200 transform hover:scale-105 shadow-lg shadow-cyan-500/20"
            >
              <Home className="w-5 h-5" />
              Back to Home
            </button>
          </div>
          
          {/* Decorative Elements */}
          <div className="mt-16 flex justify-center gap-8 opacity-20">
            <div className="w-16 h-16 border-4 border-cyan-500 rounded-full animate-ping"></div>
            <div className="w-16 h-16 border-4 border-blue-500 rounded-full animate-ping" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-16 h-16 border-4 border-purple-500 rounded-full animate-ping" style={{ animationDelay: '0.4s' }}></div>
          </div>
        </div>
      </div>
    </>
  );
}