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
      trading_engine_state: {
        Row: {
          created_at: string
          id: string
          is_running: boolean
          last_heartbeat: string | null
          selected_symbols: Json | null
          started_at: string | null
          stopped_at: string | null
          strategy_settings: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_running?: boolean
          last_heartbeat?: string | null
          selected_symbols?: Json | null
          started_at?: string | null
          stopped_at?: string | null
          strategy_settings?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_running?: boolean
          last_heartbeat?: string | null
          selected_symbols?: Json | null
          started_at?: string | null
          stopped_at?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bytea_to_text: { Args: { data: string }; Returns: string }
      execute_backend_engine: { Args: never; Returns: undefined }
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
      [_ in never]: never
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
    Enums: {},
  },
} as const
