// ═══════════════════════════════════════════════════════════════
// 📊 ANALYTICS TRACKING - Server-side tracking with KV storage
// ═══════════════════════════════════════════════════════════════

import * as kv from './kv_store.tsx';

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function parseIPAddress(ipHeader: string): string {
  // IP header can contain multiple IPs: "103.226.186.159,103.226.186.159, 13.248.105.41"
  // We want the FIRST real client IP
  if (!ipHeader || ipHeader === 'Unknown') {
    return 'Unknown';
  }
  
  const ips = ipHeader.split(',').map(ip => ip.trim());
  // Return the first IP that's not a known proxy/CDN IP
  for (const ip of ips) {
    if (ip && !ip.startsWith('13.') && !ip.startsWith('10.') && !ip.startsWith('172.')) {
      return ip;
    }
  }
  // If all are proxy IPs, return the first one
  return ips[0] || 'Unknown';
}

function sanitizeSessionKey(ip: string): string {
  // Remove any characters that might cause issues in key names
  // Only allow alphanumeric, dots, dashes, underscores
  return ip.replace(/[^a-zA-Z0-9.\-_]/g, '_');
}

function parseUserAgent(userAgent: string) {
  const ua = userAgent.toLowerCase();
  
  // Detect device type
  let deviceType: 'Mobile' | 'Desktop' | 'Tablet' = 'Desktop';
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(userAgent)) {
    deviceType = 'Tablet';
  } else if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(userAgent)) {
    deviceType = 'Mobile';
  }
  
  // Detect browser
  let browser = 'Unknown';
  if (ua.includes('edge') || ua.includes('edg/')) {
    browser = 'Edge';
  } else if (ua.includes('chrome')) {
    browser = 'Chrome';
  } else if (ua.includes('safari') && !ua.includes('chrome')) {
    browser = 'Safari';
  } else if (ua.includes('firefox')) {
    browser = 'Firefox';
  } else if (ua.includes('opera') || ua.includes('opr/')) {
    browser = 'Opera';
  }
  
  // Detect OS
  let os = 'Unknown';
  if (ua.includes('windows')) {
    os = 'Windows';
  } else if (ua.includes('mac')) {
    os = 'macOS';
  } else if (ua.includes('linux')) {
    os = 'Linux';
  } else if (ua.includes('android')) {
    os = 'Android';
  } else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) {
    os = 'iOS';
  }
  
  return { deviceType, browser, os };
}

async function getCountryFromIP(ip: string): Promise<string> {
  // For now, return India by default
  // In production, you could use a GeoIP service
  return 'India';
}

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ═══════════════════════════════════════════════════════════════
// SESSION TRACKING
// ═══════════════════════════════════════════════════════════════

export async function trackVisitorSession(
  ipAddress: string,
  userAgent: string,
  page: string,
  userId?: string,
  trackPageViewFlag: boolean = true // NEW: Control whether to track page view
): Promise<VisitorSession> {
  try {
    const sessionKey = `visitor_session:${sanitizeSessionKey(ipAddress)}`;
    let session = await kv.get(sessionKey) as VisitorSession | null;
    
    const now = Date.now();
    const { deviceType, browser, os } = parseUserAgent(userAgent);
    const country = await getCountryFromIP(ipAddress);
    
    if (!session) {
      // New session
      session = {
        sessionId: generateSessionId(),
        ipAddress,
        userAgent,
        deviceType,
        browser,
        os,
        country,
        firstSeen: now,
        lastSeen: now,
        pagesVisited: [page],
        isActive: true,
        userId
      };
      
      console.log(`📊 New visitor session: ${session.sessionId} (${deviceType}, ${country})`);
    } else {
      // Update existing session
      const timeSinceLastSeen = now - session.lastSeen; // Calculate BEFORE updating
      session.lastSeen = now;
      session.isActive = true; // Always active when receiving activity
      if (!session.pagesVisited.includes(page)) {
        session.pagesVisited.push(page);
      }
      if (userId) {
        session.userId = userId;
      }
      
      console.log(`📊 Updated visitor session: ${session.sessionId} (lastSeen: ${Math.round(timeSinceLastSeen/1000)}s ago, now active)`);
    }
    
    // Save session
    await kv.set(sessionKey, session);
    
    // 🐛 VERIFICATION: Check if session was saved correctly
    const savedSession = await kv.get(sessionKey);
    if (savedSession) {
      console.log(`✅ Session saved successfully to key: ${sessionKey}`);
    } else {
      console.error(`❌ CRITICAL: Session NOT saved to key: ${sessionKey}`);
    }
    
    // Only track page view if requested (not for heartbeats)
    if (trackPageViewFlag) {
      await trackPageView(session.sessionId, page);
    }
    
    return session;
  } catch (error: any) {
    console.error('❌ Error tracking visitor session:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════
// PAGE VIEW TRACKING
// ═══════════════════════════════════════════════════════════════

export async function trackPageView(sessionId: string, page: string): Promise<void> {
  try {
    const pageView: PageView = {
      id: `pageview_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      sessionId,
      page,
      timestamp: Date.now()
    };
    
    // Get existing page views
    const pageViewsKey = 'analytics:pageviews';
    const existingViews = (await kv.get(pageViewsKey) || []) as PageView[];
    
    // Add new view
    existingViews.push(pageView);
    
    // Keep only last 10000 page views to avoid storage bloat
    const trimmedViews = existingViews.slice(-10000);
    
    await kv.set(pageViewsKey, trimmedViews);
    
    console.log(`📊 Page view tracked: ${page} (session: ${sessionId})`);
  } catch (error: any) {
    console.error('❌ Error tracking page view:', error);
  }
}

// ═══════════════════════════════════════════════════════════════
// LOGIN TRACKING
// ═══════════════════════════════════════════════════════════════

export async function trackLoginAttempt(
  email: string,
  status: 'success' | 'failed',
  ipAddress: string,
  userAgent: string,
  userId?: string
): Promise<void> {
  try {
    const { deviceType } = parseUserAgent(userAgent);
    
    const loginAttempt: LoginAttempt = {
      id: `login_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      email,
      timestamp: Date.now(),
      ipAddress,
      device: deviceType,
      status,
      userId
    };
    
    // Get existing login attempts
    const loginsKey = 'analytics:logins';
    const existingLogins = (await kv.get(loginsKey) || []) as LoginAttempt[];
    
    // Add new attempt
    existingLogins.push(loginAttempt);
    
    // Keep only last 5000 login attempts
    const trimmedLogins = existingLogins.slice(-5000);
    
    await kv.set(loginsKey, trimmedLogins);
    
    console.log(`📊 Login attempt tracked: ${email} - ${status}`);
  } catch (error: any) {
    console.error('❌ Error tracking login attempt:', error);
  }
}

// ═══════════════════════════════════════════════════════════════
// SIGNUP TRACKING
// ═══════════════════════════════════════════════════════════════

export async function trackSignupProgress(
  email: string | undefined,
  name: string | undefined,
  mobile: string | undefined,
  completionPercent: number,
  completed: boolean,
  userId?: string
): Promise<void> {
  try {
    const signupKey = `analytics:signup:${email || mobile || userId || 'unknown'}`;
    const existing = await kv.get(signupKey) as SignupProgress | null;
    
    const now = Date.now();
    
    const signupProgress: SignupProgress = {
      id: existing?.id || `signup_${now}_${Math.random().toString(36).substring(2, 9)}`,
      email,
      name,
      mobile,
      startTime: existing?.startTime || now,
      lastActivity: now,
      completionPercent,
      completed,
      userId
    };
    
    await kv.set(signupKey, signupProgress);
    
    console.log(`📊 Signup progress tracked: ${email || mobile} - ${completionPercent}% ${completed ? '(COMPLETED)' : ''}`);
  } catch (error: any) {
    console.error('❌ Error tracking signup progress:', error);
  }
}

// ═══════════════════════════════════════════════════════════════
// ANALYTICS RETRIEVAL
// ═══════════════════════════════════════════════════════════════

export async function getVisitorAnalytics(timeRange: 'today' | 'week' | 'month') {
  try {
    const now = Date.now();
    let cutoffTime = now;
    
    switch (timeRange) {
      case 'today':
        cutoffTime = now - 24 * 60 * 60 * 1000;
        break;
      case 'week':
        cutoffTime = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case 'month':
        cutoffTime = now - 30 * 24 * 60 * 60 * 1000;
        break;
    }
    
    console.log(`📊 [GET ANALYTICS] Fetching visitor analytics for range: ${timeRange}`);
    console.log(`   Cutoff time: ${new Date(cutoffTime).toISOString()}`);
    console.log(`   Current time: ${new Date(now).toISOString()}`);
    
    // Get all visitor sessions
    const sessionData = await kv.getByPrefix('visitor_session:');
    console.log(`   Raw session data count: ${sessionData.length}`);
    
    const sessions = sessionData
      .map(item => item.value as VisitorSession)
      .filter(s => s != null && s.lastSeen != null); // Filter out null/undefined
    
    console.log(`   Valid sessions (non-null): ${sessions.length}`);
    
    const sessionsInRange = sessions.filter(s => s.lastSeen >= cutoffTime);
    console.log(`   Sessions within time range: ${sessionsInRange.length}`);
    
    // Log sample session for debugging
    if (sessions.length > 0) {
      const sample = sessions[0];
      console.log(`   Sample session:`, {
        id: sample.sessionId,
        ip: sample.ipAddress,
        firstSeen: new Date(sample.firstSeen).toISOString(),
        lastSeen: new Date(sample.lastSeen).toISOString(),
        isActive: sample.isActive
      });
    }
    
    // Calculate metrics
    const totalVisitors = sessionsInRange.length;
    const newVisitors = sessionsInRange.filter(s => s.firstSeen >= cutoffTime).length;
    const returningVisitors = totalVisitors - newVisitors;
    const uniqueVisitors = new Set(sessionsInRange.map(s => s.ipAddress)).size;
    
    // Active now (last 5 minutes)
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    const activeNow = sessionsInRange.filter(s => s.lastSeen >= fiveMinutesAgo).length;
    
    // Get page views
    const pageViews = (await kv.get('analytics:pageviews') || []) as PageView[];
    const recentPageViews = pageViews.filter(pv => pv.timestamp >= cutoffTime);
    const totalPageViews = recentPageViews.length;
    
    // Calculate average session time
    const sessionDurations = sessionsInRange
      .map(s => s.lastSeen - s.firstSeen)
      .filter(d => d > 0);
    const avgDuration = sessionDurations.length > 0
      ? sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length
      : 0;
    const avgMinutes = Math.floor(avgDuration / 60000);
    const avgSeconds = Math.floor((avgDuration % 60000) / 1000);
    const avgSessionTime = `${avgMinutes}m ${avgSeconds}s`;
    
    // Calculate bounce rate (sessions with only 1 page view)
    const singlePageSessions = sessionsInRange.filter(s => s.pagesVisited.length === 1).length;
    const bounceRate = totalVisitors > 0 ? Math.round((singlePageSessions / totalVisitors) * 100) : 0;
    
    return {
      totalVisitors,
      newVisitors,
      returningVisitors,
      uniqueVisitors,
      totalPageViews,
      avgSessionTime,
      bounceRate,
      activeNow,
      sessions: sessionsInRange.map(s => ({
        id: s.sessionId,
        ipAddress: s.ipAddress,
        deviceType: s.deviceType,
        browser: s.browser,
        os: s.os,
        country: s.country,
        pagesVisited: s.pagesVisited,
        entryPage: s.pagesVisited[0] || '/',
        exitPage: s.pagesVisited[s.pagesVisited.length - 1] || '/',
        visitTime: new Date(s.firstSeen).toLocaleTimeString(),
        duration: formatDuration(s.lastSeen - s.firstSeen),
        isActive: s.lastSeen >= fiveMinutesAgo
      }))
    };
  } catch (error: any) {
    console.error('❌ Error getting visitor analytics:', error);
    throw error;
  }
}

export async function getLoginAnalytics(timeRange: 'today' | 'week' | 'month') {
  try {
    const now = Date.now();
    let cutoffTime = now;
    
    switch (timeRange) {
      case 'today':
        cutoffTime = now - 24 * 60 * 60 * 1000;
        break;
      case 'week':
        cutoffTime = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case 'month':
        cutoffTime = now - 30 * 24 * 60 * 60 * 1000;
        break;
    }
    
    // Get all login attempts
    const logins = (await kv.get('analytics:logins') || []) as LoginAttempt[];
    const recentLogins = logins.filter(l => l.timestamp >= cutoffTime);
    
    const totalAttempts = recentLogins.length;
    const successful = recentLogins.filter(l => l.status === 'success').length;
    const failed = recentLogins.filter(l => l.status === 'failed').length;
    
    // Get recent logins (last 20)
    const recentLoginsList = recentLogins
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20)
      .map(l => ({
        id: l.id,
        email: l.email,
        time: new Date(l.timestamp).toLocaleTimeString(),
        ipAddress: l.ipAddress,
        device: l.device,
        status: l.status
      }));
    
    return {
      totalAttempts,
      successful,
      failed,
      recentLogins: recentLoginsList
    };
  } catch (error: any) {
    console.error('❌ Error getting login analytics:', error);
    throw error;
  }
}

export async function getSignupAnalytics(timeRange: 'today' | 'week' | 'month') {
  try {
    const now = Date.now();
    let cutoffTime = now;
    
    switch (timeRange) {
      case 'today':
        cutoffTime = now - 24 * 60 * 60 * 1000;
        break;
      case 'week':
        cutoffTime = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case 'month':
        cutoffTime = now - 30 * 24 * 60 * 60 * 1000;
        break;
    }
    
    // Get all signup progress
    const signupData = await kv.getByPrefix('analytics:signup:');
    const allSignups = signupData
      .map(item => item.value as SignupProgress)
      .filter(s => s != null && s.lastActivity != null); // Filter out null/undefined
    const recentSignups = allSignups.filter(s => s.lastActivity >= cutoffTime);
    
    const totalSignups = recentSignups.length;
    const completed = recentSignups.filter(s => s.completed).length;
    const incomplete = totalSignups - completed;
    
    // Get incomplete users
    const incompleteUsers = recentSignups
      .filter(s => !s.completed)
      .sort((a, b) => b.lastActivity - a.lastActivity)
      .slice(0, 20)
      .map(s => ({
        id: s.id,
        name: s.name,
        email: s.email,
        mobile: s.mobile,
        startTime: new Date(s.startTime).toLocaleString(),
        lastActivity: new Date(s.lastActivity).toLocaleString(),
        completionPercent: s.completionPercent
      }));
    
    return {
      totalSignups,
      completed,
      incomplete,
      incompleteUsers
    };
  } catch (error: any) {
    console.error('❌ Error getting signup analytics:', error);
    throw error;
  }
}

export async function getTrafficData(timeRange: 'today' | 'week' | 'month') {
  try {
    const pageViews = (await kv.get('analytics:pageviews') || []) as PageView[];
    const now = Date.now();
    let cutoffTime = now;
    let buckets: Map<string, number> = new Map();
    
    switch (timeRange) {
      case 'today':
        cutoffTime = now - 24 * 60 * 60 * 1000;
        // Group by hour
        for (let i = 0; i < 24; i++) {
          buckets.set(`${i}:00`, 0);
        }
        
        pageViews
          .filter(pv => pv.timestamp >= cutoffTime)
          .forEach(pv => {
            const hour = new Date(pv.timestamp).getHours();
            const key = `${hour}:00`;
            buckets.set(key, (buckets.get(key) || 0) + 1);
          });
        break;
        
      case 'week':
        cutoffTime = now - 7 * 24 * 60 * 60 * 1000;
        // Group by day
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        days.forEach(day => buckets.set(day, 0));
        
        pageViews
          .filter(pv => pv.timestamp >= cutoffTime)
          .forEach(pv => {
            const day = days[new Date(pv.timestamp).getDay()];
            buckets.set(day, (buckets.get(day) || 0) + 1);
          });
        break;
        
      case 'month':
        cutoffTime = now - 30 * 24 * 60 * 60 * 1000;
        // Group by day
        for (let i = 1; i <= 30; i++) {
          buckets.set(`Day ${i}`, 0);
        }
        
        pageViews
          .filter(pv => pv.timestamp >= cutoffTime)
          .forEach(pv => {
            const daysAgo = Math.floor((now - pv.timestamp) / (24 * 60 * 60 * 1000));
            const day = 30 - daysAgo;
            if (day >= 1 && day <= 30) {
              const key = `Day ${day}`;
              buckets.set(key, (buckets.get(key) || 0) + 1);
            }
          });
        break;
    }
    
    // Add unique ID to each entry to prevent React key warnings
    return Array.from(buckets.entries()).map(([time, visitors], index) => ({
      id: `traffic_${timeRange}_${index}`,
      time,
      visitors
    }));
  } catch (error: any) {
    console.error('❌ Error getting traffic data:', error);
    throw error;
  }
}

export async function getDeviceData(timeRange: 'today' | 'week' | 'month') {
  try {
    const now = Date.now();
    let cutoffTime = now;
    
    switch (timeRange) {
      case 'today':
        cutoffTime = now - 24 * 60 * 60 * 1000;
        break;
      case 'week':
        cutoffTime = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case 'month':
        cutoffTime = now - 30 * 24 * 60 * 60 * 1000;
        break;
    }
    
    // Get all visitor sessions
    const sessionData = await kv.getByPrefix('visitor_session:');
    const sessions = sessionData
      .map(item => item.value as VisitorSession)
      .filter(s => s != null && s.lastSeen != null) // Filter out null/undefined
      .filter(s => s.lastSeen >= cutoffTime);
    
    // Count by device type
    const deviceCounts: { [key: string]: number } = {};
    sessions.forEach(s => {
      deviceCounts[s.deviceType] = (deviceCounts[s.deviceType] || 0) + 1;
    });
    
    return Object.entries(deviceCounts).map(([name, value]) => ({
      name,
      value
    }));
  } catch (error: any) {
    console.error('❌ Error getting device data:', error);
    throw error;
  }
}

export async function getTopPages(timeRange: 'today' | 'week' | 'month') {
  try {
    const now = Date.now();
    let cutoffTime = now;
    
    switch (timeRange) {
      case 'today':
        cutoffTime = now - 24 * 60 * 60 * 1000;
        break;
      case 'week':
        cutoffTime = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case 'month':
        cutoffTime = now - 30 * 24 * 60 * 60 * 1000;
        break;
    }
    
    // Get page views
    const pageViews = (await kv.get('analytics:pageviews') || []) as PageView[];
    const recentViews = pageViews.filter(pv => pv.timestamp >= cutoffTime);
    
    // Count by page
    const pageCounts: { [key: string]: number } = {};
    recentViews.forEach(pv => {
      pageCounts[pv.page] = (pageCounts[pv.page] || 0) + 1;
    });
    
    // Sort and get top 10 with unique IDs
    return Object.entries(pageCounts)
      .map(([page, visits], index) => ({ 
        id: `page_${timeRange}_${index}`, // Unique ID for React keys
        page, 
        visits 
      }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 10);
  } catch (error: any) {
    console.error('❌ Error getting top pages:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

// ═══════════════════════════════════════════════════════════════
// SESSION CLEANUP (Run periodically to remove old sessions)
// ═══════════════════════════════════════════════════════════════

export async function cleanupOldSessions() {
  try {
    const now = Date.now();
    const cutoffTime = now - 24 * 60 * 60 * 1000; // 24 hours
    
    const sessionData = await kv.getByPrefix('visitor_session:');
    let cleaned = 0;
    
    for (const item of sessionData) {
      const session = item.value as VisitorSession;
      if (session && session.lastSeen && session.lastSeen < cutoffTime) {
        await kv.del(item.key);
        cleaned++;
      }
    }
    
    console.log(`🧹 Cleaned up ${cleaned} old visitor sessions`);
  } catch (error: any) {
    console.error('❌ Error cleaning up sessions:', error);
  }
}

// ═══════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════

interface VisitorSession {
  sessionId: string;
  ipAddress: string;
  userAgent: string;
  deviceType: 'Mobile' | 'Desktop' | 'Tablet';
  browser: string;
  os: string;
  country: string;
  firstSeen: number;
  lastSeen: number;
  pagesVisited: string[];
  isActive: boolean;
  userId?: string;
}

interface PageView {
  id: string;
  sessionId: string;
  page: string;
  timestamp: number;
}

interface LoginAttempt {
  id: string;
  email: string;
  timestamp: number;
  ipAddress: string;
  device: 'Mobile' | 'Desktop' | 'Tablet';
  status: 'success' | 'failed';
  userId?: string;
}

interface SignupProgress {
  id: string;
  email?: string;
  name?: string;
  mobile?: string;
  startTime: number;
  lastActivity: number;
  completionPercent: number;
  completed: boolean;
  userId?: string;
}