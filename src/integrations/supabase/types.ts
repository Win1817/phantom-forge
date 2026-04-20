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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      collection_cards: {
        Row: {
          card_name: string
          cmc: number | null
          collector_number: string | null
          colors: string[] | null
          condition: string | null
          created_at: string
          foil: boolean
          id: string
          image_url: string | null
          mana_cost: string | null
          notes: string | null
          price_usd: number | null
          quantity: number
          rarity: string | null
          scryfall_id: string
          set_code: string | null
          set_name: string | null
          type_line: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          card_name: string
          cmc?: number | null
          collector_number?: string | null
          colors?: string[] | null
          condition?: string | null
          created_at?: string
          foil?: boolean
          id?: string
          image_url?: string | null
          mana_cost?: string | null
          notes?: string | null
          price_usd?: number | null
          quantity?: number
          rarity?: string | null
          scryfall_id: string
          set_code?: string | null
          set_name?: string | null
          type_line?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          card_name?: string
          cmc?: number | null
          collector_number?: string | null
          colors?: string[] | null
          condition?: string | null
          created_at?: string
          foil?: boolean
          id?: string
          image_url?: string | null
          mana_cost?: string | null
          notes?: string | null
          price_usd?: number | null
          quantity?: number
          rarity?: string | null
          scryfall_id?: string
          set_code?: string | null
          set_name?: string | null
          type_line?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      deck_cards: {
        Row: {
          card_name: string
          cmc: number | null
          collector_number: string | null
          colors: string[] | null
          created_at: string
          deck_id: string
          id: string
          image_url: string | null
          is_commander: boolean
          is_sideboard: boolean
          mana_cost: string | null
          quantity: number
          scryfall_id: string
          set_code: string | null
          type_line: string | null
        }
        Insert: {
          card_name: string
          cmc?: number | null
          collector_number?: string | null
          colors?: string[] | null
          created_at?: string
          deck_id: string
          id?: string
          image_url?: string | null
          is_commander?: boolean
          is_sideboard?: boolean
          mana_cost?: string | null
          quantity?: number
          scryfall_id: string
          set_code?: string | null
          type_line?: string | null
        }
        Update: {
          card_name?: string
          cmc?: number | null
          collector_number?: string | null
          colors?: string[] | null
          created_at?: string
          deck_id?: string
          id?: string
          image_url?: string | null
          is_commander?: boolean
          is_sideboard?: boolean
          mana_cost?: string | null
          quantity?: number
          scryfall_id?: string
          set_code?: string | null
          type_line?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deck_cards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      decks: {
        Row: {
          colors: string[] | null
          cover_image_url: string | null
          created_at: string
          description: string | null
          format: string
          id: string
          is_public: boolean
          name: string
          share_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          colors?: string[] | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          format?: string
          id?: string
          is_public?: boolean
          name: string
          share_token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          colors?: string[] | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          format?: string
          id?: string
          is_public?: boolean
          name?: string
          share_token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
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
