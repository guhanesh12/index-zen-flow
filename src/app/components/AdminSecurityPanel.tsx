// @ts-nocheck
/**
 * 🔒 ADMIN SECURITY CONTROL PANEL
 * 
 * Bank-grade security management for IndexpilotAI
 * - Console log management
 * - Data encryption status
 * - Security threat detection
 * - Session management
 */

import React, { useState, useEffect } from 'react';
import { Shield, Eye, EyeOff, Terminal, Clock, AlertTriangle, CheckCircle, XCircle, Lock, Unlock, RefreshCw } from 'lucide-react';
import consoleManager from '@/utils-ext/security/ConsoleManager';
import { detectSecurityThreats, isSecureContext, clearAllSensitiveData } from '@/utils-ext/security/DataEncryption';

export function AdminSecurityPanel() {
  const [consoleEnabled, setConsoleEnabled] = useState(true);
  const [autoClearEnabled, setAutoClearEnabled] = useState(false);
  const [autoClearInterval, setAutoClearInterval] = useState(1000);
  const [sanitizationEnabled, setSanitizationEnabled] = useState(true);
  const [securityThreats, setSecurityThreats] = useState<string[]>([]);
  const [isSecure, setIsSecure] = useState(true);

  useEffect(() => {
    // Load initial config
    const config = consoleManager.getConfig();
    setConsoleEnabled(config.enabled);
    setAutoClearEnabled(config.autoClear);
    setAutoClearInterval(config.autoClearInterval);
    setSanitizationEnabled(config.sanitizeData);

    // Check security threats
    checkSecurityStatus();
  }, []);

  const checkSecurityStatus = () => {
    const threats = detectSecurityThreats();
    setSecurityThreats(threats.threats);
    setIsSecure(threats.safe && isSecureContext());
  };

  const handleToggleConsole = () => {
    if (consoleEnabled) {
      consoleManager.disable();
      setConsoleEnabled(false);
    } else {
      consoleManager.enable();
      setConsoleEnabled(true);
    }
  };

  const handleToggleAutoClear = () => {
    if (autoClearEnabled) {
      consoleManager.disableAutoClear();
      setAutoClearEnabled(false);
    } else {
      consoleManager.enableAutoClear(autoClearInterval);
      setAutoClearEnabled(true);
    }
  };

  const handleIntervalChange = (newInterval: number) => {
    setAutoClearInterval(newInterval);
    if (autoClearEnabled) {
      consoleManager.enableAutoClear(newInterval);
    }
  };

  const handleToggleSanitization = () => {
    if (sanitizationEnabled) {
      consoleManager.disableSanitization();
      setSanitizationEnabled(false);
    } else {
      consoleManager.enableSanitization();
      setSanitizationEnabled(true);
    }
  };

  const handleClearConsole = () => {
    consoleManager.clear();
  };

  const handleClearAllData = () => {
    if (confirm('⚠️ WARNING: This will clear ALL sensitive data including sessions, storage, and cookies. You will be logged out. Continue?')) {
      clearAllSensitiveData();
      window.location.href = '/';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-cyan-400" />
            Security Control Panel
          </h2>
          <p className="text-gray-400 mt-1">Bank-grade security management</p>
        </div>
        
        {/* Security Status Badge */}
        <div className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
          isSecure 
            ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
            : 'bg-red-500/20 text-red-400 border border-red-500/30'
        }`}>
          {isSecure ? (
            <>
              <CheckCircle className="w-5 h-5" />
              <span className="font-semibold">SECURE</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-5 h-5" />
              <span className="font-semibold">THREATS DETECTED</span>
            </>
          )}
        </div>
      </div>

      {/* Security Threats */}
      {securityThreats.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-red-400 font-semibold mb-2">Security Threats Detected</h3>
              <ul className="space-y-1">
                {securityThreats.map((threat, index) => (
                  <li key={index} className="text-red-300 text-sm">• {threat}</li>
                ))}
              </ul>
            </div>
            <button
              onClick={checkSecurityStatus}
              className="text-red-400 hover:text-red-300 transition-colors"
              title="Re-check security"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Console Log Management */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
        <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <Terminal className="w-5 h-5 text-purple-400" />
          Console Log Management
        </h3>

        <div className="space-y-4">
          {/* Enable/Disable Console */}
          <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                {consoleEnabled ? (
                  <Eye className="w-4 h-4 text-green-400" />
                ) : (
                  <EyeOff className="w-4 h-4 text-red-400" />
                )}
                <span className="text-white font-semibold">Console Logs</span>
              </div>
              <p className="text-gray-400 text-sm">
                {consoleEnabled ? 'Console logs are visible' : 'All console logs are hidden'}
              </p>
            </div>
            <button
              onClick={handleToggleConsole}
              className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                consoleEnabled
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
                  : 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
              }`}
            >
              {consoleEnabled ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>

          {/* Data Sanitization */}
          <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                {sanitizationEnabled ? (
                  <Lock className="w-4 h-4 text-cyan-400" />
                ) : (
                  <Unlock className="w-4 h-4 text-yellow-400" />
                )}
                <span className="text-white font-semibold">Data Sanitization</span>
              </div>
              <p className="text-gray-400 text-sm">
                {sanitizationEnabled 
                  ? 'Sensitive data (passwords, tokens) is masked in logs' 
                  : '⚠️ WARNING: Sensitive data is visible in logs'}
              </p>
            </div>
            <button
              onClick={handleToggleSanitization}
              className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                sanitizationEnabled
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30'
                  : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30'
              }`}
            >
              {sanitizationEnabled ? 'PROTECTED' : 'EXPOSED'}
            </button>
          </div>

          {/* Auto-Clear Console */}
          <div className="p-4 bg-gray-800/50 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <span className="text-white font-semibold">Auto-Clear Console</span>
                </div>
                <p className="text-gray-400 text-sm">
                  {autoClearEnabled 
                    ? `Console clears every ${autoClearInterval / 1000} second(s)` 
                    : 'Console remains visible'}
                </p>
              </div>
              <button
                onClick={handleToggleAutoClear}
                className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                  autoClearEnabled
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30'
                    : 'bg-gray-700 text-gray-400 border border-gray-600 hover:bg-gray-600'
                }`}
              >
                {autoClearEnabled ? 'ACTIVE' : 'INACTIVE'}
              </button>
            </div>

            {/* Interval Selector */}
            {autoClearEnabled && (
              <div className="mt-3 pt-3 border-t border-gray-700">
                <label className="text-gray-300 text-sm mb-2 block">Clear Interval</label>
                <div className="grid grid-cols-4 gap-2">
                  {[1000, 2000, 5000, 10000].map((interval) => (
                    <button
                      key={interval}
                      onClick={() => handleIntervalChange(interval)}
                      className={`py-2 px-3 rounded text-sm font-semibold transition-all ${
                        autoClearInterval === interval
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {interval / 1000}s
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Clear Console Button */}
          <button
            onClick={handleClearConsole}
            className="w-full py-3 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-lg font-semibold hover:bg-purple-500/30 transition-all flex items-center justify-center gap-2"
          >
            <Terminal className="w-4 h-4" />
            Clear Console Now
          </button>
        </div>
      </div>

      {/* Emergency Controls */}
      <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-6">
        <h3 className="text-xl font-semibold text-red-400 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Emergency Security Controls
        </h3>

        <div className="space-y-3">
          <div className="bg-red-500/10 rounded-lg p-4">
            <p className="text-red-300 text-sm mb-3">
              <strong>⚠️ WARNING:</strong> This will immediately clear all sensitive data, terminate all sessions, 
              and log out all users. Use only in case of security breach.
            </p>
            <button
              onClick={handleClearAllData}
              className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-2"
            >
              <XCircle className="w-5 h-5" />
              EMERGENCY: Clear All Sensitive Data
            </button>
          </div>
        </div>
      </div>

      {/* Security Guidelines */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
        <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-cyan-400" />
          Security Best Practices
        </h3>
        
        <div className="space-y-2 text-gray-300 text-sm">
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
            <span>Console logs are automatically sanitized to hide passwords, tokens, and secrets</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
            <span>Enable auto-clear in production to prevent log accumulation</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
            <span>All sensitive data in localStorage/sessionStorage is obfuscated</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
            <span>Admin sessions expire automatically for security</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
            <span>All API communications use JWT tokens with expiration</span>
          </div>
        </div>
      </div>

      {/* Security Status Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-white mb-1">
            {isSecureContext() ? '✓' : '✗'}
          </div>
          <div className="text-sm text-gray-400">HTTPS Connection</div>
        </div>
        
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-white mb-1">
            {sanitizationEnabled ? '✓' : '✗'}
          </div>
          <div className="text-sm text-gray-400">Data Sanitization</div>
        </div>
        
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-white mb-1">
            {securityThreats.length === 0 ? '✓' : securityThreats.length}
          </div>
          <div className="text-sm text-gray-400">Security Threats</div>
        </div>
      </div>
    </div>
  );
}

export default AdminSecurityPanel;
