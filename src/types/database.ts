/**
 * Supabase-generated-style Database types.
 * Keep in sync with supabase/migrations.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          github_user_id: number;
          username: string;
          display_name: string | null;
          avatar_url: string | null;
          email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          github_user_id: number;
          username: string;
          display_name?: string | null;
          avatar_url?: string | null;
          email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          github_user_id?: number;
          username?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      github_installations: {
        Row: {
          id: string;
          installation_id: number;
          account_login: string;
          account_type: string;
          account_id: number;
          status: string;
          target_type: string | null;
          target_login: string | null;
          suspended_at: string | null;
          connected_by_user_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          installation_id: number;
          account_login: string;
          account_type: string;
          account_id: number;
          status?: string;
          target_type?: string | null;
          target_login?: string | null;
          suspended_at?: string | null;
          connected_by_user_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          installation_id?: number;
          account_login?: string;
          account_type?: string;
          account_id?: number;
          status?: string;
          target_type?: string | null;
          target_login?: string | null;
          suspended_at?: string | null;
          connected_by_user_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      repositories: {
        Row: {
          id: string;
          github_repository_id: number;
          owner: string;
          name: string;
          full_name: string;
          default_branch: string;
          installation_id: string | null;
          github_installation_id: number | null;
          connected_by_user_id: string;
          is_active: boolean;
          connection_status: string;
          connection_error: string | null;
          last_synced_at: string | null;
          html_url: string | null;
          private: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          github_repository_id: number;
          owner: string;
          name: string;
          full_name: string;
          default_branch?: string;
          installation_id?: string | null;
          github_installation_id?: number | null;
          connected_by_user_id: string;
          is_active?: boolean;
          connection_status?: string;
          connection_error?: string | null;
          last_synced_at?: string | null;
          html_url?: string | null;
          private?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          github_repository_id?: number;
          owner?: string;
          name?: string;
          full_name?: string;
          default_branch?: string;
          installation_id?: string | null;
          github_installation_id?: number | null;
          connected_by_user_id?: string;
          is_active?: boolean;
          connection_status?: string;
          connection_error?: string | null;
          last_synced_at?: string | null;
          html_url?: string | null;
          private?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      pull_requests: {
        Row: {
          id: string;
          github_pr_id: number;
          repository_id: string;
          number: number;
          title: string;
          description: string | null;
          author_login: string;
          author_avatar_url: string | null;
          source_branch: string;
          target_branch: string;
          status: string;
          is_draft: boolean;
          head_sha: string | null;
          html_url: string | null;
          merged_at: string | null;
          closed_at: string | null;
          github_created_at: string | null;
          github_updated_at: string | null;
          last_event_action: string | null;
          last_ingested_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          github_pr_id: number;
          repository_id: string;
          number: number;
          title: string;
          description?: string | null;
          author_login: string;
          author_avatar_url?: string | null;
          source_branch: string;
          target_branch: string;
          status?: string;
          is_draft?: boolean;
          head_sha?: string | null;
          html_url?: string | null;
          merged_at?: string | null;
          closed_at?: string | null;
          github_created_at?: string | null;
          github_updated_at?: string | null;
          last_event_action?: string | null;
          last_ingested_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          github_pr_id?: number;
          repository_id?: string;
          number?: number;
          title?: string;
          description?: string | null;
          author_login?: string;
          author_avatar_url?: string | null;
          source_branch?: string;
          target_branch?: string;
          status?: string;
          is_draft?: boolean;
          head_sha?: string | null;
          html_url?: string | null;
          merged_at?: string | null;
          closed_at?: string | null;
          github_created_at?: string | null;
          github_updated_at?: string | null;
          last_event_action?: string | null;
          last_ingested_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      webhook_deliveries: {
        Row: {
          id: string;
          delivery_id: string;
          event_type: string;
          action: string | null;
          repository_full_name: string | null;
          processed: boolean;
          error_message: string | null;
          payload_summary: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          delivery_id: string;
          event_type: string;
          action?: string | null;
          repository_full_name?: string | null;
          processed?: boolean;
          error_message?: string | null;
          payload_summary?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          delivery_id?: string;
          event_type?: string;
          action?: string | null;
          repository_full_name?: string | null;
          processed?: boolean;
          error_message?: string | null;
          payload_summary?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          pull_request_id: string;
          source_type: string;
          title: string | null;
          description: string | null;
          extracted_content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          pull_request_id: string;
          source_type: string;
          title?: string | null;
          description?: string | null;
          extracted_content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          pull_request_id?: string;
          source_type?: string;
          title?: string | null;
          description?: string | null;
          extracted_content?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      analyses: {
        Row: {
          id: string;
          pull_request_id: string;
          analysis_version: number;
          status: string;
          risk_score: number | null;
          risk_classification: string | null;
          scope_score: number | null;
          scope_classification: string | null;
          impact_classification: string | null;
          final_decision: string | null;
          summary: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          pull_request_id: string;
          analysis_version?: number;
          status?: string;
          risk_score?: number | null;
          risk_classification?: string | null;
          scope_score?: number | null;
          scope_classification?: string | null;
          impact_classification?: string | null;
          final_decision?: string | null;
          summary?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          pull_request_id?: string;
          analysis_version?: number;
          status?: string;
          risk_score?: number | null;
          risk_classification?: string | null;
          scope_score?: number | null;
          scope_classification?: string | null;
          impact_classification?: string | null;
          final_decision?: string | null;
          summary?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      risk_factors: {
        Row: {
          id: string;
          analysis_id: string;
          category: string;
          severity: string;
          score_contribution: number;
          title: string;
          description: string;
          source_file: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          analysis_id: string;
          category: string;
          severity: string;
          score_contribution?: number;
          title: string;
          description: string;
          source_file?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          analysis_id?: string;
          category?: string;
          severity?: string;
          score_contribution?: number;
          title?: string;
          description?: string;
          source_file?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      affected_areas: {
        Row: {
          id: string;
          analysis_id: string;
          file_path: string;
          affected_area: string;
          impact_type: string;
          confidence: number | null;
          explanation: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          analysis_id: string;
          file_path: string;
          affected_area: string;
          impact_type: string;
          confidence?: number | null;
          explanation?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          analysis_id?: string;
          file_path?: string;
          affected_area?: string;
          impact_type?: string;
          confidence?: number | null;
          explanation?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      analysis_events: {
        Row: {
          id: string;
          analysis_id: string | null;
          pull_request_id: string | null;
          event_type: string;
          message: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          analysis_id?: string | null;
          pull_request_id?: string | null;
          event_type: string;
          message?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          analysis_id?: string | null;
          pull_request_id?: string | null;
          event_type?: string;
          message?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      policy_configurations: {
        Row: {
          id: string;
          repository_id: string | null;
          name: string;
          config: Json;
          is_default: boolean;
          created_by_user_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          repository_id?: string | null;
          name: string;
          config?: Json;
          is_default?: boolean;
          created_by_user_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          repository_id?: string | null;
          name?: string;
          config?: Json;
          is_default?: boolean;
          created_by_user_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
