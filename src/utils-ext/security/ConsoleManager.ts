// @ts-nocheck
/**
 * 🔒 BANK-GRADE CONSOLE LOG MANAGER
 * 
 * Features:
 * - Enable/Disable console logs globally
 * - Auto-clear console every N seconds
 * - Sanitize sensitive data before logging
 * - Production-ready security
 */

export interface ConsoleManagerConfig {
  enabled: boolean;
  autoClear: boolean;
  autoClearInterval: number; // milliseconds
  sanitizeData: boolean;
}

class ConsoleLogManager {
  private config: ConsoleManagerConfig = {
    enabled: true, // Default: enabled for development
    autoClear: false, // Default: disabled
    autoClearInterval: 1000, // Default: 1 second
    sanitizeData: true, // Default: always sanitize
  };

  private intervalId: any = null;
  private originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug,
  };

  // Sensitive keywords to detect and sanitize
  private sensitiveKeywords = [
    'password',
    'token',
    'secret',
    'apikey',
    'api_key',
    'accesstoken',
    'access_token',
    'refreshtoken',
    'refresh_token',
    'jwt',
    'bearer',
    'authorization',
    'auth',
    'credential',
    'key',
    'private',
    'session',
  ];

  constructor() {
    this.loadConfig();
    this.initialize();
  }

  /**
   * Load configuration from localStorage
   */
  private loadConfig() {
    try {
      const stored = localStorage.getItem('security_console_config');
      if (stored) {
        this.config = { ...this.config, ...JSON.parse(stored) };
      }
    } catch (error) {
      // Silent fail - use defaults
    }
  }

  /**
   * Save configuration to localStorage
   */
  private saveConfig() {
    try {
      localStorage.setItem('security_console_config', JSON.stringify(this.config));
    } catch (error) {
      // Silent fail
    }
  }

  /**
   * Initialize console interceptor
   */
  private initialize() {
    this.interceptConsole();
    if (this.config.autoClear) {
      this.startAutoClear();
    }
  }

  /**
   * Intercept all console methods
   */
  private interceptConsole() {
    const self = this;

    console.log = function (...args: any[]) {
      if (self.config.enabled) {
        const sanitized = self.config.sanitizeData ? self.sanitizeArgs(args) : args;
        self.originalConsole.log.apply(console, sanitized);
      }
    };

    console.warn = function (...args: any[]) {
      if (self.config.enabled) {
        const sanitized = self.config.sanitizeData ? self.sanitizeArgs(args) : args;
        self.originalConsole.warn.apply(console, sanitized);
      }
    };

    console.error = function (...args: any[]) {
      if (self.config.enabled) {
        const sanitized = self.config.sanitizeData ? self.sanitizeArgs(args) : args;
        self.originalConsole.error.apply(console, sanitized);
      }
    };

    console.info = function (...args: any[]) {
      if (self.config.enabled) {
        const sanitized = self.config.sanitizeData ? self.sanitizeArgs(args) : args;
        self.originalConsole.info.apply(console, sanitized);
      }
    };

    console.debug = function (...args: any[]) {
      if (self.config.enabled) {
        const sanitized = self.config.sanitizeData ? self.sanitizeArgs(args) : args;
        self.originalConsole.debug.apply(console, sanitized);
      }
    };
  }

  /**
   * Sanitize arguments to remove sensitive data
   */
  private sanitizeArgs(args: any[]): any[] {
    return args.map(arg => this.sanitizeValue(arg));
  }

  /**
   * Sanitize a single value (recursive for objects/arrays)
   */
  private sanitizeValue(value: any): any {
    // Null/undefined - return as is
    if (value === null || value === undefined) {
      return value;
    }

    // String - check for sensitive keywords
    if (typeof value === 'string') {
      return this.sanitizeString(value);
    }

    // Number/Boolean - return as is
    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    // Array - sanitize each element
    if (Array.isArray(value)) {
      return value.map(item => this.sanitizeValue(item));
    }

    // Object - sanitize each property
    if (typeof value === 'object') {
      const sanitized: any = {};
      for (const key in value) {
        if (value.hasOwnProperty(key)) {
          if (this.isSensitiveKey(key)) {
            // Mask sensitive values
            sanitized[key] = this.maskValue(value[key]);
          } else {
            // Recursively sanitize nested objects
            sanitized[key] = this.sanitizeValue(value[key]);
          }
        }
      }
      return sanitized;
    }

    return value;
  }

  /**
   * Check if a key name is sensitive
   */
  private isSensitiveKey(key: string): boolean {
    const lowerKey = key.toLowerCase();
    return this.sensitiveKeywords.some(keyword => lowerKey.includes(keyword));
  }

  /**
   * Mask a sensitive value
   */
  private maskValue(value: any): string {
    if (value === null || value === undefined) return '***';
    
    const str = String(value);
    if (str.length <= 4) {
      return '***';
    }
    
    // Show first 4 chars, mask the rest
    return `${str.substring(0, 4)}${'*'.repeat(Math.min(str.length - 4, 12))}`;
  }

  /**
   * Sanitize a string value
   */
  private sanitizeString(str: string): string {
    // Check if string looks like a token/key (long alphanumeric)
    if (str.length > 20 && /^[a-zA-Z0-9-_.]+$/.test(str)) {
      return this.maskValue(str);
    }
    return str;
  }

  /**
   * Start auto-clear interval
   */
  private startAutoClear() {
    this.stopAutoClear();
    this.intervalId = setInterval(() => {
      if (this.config.autoClear && this.config.enabled) {
        console.clear();
      }
    }, this.config.autoClearInterval);
  }

  /**
   * Stop auto-clear interval
   */
  private stopAutoClear() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * PUBLIC API: Enable console logs
   */
  public enable() {
    this.config.enabled = true;
    this.saveConfig();
  }

  /**
   * PUBLIC API: Disable console logs
   */
  public disable() {
    this.config.enabled = false;
    this.saveConfig();
    console.clear();
  }

  /**
   * PUBLIC API: Check if enabled
   */
  public isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * PUBLIC API: Enable auto-clear
   */
  public enableAutoClear(interval?: number) {
    this.config.autoClear = true;
    if (interval) {
      this.config.autoClearInterval = interval;
    }
    this.saveConfig();
    this.startAutoClear();
  }

  /**
   * PUBLIC API: Disable auto-clear
   */
  public disableAutoClear() {
    this.config.autoClear = false;
    this.saveConfig();
    this.stopAutoClear();
  }

  /**
   * PUBLIC API: Check if auto-clear is enabled
   */
  public isAutoClearEnabled(): boolean {
    return this.config.autoClear;
  }

  /**
   * PUBLIC API: Get auto-clear interval
   */
  public getAutoClearInterval(): number {
    return this.config.autoClearInterval;
  }

  /**
   * PUBLIC API: Enable data sanitization
   */
  public enableSanitization() {
    this.config.sanitizeData = true;
    this.saveConfig();
  }

  /**
   * PUBLIC API: Disable data sanitization
   */
  public disableSanitization() {
    this.config.sanitizeData = false;
    this.saveConfig();
  }

  /**
   * PUBLIC API: Check if sanitization is enabled
   */
  public isSanitizationEnabled(): boolean {
    return this.config.sanitizeData;
  }

  /**
   * PUBLIC API: Get current configuration
   */
  public getConfig(): ConsoleManagerConfig {
    return { ...this.config };
  }

  /**
   * PUBLIC API: Update configuration
   */
  public updateConfig(newConfig: Partial<ConsoleManagerConfig>) {
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();

    // Apply changes
    if (this.config.autoClear) {
      this.startAutoClear();
    } else {
      this.stopAutoClear();
    }
  }

  /**
   * PUBLIC API: Clear console now
   */
  public clear() {
    console.clear();
  }

  /**
   * PUBLIC API: Force log (bypasses enabled check) - for critical errors
   */
  public forceLog(...args: any[]) {
    const sanitized = this.config.sanitizeData ? this.sanitizeArgs(args) : args;
    this.originalConsole.log.apply(console, sanitized);
  }

  /**
   * PUBLIC API: Force error (bypasses enabled check) - for critical errors
   */
  public forceError(...args: any[]) {
    const sanitized = this.config.sanitizeData ? this.sanitizeArgs(args) : args;
    this.originalConsole.error.apply(console, sanitized);
  }
}

// Singleton instance
const consoleManager = new ConsoleLogManager();

// Expose to window for admin access
if (typeof window !== 'undefined') {
  (window as any).__CONSOLE_MANAGER__ = consoleManager;
}

export default consoleManager;
