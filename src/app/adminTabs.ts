// Central catalog of admin dashboard tabs & sub-tabs.
// Used by AdminUserManagement (permission grid) and by each screen
// (AdminDashboard, AdminSettings, …) to hide tabs an admin isn't allowed to see.

export interface SubTab { key: string; label: string; }
export interface TabDef  { key: string; label: string; subs: SubTab[]; }

export const TAB_TREE: TabDef[] = [
  { key: 'dashboard', label: 'Dashboard', subs: [
    { key: 'overview', label: 'Overview' },
    { key: 'revenue',  label: 'Revenue' },
    { key: 'users',    label: 'Users' },
    { key: 'trading',  label: 'Trading' },
    { key: 'system',   label: 'System Health' },
  ]},
  { key: 'users',            label: 'Users',            subs: [] },
  { key: 'transactions',     label: 'Transactions',     subs: [] },
  { key: 'support',          label: 'Support',          subs: [] },
  { key: 'landing',          label: 'Landing Page',     subs: [] },
  { key: 'adminUsers',       label: 'Admin Activity',   subs: [] },
  { key: 'adminManagement',  label: 'Admin Management', subs: [
    { key: 'list',     label: 'Admins' },
    { key: 'activity', label: 'Login Activity' },
  ]},
  { key: 'settings', label: 'Settings', subs: [
    { key: 'api-keys',         label: 'API Keys' },
    { key: 'notifications',    label: 'Notifications' },
    { key: 'push-notifications', label: 'Push Notifications' },
    { key: 'security',         label: 'Security' },
    { key: 'activity-monitor', label: 'Activity Monitor' },
    { key: 'access-control',   label: 'Access Control' },
    { key: 'monitoring',       label: 'Advanced Monitoring' },
    { key: 'system-health',    label: 'System Health' },
    { key: 'backend',          label: 'Backend Config' },
    { key: 'brevo',            label: 'Brevo Communications' },
    { key: 'vps-power',        label: 'VPS Power' },
    { key: 'app-update',       label: 'App Update' },
  ]},
  { key: 'referrals', label: 'Referrals', subs: [
    { key: 'settings',    label: 'Settings' },
    { key: 'list',        label: 'Referrals' },
    { key: 'leaderboard', label: 'Leaderboard' },
  ]},
  { key: 'communication', label: 'Communication', subs: [
    { key: 'settings',  label: 'Settings & Logs' },
    { key: 'broadcast', label: 'Broadcast Mail' },
  ]},
  { key: 'mobile',        label: 'Mobile App',   subs: [] },
  { key: 'audit',         label: 'Audit Log',    subs: [] },
];

/** Module id used in the admin_permissions table for a main tab. */
export const tabModule    = (key: string)               => `tab:${key}`;
/** Module id used in the admin_permissions table for a sub-tab. */
export const subTabModule = (parent: string, sub: string) => `tab:${parent}:${sub}`;
