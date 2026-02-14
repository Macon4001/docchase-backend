import { Request } from 'express';

// Google OAuth Token Structure
export interface GoogleDriveToken {
  access_token: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
}

// Database Models
export interface Accountant {
  id: string;
  email: string;
  password_hash: string;
  practice_name: string;
  api_token: string | null;
  google_drive_token: GoogleDriveToken | null;
  google_drive_folder_id: string | null;
  google_drive_connected_at: Date | null;
  twilio_phone_number: string | null;
  amy_name: string;
  amy_tone: string;
  contact_details: string | null;
  notification_email: boolean;
  notification_stuck: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Client {
  id: string;
  accountant_id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface Campaign {
  id: string;
  accountant_id: string;
  name: string;
  document_type: string;
  period: string;
  status: string;
  reminder_day_3: boolean;
  reminder_day_6: boolean;
  flag_after_day_9: boolean;
  reminder_1_days?: number;
  reminder_2_days?: number;
  reminder_3_days?: number;
  reminder_send_time?: string;
  initial_message?: string;
  started_at: Date;
  completed_at: Date | null;
  created_at: Date;
}

export interface CampaignClient {
  id: string;
  campaign_id: string;
  client_id: string;
  status: string;
  first_message_sent_at: Date | null;
  reminder_1_sent_at: Date | null;
  reminder_2_sent_at: Date | null;
  flagged_at: Date | null;
  received_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Message {
  id: string;
  accountant_id: string;
  client_id: string;
  campaign_id: string | null;
  direction: 'inbound' | 'outbound';
  sender: string;
  body: string;
  media_url: string | null;
  twilio_sid: string | null;
  created_at: Date;
}

export interface Document {
  id: string;
  accountant_id: string;
  client_id: string;
  campaign_id: string | null;
  original_filename: string | null;
  original_url: string | null;
  drive_file_id: string | null;
  drive_file_url: string | null;
  csv_drive_file_id: string | null;
  csv_drive_file_url: string | null;
  conversion_status: string;
  conversion_error: string | null;
  created_at: Date;
}

// Request Extensions
export interface AuthenticatedRequest extends Request {
  accountant: {
    id: string;
    email: string;
    practice_name: string;
  };
}

// API Response Types
export interface ApiResponse<T = any> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AuthResponse {
  success: boolean;
  accountant: {
    id: string;
    email: string;
    practice_name: string;
  };
  token: string;
}

export interface DashboardData {
  campaign: Campaign | null;
  stats: {
    total: number;
    received: number;
    pending: number;
    failed: number;
    clients: Array<{
      id: string;
      name: string;
      status: string;
      updated_at: Date;
    }>;
  } | null;
}
