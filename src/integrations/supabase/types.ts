export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admin_access_log: {
        Row: {
          allowed: boolean
          country_code: string | null
          created_at: string
          email: string | null
          id: string
          ip_address: string | null
          reason: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          allowed: boolean
          country_code?: string | null
          created_at?: string
          email?: string | null
          id?: string
          ip_address?: string | null
          reason?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          allowed?: boolean
          country_code?: string | null
          created_at?: string
          email?: string | null
          id?: string
          ip_address?: string | null
          reason?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      admin_ip_allowlist: {
        Row: {
          added_by: string | null
          created_at: string
          id: string
          ip_address: string
          label: string | null
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          id?: string
          ip_address: string
          label?: string | null
        }
        Update: {
          added_by?: string | null
          created_at?: string
          id?: string
          ip_address?: string
          label?: string | null
        }
        Relationships: []
      }
      admin_security_config: {
        Row: {
          alert_email: string | null
          alert_on_auto_suspend: boolean
          alert_on_critical_event: boolean
          allowed_countries: string[]
          geo_restrict_enabled: boolean
          id: number
          ip_allowlist_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alert_email?: string | null
          alert_on_auto_suspend?: boolean
          alert_on_critical_event?: boolean
          allowed_countries?: string[]
          geo_restrict_enabled?: boolean
          id?: number
          ip_allowlist_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alert_email?: string | null
          alert_on_auto_suspend?: boolean
          alert_on_critical_event?: boolean
          allowed_countries?: string[]
          geo_restrict_enabled?: boolean
          id?: number
          ip_allowlist_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      broker_credentials: {
        Row: {
          access_token: string | null
          access_token_encrypted: string | null
          access_token_expiry: string | null
          api_key: string | null
          api_key_expiry: string | null
          api_secret: string | null
          api_secret_encrypted: string | null
          auth_method: string
          broker: string
          created_at: string
          dhan_client_id: string | null
          dhan_client_name: string | null
          dhan_client_ucc: string | null
          encrypted_at: string | null
          given_power_of_attorney: boolean | null
          id: string
          last_consent_app_id: string | null
          last_error: string | null
          last_status: string | null
          last_token_id: string | null
          postback_url: string | null
          redirect_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          access_token_encrypted?: string | null
          access_token_expiry?: string | null
          api_key?: string | null
          api_key_expiry?: string | null
          api_secret?: string | null
          api_secret_encrypted?: string | null
          auth_method?: string
          broker?: string
          created_at?: string
          dhan_client_id?: string | null
          dhan_client_name?: string | null
          dhan_client_ucc?: string | null
          encrypted_at?: string | null
          given_power_of_attorney?: boolean | null
          id?: string
          last_consent_app_id?: string | null
          last_error?: string | null
          last_status?: string | null
          last_token_id?: string | null
          postback_url?: string | null
          redirect_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          access_token_encrypted?: string | null
          access_token_expiry?: string | null
          api_key?: string | null
          api_key_expiry?: string | null
          api_secret?: string | null
          api_secret_encrypted?: string | null
          auth_method?: string
          broker?: string
          created_at?: string
          dhan_client_id?: string | null
          dhan_client_name?: string | null
          dhan_client_ucc?: string | null
          encrypted_at?: string | null
          given_power_of_attorney?: boolean | null
          id?: string
          last_consent_app_id?: string | null
          last_error?: string | null
          last_status?: string | null
          last_token_id?: string | null
          postback_url?: string | null
          redirect_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      communication_settings: {
        Row: {
          email_enabled: boolean
          from_email: string
          from_name: string
          id: number
          reply_to: string | null
          sms_enabled: boolean
          updated_at: string
          updated_by: string | null
          whatsapp_enabled: boolean
        }
        Insert: {
          email_enabled?: boolean
          from_email?: string
          from_name?: string
          id?: number
          reply_to?: string | null
          sms_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          whatsapp_enabled?: boolean
        }
        Update: {
          email_enabled?: boolean
          from_email?: string
          from_name?: string
          id?: number
          reply_to?: string | null
          sms_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          whatsapp_enabled?: boolean
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          channel: string
          created_at: string
          error: string | null
          id: string
          metadata: Json | null
          provider: string | null
          provider_message_id: string | null
          recipient: string
          status: string
          subject: string | null
          template: string
          user_id: string | null
        }
        Insert: {
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          metadata?: Json | null
          provider?: string | null
          provider_message_id?: string | null
          recipient: string
          status?: string
          subject?: string | null
          template: string
          user_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          metadata?: Json | null
          provider?: string | null
          provider_message_id?: string | null
          recipient?: string
          status?: string
          subject?: string | null
          template?: string
          user_id?: string | null
        }
        Relationships: []
      }
      failed_login_attempts: {
        Row: {
          attempt_type: string
          created_at: string
          id: string
          identifier: string
          ip_address: string | null
          reason: string | null
          user_agent: string | null
        }
        Insert: {
          attempt_type?: string
          created_at?: string
          id?: string
          identifier: string
          ip_address?: string | null
          reason?: string | null
          user_agent?: string | null
        }
        Update: {
          attempt_type?: string
          created_at?: string
          id?: string
          identifier?: string
          ip_address?: string | null
          reason?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      instrument_master: {
        Row: {
          exchange_segment: string
          expiry_date: string
          id: string
          index_name: string
          lot_size: number
          option_type: string
          refreshed_at: string
          security_id: string
          strike_price: number
          symbol: string
          tick_size: number | null
        }
        Insert: {
          exchange_segment: string
          expiry_date: string
          id?: string
          index_name: string
          lot_size?: number
          option_type: string
          refreshed_at?: string
          security_id: string
          strike_price: number
          symbol: string
          tick_size?: number | null
        }
        Update: {
          exchange_segment?: string
          expiry_date?: string
          id?: string
          index_name?: string
          lot_size?: number
          option_type?: string
          refreshed_at?: string
          security_id?: string
          strike_price?: number
          symbol?: string
          tick_size?: number | null
        }
        Relationships: []
      }
      kv_store_4e940498: {
        Row: {
          key: string
          value: Json
        }
        Insert: {
          key: string
          value: Json
        }
        Update: {
          key?: string
          value?: Json
        }
        Relationships: []
      }
      kv_store_5b8b3994: {
        Row: {
          key: string
          value: Json
        }
        Insert: {
          key: string
          value: Json
        }
        Update: {
          key?: string
          value?: Json
        }
        Relationships: []
      }
      kv_store_c4d79cb7: {
        Row: {
          key: string
          value: Json
        }
        Insert: {
          key: string
          value: Json
        }
        Update: {
          key?: string
          value?: Json
        }
        Relationships: []
      }
      notification_billing_log: {
        Row: {
          amount: number
          billed_date: string
          created_at: string
          id: string
          note: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount?: number
          billed_date: string
          created_at?: string
          id?: string
          note?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          billed_date?: string
          created_at?: string
          id?: string
          note?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          email_enabled: boolean
          marketing: boolean
          sms_enabled: boolean
          trade_alerts: boolean
          updated_at: string
          user_id: string
          whatsapp_enabled: boolean
        }
        Insert: {
          email_enabled?: boolean
          marketing?: boolean
          sms_enabled?: boolean
          trade_alerts?: boolean
          updated_at?: string
          user_id: string
          whatsapp_enabled?: boolean
        }
        Update: {
          email_enabled?: boolean
          marketing?: boolean
          sms_enabled?: boolean
          trade_alerts?: boolean
          updated_at?: string
          user_id?: string
          whatsapp_enabled?: boolean
        }
        Relationships: []
      }
      nse_holidays: {
        Row: {
          created_at: string
          holiday_date: string
          name: string
        }
        Insert: {
          created_at?: string
          holiday_date: string
          name: string
        }
        Update: {
          created_at?: string
          holiday_date?: string
          name?: string
        }
        Relationships: []
      }
      position_monitor_state: {
        Row: {
          created_at: string
          current_price: number | null
          entry_price: number | null
          exchange_segment: string | null
          exit_reason: string | null
          exited_at: string | null
          highest_pnl: number | null
          id: string
          index_name: string | null
          is_active: boolean | null
          order_id: string
          pnl: number | null
          quantity: number | null
          raw_position: Json | null
          stop_loss_amount: number | null
          symbol: string
          symbol_id: string | null
          target_amount: number | null
          trailing_enabled: boolean | null
          trailing_step: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_price?: number | null
          entry_price?: number | null
          exchange_segment?: string | null
          exit_reason?: string | null
          exited_at?: string | null
          highest_pnl?: number | null
          id?: string
          index_name?: string | null
          is_active?: boolean | null
          order_id: string
          pnl?: number | null
          quantity?: number | null
          raw_position?: Json | null
          stop_loss_amount?: number | null
          symbol: string
          symbol_id?: string | null
          target_amount?: number | null
          trailing_enabled?: boolean | null
          trailing_step?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_price?: number | null
          entry_price?: number | null
          exchange_segment?: string | null
          exit_reason?: string | null
          exited_at?: string | null
          highest_pnl?: number | null
          id?: string
          index_name?: string | null
          is_active?: boolean | null
          order_id?: string
          pnl?: number | null
          quantity?: number | null
          raw_position?: Json | null
          stop_loss_amount?: number | null
          symbol?: string
          symbol_id?: string | null
          target_amount?: number | null
          trailing_enabled?: boolean | null
          trailing_step?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_status: string | null
          broker_connected: boolean | null
          client_id: string
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          joined_at: string
          kyc_status: string | null
          mobile: string | null
          photo_url: string | null
          profile_completion: number | null
          role: string | null
          signup_bonus_amount: number
          signup_bonus_credited: boolean
          signup_bonus_expires_at: string | null
          signup_bonus_remaining: number
          subscription_plan: string | null
          tour_completed: boolean
          trading_level: string | null
          updated_at: string
          user_id: string
          welcome_popup_seen: boolean
        }
        Insert: {
          account_status?: string | null
          broker_connected?: boolean | null
          client_id?: string
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          joined_at?: string
          kyc_status?: string | null
          mobile?: string | null
          photo_url?: string | null
          profile_completion?: number | null
          role?: string | null
          signup_bonus_amount?: number
          signup_bonus_credited?: boolean
          signup_bonus_expires_at?: string | null
          signup_bonus_remaining?: number
          subscription_plan?: string | null
          tour_completed?: boolean
          trading_level?: string | null
          updated_at?: string
          user_id: string
          welcome_popup_seen?: boolean
        }
        Update: {
          account_status?: string | null
          broker_connected?: boolean | null
          client_id?: string
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          joined_at?: string
          kyc_status?: string | null
          mobile?: string | null
          photo_url?: string | null
          profile_completion?: number | null
          role?: string | null
          signup_bonus_amount?: number
          signup_bonus_credited?: boolean
          signup_bonus_expires_at?: string | null
          signup_bonus_remaining?: number
          subscription_plan?: string | null
          tour_completed?: boolean
          trading_level?: string | null
          updated_at?: string
          user_id?: string
          welcome_popup_seen?: boolean
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_earnings: {
        Row: {
          created_at: string
          id: string
          last_credited_at: string | null
          pending_count: number
          successful_count: number
          total_earned: number
          total_pending: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_credited_at?: string | null
          pending_count?: number
          successful_count?: number
          total_earned?: number
          total_pending?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_credited_at?: string | null
          pending_count?: number
          successful_count?: number
          total_earned?: number
          total_pending?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_settings: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          reward_amount: number
          share_template_email: string | null
          share_template_generic: string | null
          share_template_telegram: string | null
          share_template_whatsapp: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          reward_amount?: number
          share_template_email?: string | null
          share_template_generic?: string | null
          share_template_telegram?: string | null
          share_template_whatsapp?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          reward_amount?: number
          share_template_email?: string | null
          share_template_generic?: string | null
          share_template_telegram?: string | null
          share_template_whatsapp?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string
          device_fingerprint: string | null
          first_trade_at: string | null
          fraud_flag: boolean | null
          id: string
          referee_client_id: string | null
          referee_user_id: string
          referrer_client_id: string | null
          referrer_user_id: string
          registered_at: string
          registration_ip: string | null
          reward_amount: number | null
          rewarded_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          device_fingerprint?: string | null
          first_trade_at?: string | null
          fraud_flag?: boolean | null
          id?: string
          referee_client_id?: string | null
          referee_user_id: string
          referrer_client_id?: string | null
          referrer_user_id: string
          registered_at?: string
          registration_ip?: string | null
          reward_amount?: number | null
          rewarded_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          device_fingerprint?: string | null
          first_trade_at?: string | null
          fraud_flag?: boolean | null
          id?: string
          referee_client_id?: string | null
          referee_user_id?: string
          referrer_client_id?: string | null
          referrer_user_id?: string
          registered_at?: string
          registration_ip?: string | null
          reward_amount?: number | null
          rewarded_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      security_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json
          resource: string | null
          resource_id: string | null
          status: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          resource?: string | null
          resource_id?: string | null
          status?: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          resource?: string | null
          resource_id?: string | null
          status?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      signal_stats: {
        Row: {
          created_at: string
          extra_data: Json | null
          failed_orders: number | null
          id: string
          order_count: number | null
          signal_count: number | null
          speed_count: number | null
          stat_date: string
          successful_orders: number | null
          total_pnl: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          extra_data?: Json | null
          failed_orders?: number | null
          id?: string
          order_count?: number | null
          signal_count?: number | null
          speed_count?: number | null
          stat_date?: string
          successful_orders?: number | null
          total_pnl?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          extra_data?: Json | null
          failed_orders?: number | null
          id?: string
          order_count?: number | null
          signal_count?: number | null
          speed_count?: number | null
          stat_date?: string
          successful_orders?: number | null
          total_pnl?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suspended_users: {
        Row: {
          auto: boolean
          id: string
          metadata: Json
          reason: string
          rule_triggered: string | null
          suspended_at: string
          suspended_by: string | null
          unsuspended_at: string | null
          unsuspended_by: string | null
          user_id: string
        }
        Insert: {
          auto?: boolean
          id?: string
          metadata?: Json
          reason: string
          rule_triggered?: string | null
          suspended_at?: string
          suspended_by?: string | null
          unsuspended_at?: string | null
          unsuspended_by?: string | null
          user_id: string
        }
        Update: {
          auto?: boolean
          id?: string
          metadata?: Json
          reason?: string
          rule_triggered?: string | null
          suspended_at?: string
          suspended_by?: string | null
          unsuspended_at?: string | null
          unsuspended_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      trading_engine_state: {
        Row: {
          auto_resume: boolean
          created_at: string
          id: string
          is_running: boolean
          last_heartbeat: string | null
          selected_symbols: Json | null
          started_at: string | null
          stopped_at: string | null
          stopped_reason: string | null
          strategy_settings: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_resume?: boolean
          created_at?: string
          id?: string
          is_running?: boolean
          last_heartbeat?: string | null
          selected_symbols?: Json | null
          started_at?: string | null
          stopped_at?: string | null
          stopped_reason?: string | null
          strategy_settings?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_resume?: boolean
          created_at?: string
          id?: string
          is_running?: boolean
          last_heartbeat?: string | null
          selected_symbols?: Json | null
          started_at?: string | null
          stopped_at?: string | null
          stopped_reason?: string | null
          strategy_settings?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trading_orders: {
        Row: {
          created_at: string
          dhan_order_id: string | null
          error_message: string | null
          exchange_segment: string | null
          id: string
          index_name: string | null
          order_type: string
          price: number | null
          quantity: number
          raw_response: Json | null
          signal_id: string | null
          status: string
          symbol: string
          symbol_id: string | null
          transaction_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dhan_order_id?: string | null
          error_message?: string | null
          exchange_segment?: string | null
          id?: string
          index_name?: string | null
          order_type?: string
          price?: number | null
          quantity?: number
          raw_response?: Json | null
          signal_id?: string | null
          status?: string
          symbol: string
          symbol_id?: string | null
          transaction_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dhan_order_id?: string | null
          error_message?: string | null
          exchange_segment?: string | null
          id?: string
          index_name?: string | null
          order_type?: string
          price?: number | null
          quantity?: number
          raw_response?: Json | null
          signal_id?: string | null
          status?: string
          symbol?: string
          symbol_id?: string | null
          transaction_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trading_orders_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "trading_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      trading_signals: {
        Row: {
          confidence: number | null
          created_at: string
          expiry: string | null
          id: string
          index_name: string | null
          option_type: string | null
          price: number | null
          raw_data: Json | null
          signal_type: string
          status: string
          strike_price: number | null
          symbol: string
          user_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          expiry?: string | null
          id?: string
          index_name?: string | null
          option_type?: string | null
          price?: number | null
          raw_data?: Json | null
          signal_type: string
          status?: string
          strike_price?: number | null
          symbol: string
          user_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          expiry?: string | null
          id?: string
          index_name?: string | null
          option_type?: string | null
          price?: number | null
          raw_data?: Json | null
          signal_type?: string
          status?: string
          strike_price?: number | null
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_symbol_config: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          index_name: string
          lot_count: number
          moneyness: string
          slot: number
          stop_loss_per_lot: number
          target_per_lot: number
          trailing_activation_per_lot: number
          trailing_enabled: boolean
          trailing_step_per_lot: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          index_name: string
          lot_count?: number
          moneyness?: string
          slot: number
          stop_loss_per_lot?: number
          target_per_lot?: number
          trailing_activation_per_lot?: number
          trailing_enabled?: boolean
          trailing_step_per_lot?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          index_name?: string
          lot_count?: number
          moneyness?: string
          slot?: number
          stop_loss_per_lot?: number
          target_per_lot?: number
          trailing_activation_per_lot?: number
          trailing_enabled?: boolean
          trailing_step_per_lot?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_symbols: {
        Row: {
          created_at: string
          exchange_segment: string | null
          expiry: string | null
          id: string
          index_name: string | null
          instrument_type: string | null
          lot_size: number | null
          option_type: string | null
          raw_data: Json | null
          strike_price: number | null
          symbol_id: string
          symbol_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exchange_segment?: string | null
          expiry?: string | null
          id?: string
          index_name?: string | null
          instrument_type?: string | null
          lot_size?: number | null
          option_type?: string | null
          raw_data?: Json | null
          strike_price?: number | null
          symbol_id: string
          symbol_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          exchange_segment?: string | null
          expiry?: string | null
          id?: string
          index_name?: string | null
          instrument_type?: string | null
          lot_size?: number | null
          option_type?: string | null
          raw_data?: Json | null
          strike_price?: number | null
          symbol_id?: string
          symbol_name?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          reference_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bytea_to_text: { Args: { data: string }; Returns: string }
      decrypt_broker_secret: { Args: { _ciphertext: string }; Returns: string }
      encrypt_broker_secret: { Args: { _plaintext: string }; Returns: string }
      execute_backend_engine: { Args: never; Returns: undefined }
      expire_signup_bonuses: { Args: never; Returns: number }
      generate_client_id: { Args: never; Returns: string }
      get_broker_encryption_key: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      http: {
        Args: { request: Database["public"]["CompositeTypes"]["http_request"] }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "http_request"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_delete:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_get:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_head: {
        Args: { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_header: {
        Args: { field: string; value: string }
        Returns: Database["public"]["CompositeTypes"]["http_header"]
        SetofOptions: {
          from: "*"
          to: "http_header"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_list_curlopt: {
        Args: never
        Returns: {
          curlopt: string
          value: string
        }[]
      }
      http_patch: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_post:
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_put: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_reset_curlopt: { Args: never; Returns: boolean }
      http_set_curlopt: {
        Args: { curlopt: string; value: string }
        Returns: boolean
      }
      is_account_active: { Args: { _user_id: string }; Returns: boolean }
      is_login_locked: {
        Args: { _identifier: string; _ip?: string }
        Returns: boolean
      }
      is_trading_day: { Args: { d?: string }; Returns: boolean }
      is_valid_referral_code: { Args: { _code: string }; Returns: boolean }
      referral_code_exists: { Args: { _code: string }; Returns: boolean }
      text_to_bytea: { Args: { data: string }; Returns: string }
      urlencode:
        | { Args: { data: Json }; Returns: string }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      http_header: {
        field: string | null
        value: string | null
      }
      http_request: {
        method: unknown
        uri: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content_type: string | null
        content: string | null
      }
      http_response: {
        status: number | null
        content_type: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content: string | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
