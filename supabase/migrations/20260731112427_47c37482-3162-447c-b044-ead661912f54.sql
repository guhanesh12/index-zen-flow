INSERT INTO public.auto_notification_templates (event, title, body, image_url, enabled) VALUES
('pre_market', '⏰ Pre-Market Alert', 'Markets open in 15 minutes. Check your slots and engine status.', NULL, true),
('engine_on', '🚀 Engine Started', 'Your auto-trading engine is now running and scanning for signals.', NULL, true),
('engine_off', '🛑 Engine Stopped', 'Your auto-trading engine has been stopped. No new trades will be placed.', NULL, true),
('vps_online', '🟢 VPS Online', 'Your dedicated VPS is online and connected.', NULL, true),
('vps_offline', '🔴 VPS Offline', 'Your dedicated VPS went offline. Auto-trading is paused.', NULL, true),
('signal_entry', '📈 New Signal', 'A new trade signal has been generated for your symbol.', NULL, true),
('signal_exit', '📉 Position Closed', 'Your position has been closed. Check P&L in the dashboard.', NULL, true),
('wallet_recharge', '💰 Wallet Recharged', 'Your wallet has been credited successfully.', NULL, true),
('low_balance', '⚠️ Low Wallet Balance', 'Your wallet balance is low. Recharge to keep auto-trading active.', NULL, true),
('support_reply', '💬 Support Reply', 'Our team has replied to your support ticket.', NULL, true),
('referral_reward', '🎁 Referral Reward', 'You earned a referral reward. Check your wallet.', NULL, true),
('subscription_expiry', '📅 Subscription Expiring', 'Your subscription is expiring soon. Renew to avoid interruption.', NULL, true)
ON CONFLICT (event) DO NOTHING;