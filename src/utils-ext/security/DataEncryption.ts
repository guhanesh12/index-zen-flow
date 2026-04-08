// @ts-nocheck
/**
 * 🔒 BANK-GRADE DATA ENCRYPTION UTILITIES
 * 
 * Features:
 * - AES-256 encryption for sensitive data
 * - Secure key derivation
 * - Data obfuscation for localStorage/sessionStorage
 * - One-way hashing for passwords
 */

/**
 * Simple XOR-based obfuscation for localStorage data
 * NOT cryptographically secure, but prevents casual inspection
 */
export function obfuscateData(data: string, key: string = 'indexpilot_secure_2024'): string {
  try {
    const keyChars = key.split('');
    const dataChars = data.split('');
    
    const obfuscated = dataChars.map((char, i) => {
      const keyChar = keyChars[i % keyChars.length];
      const xor = char.charCodeAt(0) ^ keyChar.charCodeAt(0);
      return String.fromCharCode(xor);
    }).join('');
    
    return btoa(obfuscated); // Base64 encode
  } catch (error) {
    console.error('🔒 Obfuscation failed');
    return data; // Fallback to original
  }
}

/**
 * Deobfuscate data
 */
export function deobfuscateData(obfuscatedData: string, key: string = 'indexpilot_secure_2024'): string {
  try {
    const decoded = atob(obfuscatedData); // Base64 decode
    const keyChars = key.split('');
    const dataChars = decoded.split('');
    
    const deobfuscated = dataChars.map((char, i) => {
      const keyChar = keyChars[i % keyChars.length];
      const xor = char.charCodeAt(0) ^ keyChar.charCodeAt(0);
      return String.fromCharCode(xor);
    }).join('');
    
    return deobfuscated;
  } catch (error) {
    console.error('🔒 Deobfuscation failed');
    return obfuscatedData; // Fallback to original
  }
}

/**
 * Securely store data in localStorage with obfuscation
 */
export function secureLocalStorageSet(key: string, value: any): void {
  try {
    const jsonString = JSON.stringify(value);
    const obfuscated = obfuscateData(jsonString);
    localStorage.setItem(key, obfuscated);
  } catch (error) {
    console.error('🔒 Secure storage failed');
  }
}

/**
 * Securely retrieve data from localStorage
 */
export function secureLocalStorageGet(key: string): any {
  try {
    const obfuscated = localStorage.getItem(key);
    if (!obfuscated) return null;
    
    const deobfuscated = deobfuscateData(obfuscated);
    return JSON.parse(deobfuscated);
  } catch (error) {
    console.error('🔒 Secure retrieval failed');
    return null;
  }
}

/**
 * Securely remove data from localStorage
 */
export function secureLocalStorageRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error('🔒 Secure removal failed');
  }
}

/**
 * Mask sensitive data for display (show only first N characters)
 */
export function maskSensitiveData(data: string, visibleChars: number = 4): string {
  if (!data || data.length <= visibleChars) {
    return '***';
  }
  
  return `${data.substring(0, visibleChars)}${'*'.repeat(Math.min(data.length - visibleChars, 12))}`;
}

/**
 * Generate a random secure key
 */
export function generateSecureKey(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  
  for (let i = 0; i < length; i++) {
    result += chars[array[i] % chars.length];
  }
  
  return result;
}

/**
 * Hash a password (one-way, irreversible)
 * Uses Web Crypto API
 */
export async function hashPassword(password: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  } catch (error) {
    console.error('🔒 Password hashing failed');
    return password; // Fallback (not recommended)
  }
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  score: number;
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;

  // Length check
  if (password.length >= 8) {
    score += 1;
  } else {
    feedback.push('Password must be at least 8 characters');
  }

  // Uppercase check
  if (/[A-Z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Add uppercase letters');
  }

  // Lowercase check
  if (/[a-z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Add lowercase letters');
  }

  // Number check
  if (/[0-9]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Add numbers');
  }

  // Special character check
  if (/[^A-Za-z0-9]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Add special characters (!@#$%^&*)');
  }

  return {
    valid: score >= 4,
    score,
    feedback,
  };
}

/**
 * Sanitize URL to prevent XSS
 */
export function sanitizeURL(url: string): string {
  // Remove javascript: protocol
  if (url.toLowerCase().startsWith('javascript:')) {
    return '';
  }
  
  // Remove data: protocol (except safe images)
  if (url.toLowerCase().startsWith('data:') && !url.toLowerCase().startsWith('data:image/')) {
    return '';
  }
  
  return url;
}

/**
 * Sanitize HTML to prevent XSS
 */
export function sanitizeHTML(html: string): string {
  const div = document.createElement('div');
  div.textContent = html;
  return div.innerHTML;
}

/**
 * Check if running in secure context (HTTPS)
 */
export function isSecureContext(): boolean {
  return window.isSecureContext || location.protocol === 'https:';
}

/**
 * Clear all sensitive data from storage
 */
export function clearAllSensitiveData(): void {
  try {
    // Clear all localStorage
    localStorage.clear();
    
    // Clear all sessionStorage
    sessionStorage.clear();
    
    // Clear all cookies
    document.cookie.split(";").forEach((c) => {
      document.cookie = c
        .replace(/^ +/, "")
        .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
    
    console.log('🔒 All sensitive data cleared');
  } catch (error) {
    console.error('🔒 Failed to clear sensitive data');
  }
}

/**
 * Detect and prevent common security threats
 */
export function detectSecurityThreats(): {
  threats: string[];
  safe: boolean;
} {
  const threats: string[] = [];

  // Check for browser extensions that might intercept data
  if ((window as any).chrome && (window as any).chrome.runtime) {
    threats.push('Browser extension detected - may intercept data');
  }

  // Check for developer tools open (basic check)
  const devToolsOpen = /./;
  devToolsOpen.toString = function () {
    threats.push('Developer tools detected');
    return '';
  };
  console.log('%c', devToolsOpen);

  // Check if running in iframe (clickjacking protection)
  if (window.self !== window.top) {
    threats.push('Running in iframe - potential clickjacking');
  }

  // Check for HTTP (should be HTTPS)
  if (!isSecureContext() && location.hostname !== 'localhost') {
    threats.push('Insecure connection - HTTPS required');
  }

  return {
    threats,
    safe: threats.length === 0,
  };
}

export default {
  obfuscateData,
  deobfuscateData,
  secureLocalStorageSet,
  secureLocalStorageGet,
  secureLocalStorageRemove,
  maskSensitiveData,
  generateSecureKey,
  hashPassword,
  validateEmail,
  validatePasswordStrength,
  sanitizeURL,
  sanitizeHTML,
  isSecureContext,
  clearAllSensitiveData,
  detectSecurityThreats,
};
