// @ts-nocheck
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './app/App';
import { initProductionGuard } from './utils-ext/security/ProductionGuard';

// 🔒 Silence console + block devtools shortcuts in production (no-op on localhost / preview).
initProductionGuard();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

// StrictMode removed to prevent double-mount of pages (login was loading twice in dev).
createRoot(rootElement).render(<App />);
