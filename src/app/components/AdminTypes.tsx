// @ts-nocheck
export interface AdminUser {
  id: string;
  email: string;
  password: string;
  role: {
    dashboard: boolean;
    users: boolean;
    transactions: boolean;
    settings: boolean;
    instruments?: boolean;
    journals?: boolean;
    support?: boolean;
    landing?: boolean;
    adminUsers?: boolean;
    adminManagement?: boolean; // New permission for admin user management
    [key: string]: boolean | undefined; // Allow dynamic tab permissions
  };
  hotkey: {
    windows: string; // e.g., "Ctrl+Alt+GUHAN"
    mac: string;     // e.g., "Cmd+Option+GUHAN"
  };
  twoFactorSecret?: string;
  twoFactorEnabled: boolean;
  lastLogin?: number;
  lastLogout?: number;
  status?: 'online' | 'offline';
}

export interface AdminDashboardProps {
  serverUrl: string;
  accessToken: string;
  show?: boolean;
  onClose?: () => void;
  pressedHotkey?: string; // Track which hotkey was pressed
}
