export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5";
  };
  public: {
    Tables: {
      companies: {
        Row: {
          address: string | null;
          ai_analysis: Json | null;
          ai_capabilities: Json | null;
          ai_certifications: Json | null;
          ai_competencies: Json | null;
          ai_recommendations: Json | null;
          ai_strengths: Json | null;
          certifications: string | null;
          companies_house_number: string | null;
          company_name: string;
          compliance_data: Json | null;
          consent_data_fetch: boolean | null;
          contact_email: string | null;
          contact_person: string | null;
          contact_phone: string | null;
          created_at: string;
          description: string | null;
          digital_maturity: string | null;
          equipment: string | null;
          operation_locations: Json | null;
          financial_data: Json | null;
          human_verified: Json | null;
          id: string;
          is_system_company: boolean | null;
          key_capabilities: string | null;
          market_position: string | null;
          past_projects: string | null;
          postcode: string | null;
          safety_rating: string | null;
          status: string | null;
          system_extracted: Json | null;
          updated_at: string;
          user_id: string | null;
          website_url: string | null;
        };
        Insert: {
          address?: string | null;
          ai_analysis?: Json | null;
          ai_capabilities?: Json | null;
          ai_certifications?: Json | null;
          ai_competencies?: Json | null;
          ai_recommendations?: Json | null;
          ai_strengths?: Json | null;
          certifications?: string | null;
          companies_house_number?: string | null;
          company_name: string;
          compliance_data?: Json | null;
          consent_data_fetch?: boolean | null;
          contact_email?: string | null;
          contact_person?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          description?: string | null;
          digital_maturity?: string | null;
          equipment?: string | null;
          operation_locations?: Json | null;
          financial_data?: Json | null;
          human_verified?: Json | null;
          id?: string;
          is_system_company?: boolean | null;
          key_capabilities?: string | null;
          market_position?: string | null;
          past_projects?: string | null;
          postcode?: string | null;
          safety_rating?: string | null;
          status?: string | null;
          system_extracted?: Json | null;
          updated_at?: string;
          user_id?: string | null;
          website_url?: string | null;
        };
        Update: {
          address?: string | null;
          ai_analysis?: Json | null;
          ai_capabilities?: Json | null;
          ai_certifications?: Json | null;
          ai_competencies?: Json | null;
          ai_recommendations?: Json | null;
          ai_strengths?: Json | null;
          certifications?: string | null;
          companies_house_number?: string | null;
          company_name?: string;
          compliance_data?: Json | null;
          consent_data_fetch?: boolean | null;
          contact_email?: string | null;
          contact_person?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          description?: string | null;
          digital_maturity?: string | null;
          equipment?: string | null;
          operation_locations?: Json | null;
          financial_data?: Json | null;
          human_verified?: Json | null;
          id?: string;
          is_system_company?: boolean | null;
          key_capabilities?: string | null;
          market_position?: string | null;
          past_projects?: string | null;
          postcode?: string | null;
          safety_rating?: string | null;
          status?: string | null;
          system_extracted?: Json | null;
          updated_at?: string;
          user_id?: string;
          website_url?: string | null;
        };
        Relationships: [];
      };
      company_taxonomies: {
        Row: {
          company_id: string;
          created_at: string;
          id: string;
          taxonomy_id: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          id?: string;
          taxonomy_id: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          id?: string;
          taxonomy_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_taxonomies_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_taxonomies_taxonomy_id_fkey";
            columns: ["taxonomy_id"];
            isOneToOne: false;
            referencedRelation: "taxonomies";
            referencedColumns: ["id"];
          },
        ];
      };
      company_capabilities: {
        Row: {
          capability_id: string;
          company_id: string;
          created_at: string;
          id: string;
        };
        Insert: {
          capability_id: string;
          company_id: string;
          created_at?: string;
          id?: string;
        };
        Update: {
          capability_id?: string;
          company_id?: string;
          created_at?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_capabilities_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_capabilities_capability_id_fkey";
            columns: ["capability_id"];
            isOneToOne: false;
            referencedRelation: "company_capabilities_ref";
            referencedColumns: ["id"];
          },
        ];
      };
      company_capabilities_ref: {
        Row: {
          category: string | null;
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          category?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          category?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      matching_results: {
        Row: {
          ai_analysis: Json | null;
          application_date: string | null;
          capability_score: number | null;
          certification_score: number | null;
          company_id: string;
          created_at: string;
          experience_score: number | null;
          id: string;
          improvement_suggestions: string[] | null;
          is_applied: boolean | null;
          is_bookmarked: boolean | null;
          location_score: number | null;
          match_reasons: string[] | null;
          overall_score: number | null;
          tender_id: string;
          updated_at: string;
        };
        Insert: {
          ai_analysis?: Json | null;
          application_date?: string | null;
          capability_score?: number | null;
          certification_score?: number | null;
          company_id: string;
          created_at?: string;
          experience_score?: number | null;
          id?: string;
          improvement_suggestions?: string[] | null;
          is_applied?: boolean | null;
          is_bookmarked?: boolean | null;
          location_score?: number | null;
          match_reasons?: string[] | null;
          overall_score?: number | null;
          tender_id: string;
          updated_at?: string;
        };
        Update: {
          ai_analysis?: Json | null;
          application_date?: string | null;
          capability_score?: number | null;
          certification_score?: number | null;
          company_id?: string;
          created_at?: string;
          experience_score?: number | null;
          id?: string;
          improvement_suggestions?: string[] | null;
          is_applied?: boolean | null;
          is_bookmarked?: boolean | null;
          location_score?: number | null;
          match_reasons?: string[] | null;
          overall_score?: number | null;
          tender_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "matching_results_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matching_results_tender_id_fkey";
            columns: ["tender_id"];
            isOneToOne: false;
            referencedRelation: "tenders";
            referencedColumns: ["id"];
          },
        ];
      };
      partnership_messages: {
        Row: {
          created_at: string;
          from_company_id: string;
          id: string;
          message: string;
          read_at: string | null;
          subject: string;
          tender_id: string | null;
          to_company_id: string;
        };
        Insert: {
          created_at?: string;
          from_company_id: string;
          id?: string;
          message: string;
          read_at?: string | null;
          subject: string;
          tender_id?: string | null;
          to_company_id: string;
        };
        Update: {
          created_at?: string;
          from_company_id?: string;
          id?: string;
          message?: string;
          read_at?: string | null;
          subject?: string;
          tender_id?: string | null;
          to_company_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "partnership_messages_from_company_id_fkey";
            columns: ["from_company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "partnership_messages_tender_id_fkey";
            columns: ["tender_id"];
            isOneToOne: false;
            referencedRelation: "tenders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "partnership_messages_to_company_id_fkey";
            columns: ["to_company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      partnership_recommendations: {
        Row: {
          company_id: string;
          compatibility_score: number;
          complementary_capabilities: string[] | null;
          created_at: string;
          id: string;
          recommended_company_id: string;
          recommended_for_tender_id: string | null;
          shared_locations: string[] | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          compatibility_score?: number;
          complementary_capabilities?: string[] | null;
          created_at?: string;
          id?: string;
          recommended_company_id: string;
          recommended_for_tender_id?: string | null;
          shared_locations?: string[] | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          compatibility_score?: number;
          complementary_capabilities?: string[] | null;
          created_at?: string;
          id?: string;
          recommended_company_id?: string;
          recommended_for_tender_id?: string | null;
          shared_locations?: string[] | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "partnership_recommendations_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "partnership_recommendations_recommended_company_id_fkey";
            columns: ["recommended_company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "partnership_recommendations_recommended_for_tender_id_fkey";
            columns: ["recommended_for_tender_id"];
            isOneToOne: false;
            referencedRelation: "tenders";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          approval_status: "pending" | "approved" | "rejected";
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          email: string | null;
          first_name: string | null;
          id: string;
          invited_to_company_id: string | null;
          job_title: string | null;
          last_name: string | null;
          phone: string | null;
          rejection_reason: string | null;
          signup_type:
            | "individual"
            | "new-company"
            | "join-company"
            | "invited"
            | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          approval_status?: "pending" | "approved" | "rejected";
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          email?: string | null;
          first_name?: string | null;
          id?: string;
          invited_to_company_id?: string | null;
          job_title?: string | null;
          last_name?: string | null;
          phone?: string | null;
          rejection_reason?: string | null;
          signup_type?:
            | "individual"
            | "new-company"
            | "join-company"
            | "invited"
            | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          approval_status?: "pending" | "approved" | "rejected";
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          email?: string | null;
          first_name?: string | null;
          id?: string;
          invited_to_company_id?: string | null;
          job_title?: string | null;
          last_name?: string | null;
          phone?: string | null;
          rejection_reason?: string | null;
          signup_type?:
            | "individual"
            | "new-company"
            | "join-company"
            | "invited"
            | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      company_members: {
        Row: {
          id: string;
          company_id: string;
          user_id: string;
          role: "admin" | "member";
          status: "pending" | "approved" | "rejected";
          approved_by: string | null;
          approved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          user_id: string;
          role?: "admin" | "member";
          status?: "pending" | "approved" | "rejected";
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          user_id?: string;
          role?: "admin" | "member";
          status?: "pending" | "approved" | "rejected";
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      company_join_requests: {
        Row: {
          id: string;
          user_id: string;
          company_id: string;
          company_name_requested: string;
          message: string | null;
          status: "pending" | "approved_by_admin" | "approved" | "rejected";
          admin_approved_at: string | null;
          admin_approved_by: string | null;
          superadmin_approved_at: string | null;
          superadmin_approved_by: string | null;
          rejection_reason: string | null;
          rejected_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          company_id: string;
          company_name_requested: string;
          message?: string | null;
          status?: "pending" | "approved_by_admin" | "approved" | "rejected";
          admin_approved_at?: string | null;
          admin_approved_by?: string | null;
          superadmin_approved_at?: string | null;
          superadmin_approved_by?: string | null;
          rejection_reason?: string | null;
          rejected_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          company_id?: string;
          company_name_requested?: string;
          message?: string | null;
          status?: "pending" | "approved_by_admin" | "approved" | "rejected";
          admin_approved_at?: string | null;
          admin_approved_by?: string | null;
          superadmin_approved_at?: string | null;
          superadmin_approved_by?: string | null;
          rejection_reason?: string | null;
          rejected_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_join_requests_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      team_invitations: {
        Row: {
          id: string;
          company_id: string;
          email: string;
          token_hash: string;
          invited_by: string;
          status: "pending" | "accepted" | "expired" | "cancelled";
          expires_at: string;
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          email: string;
          token_hash: string;
          invited_by: string;
          status?: "pending" | "accepted" | "expired" | "cancelled";
          expires_at: string;
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          email?: string;
          token_hash?: string;
          invited_by?: string;
          status?: "pending" | "accepted" | "expired" | "cancelled";
          expires_at?: string;
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_invitations_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      taxonomies: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          level: number;
          name: string;
          parent_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          level: number;
          name: string;
          parent_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          level?: number;
          name?: string;
          parent_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "taxonomies_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "taxonomies";
            referencedColumns: ["id"];
          },
        ];
      };
      tender_taxonomies: {
        Row: {
          created_at: string;
          id: string;
          taxonomy_id: string;
          tender_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          taxonomy_id: string;
          tender_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          taxonomy_id?: string;
          tender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tender_taxonomies_taxonomy_id_fkey";
            columns: ["taxonomy_id"];
            isOneToOne: false;
            referencedRelation: "taxonomies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tender_taxonomies_tender_id_fkey";
            columns: ["tender_id"];
            isOneToOne: false;
            referencedRelation: "tenders";
            referencedColumns: ["id"];
          },
        ];
      };
      tenders: {
        Row: {
          budget_max: number | null;
          budget_min: number | null;
          buyer: string;
          contact_info: Json | null;
          cpv_codes: string[] | null;
          created_at: string;
          deadline: string | null;
          description: string | null;
          documents: Json | null;
          id: string;
          location: string | null;
          publication_date: string | null;
          reference_number: string | null;
          requirements: Json | null;
          status: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          budget_max?: number | null;
          budget_min?: number | null;
          buyer: string;
          contact_info?: Json | null;
          cpv_codes?: string[] | null;
          created_at?: string;
          deadline?: string | null;
          description?: string | null;
          documents?: Json | null;
          id?: string;
          location?: string | null;
          publication_date?: string | null;
          reference_number?: string | null;
          requirements?: Json | null;
          status?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          budget_max?: number | null;
          budget_min?: number | null;
          buyer?: string;
          contact_info?: Json | null;
          cpv_codes?: string[] | null;
          created_at?: string;
          deadline?: string | null;
          description?: string | null;
          documents?: Json | null;
          id?: string;
          location?: string | null;
          publication_date?: string | null;
          reference_number?: string | null;
          requirements?: Json | null;
          status?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      virtual_organizations: {
        Row: {
          created_at: string;
          description: string | null;
          gap_analysis: Json | null;
          id: string;
          lead_company_id: string;
          name: string;
          recommended_partners: Json | null;
          status: string;
          target_tender_id: string | null;
          team_analysis: Json | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          gap_analysis?: Json | null;
          id?: string;
          lead_company_id: string;
          name: string;
          recommended_partners?: Json | null;
          status?: string;
          target_tender_id?: string | null;
          team_analysis?: Json | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          gap_analysis?: Json | null;
          id?: string;
          lead_company_id?: string;
          name?: string;
          recommended_partners?: Json | null;
          status?: string;
          target_tender_id?: string | null;
          team_analysis?: Json | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "virtual_organizations_lead_company_id_fkey";
            columns: ["lead_company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "virtual_organizations_target_tender_id_fkey";
            columns: ["target_tender_id"];
            isOneToOne: false;
            referencedRelation: "tenders";
            referencedColumns: ["id"];
          },
        ];
      };
      vo_members: {
        Row: {
          company_id: string;
          created_at: string;
          id: string;
          joined_at: string | null;
          role: string;
          vo_id: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          id?: string;
          joined_at?: string | null;
          role?: string;
          vo_id: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          id?: string;
          joined_at?: string | null;
          role?: string;
          vo_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vo_members_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vo_members_vo_id_fkey";
            columns: ["vo_id"];
            isOneToOne: false;
            referencedRelation: "virtual_organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          id: string;
          created_at: string;
          user_id: string | null;
          user_email: string | null;
          action_type: string;
          entity_type: string | null;
          entity_id: string | null;
          details: Json;
          ip_address: string | null;
          user_agent: string | null;
          request_path: string | null;
          request_method: string | null;
          status: "success" | "error" | "warning";
          error_message: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          user_id?: string | null;
          user_email?: string | null;
          action_type: string;
          entity_type?: string | null;
          entity_id?: string | null;
          details?: Json;
          ip_address?: string | null;
          user_agent?: string | null;
          request_path?: string | null;
          request_method?: string | null;
          status?: "success" | "error" | "warning";
          error_message?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          user_id?: string | null;
          user_email?: string | null;
          action_type?: string;
          entity_type?: string | null;
          entity_id?: string | null;
          details?: Json;
          ip_address?: string | null;
          user_agent?: string | null;
          request_path?: string | null;
          request_method?: string | null;
          status?: "success" | "error" | "warning";
          error_message?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      update_project_status: {
        Args: { new_status: string; project_id: string };
        Returns: undefined;
      };
      user_can_view_vo: {
        Args: { _user_id: string; _vo_id: string };
        Returns: boolean;
      };
      user_is_vo_member: {
        Args: { _user_id: string; _vo_id: string };
        Returns: boolean;
      };
      user_owns_company: {
        Args: { _company_id: string; _user_id: string };
        Returns: boolean;
      };
      is_company_admin: {
        Args: { _user_id: string; _company_id: string };
        Returns: boolean;
      };
      is_sme_owner: {
        Args: { _user_id: string };
        Returns: boolean;
      };
      is_user_approved: {
        Args: { _user_id: string };
        Returns: boolean;
      };
      get_user_role: {
        Args: { _user_id: string };
        Returns: Database["public"]["Enums"]["app_role"];
      };
    };
    Enums: {
      app_role: "superadmin" | "sme-owner" | "sme-member" | "individual";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["superadmin", "sme-owner", "sme-member", "individual"],
    },
  },
} as const;
