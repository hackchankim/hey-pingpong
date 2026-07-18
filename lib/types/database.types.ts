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
      club_members: {
        Row: {
          club_id: string
          id: string
          joined_at: string
          role: Database["public"]["Enums"]["club_role"]
          status: Database["public"]["Enums"]["member_status"]
          user_id: string
        }
        Insert: {
          club_id: string
          id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["club_role"]
          status?: Database["public"]["Enums"]["member_status"]
          user_id: string
        }
        Update: {
          club_id?: string
          id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["club_role"]
          status?: Database["public"]["Enums"]["member_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_members_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          created_at: string
          description: string | null
          id: string
          initial_rating: number
          invite_code: string
          invite_code_enabled: boolean
          logo_url: string | null
          name: string
          owner_id: string
          plan: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          initial_rating?: number
          invite_code: string
          invite_code_enabled?: boolean
          logo_url?: string | null
          name: string
          owner_id: string
          plan?: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          initial_rating?: number
          invite_code?: string
          invite_code_enabled?: boolean
          logo_url?: string | null
          name?: string
          owner_id?: string
          plan?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clubs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
          username: string | null
          website: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
          username?: string | null
          website?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          username?: string | null
          website?: string | null
        }
        Relationships: []
      }
      tournament_participants: {
        Row: {
          club_id: string
          created_at: string
          final_rank: number | null
          id: string
          rating_at_registration: number | null
          seed: number | null
          status: Database["public"]["Enums"]["participant_status"]
          tournament_id: string
          user_id: string
        }
        Insert: {
          club_id: string
          created_at?: string
          final_rank?: number | null
          id?: string
          rating_at_registration?: number | null
          seed?: number | null
          status?: Database["public"]["Enums"]["participant_status"]
          tournament_id: string
          user_id: string
        }
        Update: {
          club_id?: string
          created_at?: string
          final_rank?: number | null
          id?: string
          rating_at_registration?: number | null
          seed?: number | null
          status?: Database["public"]["Enums"]["participant_status"]
          tournament_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_participants_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_participants_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          club_id: string
          created_at: string
          created_by: string
          format: Database["public"]["Enums"]["tournament_format"]
          id: string
          max_participants: number | null
          name: string
          registration_deadline: string | null
          ruleset: Json | null
          starts_at: string | null
          status: Database["public"]["Enums"]["tournament_status"]
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          created_by: string
          format: Database["public"]["Enums"]["tournament_format"]
          id?: string
          max_participants?: number | null
          name: string
          registration_deadline?: string | null
          ruleset?: Json | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["tournament_status"]
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          created_by?: string
          format?: Database["public"]["Enums"]["tournament_format"]
          id?: string
          max_participants?: number | null
          name?: string
          registration_deadline?: string | null
          ruleset?: Json | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["tournament_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_club: {
        Args: { p_description?: string; p_name: string; p_slug: string }
        Returns: Json
      }
      is_club_admin: { Args: { target_club_id: string }; Returns: boolean }
      is_club_member: { Args: { target_club_id: string }; Returns: boolean }
      join_club_with_code: { Args: { p_invite_code: string }; Returns: Json }
    }
    Enums: {
      club_role: "owner" | "admin" | "member"
      member_status: "active" | "banned"
      participant_status:
        | "pending"
        | "registered"
        | "checked_in"
        | "withdrawn"
        | "disqualified"
      tournament_format:
        | "round_robin"
        | "single_elimination"
        | "double_elimination"
      tournament_status:
        | "draft"
        | "registration_open"
        | "in_progress"
        | "completed"
        | "cancelled"
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
    Enums: {
      club_role: ["owner", "admin", "member"],
      member_status: ["active", "banned"],
      participant_status: [
        "pending",
        "registered",
        "checked_in",
        "withdrawn",
        "disqualified",
      ],
      tournament_format: [
        "round_robin",
        "single_elimination",
        "double_elimination",
      ],
      tournament_status: [
        "draft",
        "registration_open",
        "in_progress",
        "completed",
        "cancelled",
      ],
    },
  },
} as const

// 편의 타입
export type Profile = Tables<"profiles">
export type ProfileInsert = TablesInsert<"profiles">
export type ProfileUpdate = TablesUpdate<"profiles">

export type Club = Tables<"clubs">
export type ClubInsert = TablesInsert<"clubs">
export type ClubUpdate = TablesUpdate<"clubs">

export type ClubMember = Tables<"club_members">
export type ClubMemberInsert = TablesInsert<"club_members">
export type ClubMemberUpdate = TablesUpdate<"club_members">

export type Tournament = Tables<"tournaments">
export type TournamentInsert = TablesInsert<"tournaments">
export type TournamentUpdate = TablesUpdate<"tournaments">

export type TournamentParticipant = Tables<"tournament_participants">
export type TournamentParticipantInsert = TablesInsert<"tournament_participants">
export type TournamentParticipantUpdate = TablesUpdate<"tournament_participants">
