export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'user' | 'superadmin'

export interface Profile {
  plan_code?: 'free' | 'growth' | 'custom' | 'legacy'
  plan_expires_on?: string | null
  max_businesses?: number | null
  max_services_per_business?: number
  max_staff_per_business?: number
  max_daily_appointments_per_business?: number
  id: string
  full_name: string | null
  phone: string | null
  avatar_url?: string | null
  role: UserRole
  is_active?: boolean
  created_at: string
  updated_at: string
}

export interface Business {
  id: string
  owner_id: string
  name: string
  description?: string | null
  logo_url?: string | null
  category: string
  slug: string
  phone?: string | null
  address?: string | null
  opening_time?: string | null
  closing_time?: string | null
  max_daily_appointments?: number
  max_active_appointments_per_device?: number | null
  no_show_grace_minutes?: number
  is_active?: boolean
  created_at: string
  updated_at: string
}

export interface Service {
  id: string
  business_id: string
  name: string
  description?: string | null
  duration_minutes: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Staff {
  max_daily_appointments?: number
  id: string
  business_id: string
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type AppointmentStatus = 'waiting' | 'serving' | 'completed' | 'cancelled'

export interface Appointment {
  id: string
  business_id: string
  service_id?: string | null
  staff_id?: string | null
  customer_name: string
  booking_device_id?: string | null
  customer_phone?: string | null
  queue_number: number
  status: AppointmentStatus
  estimated_wait_minutes: number
  late_count: number
  late_deadline_at?: string | null
  appointment_date: string
  created_at: string
  updated_at: string
  // Optional joined relations for UI rendering
  service?: Service | null
  staff?: Staff | null
}

export interface Database {
  public: {
    Views: { [_ in never]: never }
    Functions: {
      assign_free_plan: { Args: { p_user: string }; Returns: undefined };
      business_plan_daily_limit: { Args: { p_business: string }; Returns: number | null };
      business_plan_daily_quota: { Args: { p_business: string }; Returns: number | null };
      set_user_plan_limits: { Args: { p_user: string; p_businesses: number; p_services: number; p_staff: number; p_daily_appointments: number }; Returns: undefined };
      set_user_plan: { Args: { p_user: string; p_plan: 'free' | 'growth' | 'custom'; p_businesses: number; p_services: number; p_staff: number; p_daily_appointments: number; p_expires_on: string | null }; Returns: undefined };
      set_business_day_with_transfer: { Args: { p_business: string; p_date: string; p_closed: boolean; p_reason: string; p_request: string }; Returns: Json };
      set_business_day_booking: { Args: { p_business: string; p_closed: boolean; p_reason: string; p_cancel_today: boolean; p_request: string }; Returns: Json };
      daily_notice_summary: { Args: { p_business: string }; Returns: Json };
      process_late_appointments: { Args: { p_limit?: number }; Returns: Json };
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
    Tables: {
      business_day_closures: {
        Row: { business_id: string; booking_date: string; is_closed: boolean; reason: string; updated_at: string };
        Insert: { business_id: string; booking_date: string; is_closed: boolean; reason: string };
        Update: { is_closed?: boolean; reason?: string };
        Relationships: [];
      };
      profiles: {
        Row: { [K in keyof Profile]: Profile[K] }
        Relationships: []
        Insert: Pick<Profile, 'id'> & Partial<Omit<Profile, 'id'>>
        Update: Partial<Omit<Profile, 'id'>>
      }
      businesses: {
        Row: { [K in keyof Business]: Business[K] }
        Relationships: []
        Insert: Omit<Business, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Business, 'id' | 'owner_id'>>
      }
      services: {
        Row: { [K in keyof Service]: Service[K] }
        Relationships: []
        Insert: Omit<Service, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Service, 'id' | 'business_id'>>
      }
      staff: {
        Row: { [K in keyof Staff]: Staff[K] }
        Relationships: []
        Insert: Omit<Staff, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Staff, 'id' | 'business_id'>>
      }
      appointments: {
        Row: { [K in keyof Appointment]: Appointment[K] }
        Relationships: []
        Insert: Omit<Appointment, 'id' | 'created_at' | 'updated_at' | 'service' | 'staff' | 'late_count' | 'late_deadline_at'> & {
          id?: string
          status?: AppointmentStatus
          estimated_wait_minutes?: number
          late_count?: number
          late_deadline_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Appointment, 'id' | 'business_id'>>
      }
    }
  }
}
