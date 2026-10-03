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
  work_shifts_enabled?: boolean
  max_work_shifts?: number | null
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
  shift_id?: string | null
  id: string
  business_id: string
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
  shift?: WorkShift | null
}

export interface WorkShift {
  id: string
  business_id: string
  name: string
  start_time: string
  end_time: string
  is_active: boolean
  created_at: string
  updated_at: string
  staff_count?: number
}

export type AppointmentStatus = 'waiting' | 'serving' | 'completed' | 'cancelled'
export type SubscriptionStatus = 'active' | 'expired' | 'suspended' | 'cancelled'
export type PaymentStatus = 'pending' | 'paid' | 'cancelled' | 'refunded'
export type PaymentMethod = 'cash' | 'bank_transfer' | 'hesabpay' | 'hawala' | 'other'

export interface OwnerSubscription {
  id: string; owner_id: string; plan_code: string; status: SubscriptionStatus;
  started_at: string; expires_at: string | null; custom_limits: Json; status_reason: string | null;
  created_at: string; updated_at: string;
}
export interface SubscriptionPayment {
  id: string; owner_id: string; business_id?: string | null; subscription_id: string | null; plan_code: string;
  amount: number; currency: string; payment_method: PaymentMethod; custom_payment_method: string | null;
  payment_status: PaymentStatus; paid_at: string | null; subscription_start_at: string; subscription_end_at: string;
  reference_number: string | null; note: string | null; created_by: string; created_at: string; updated_at: string;
}
export interface SubscriptionPlan {
  code: string; name: string; default_amount: number | null; currency: string; duration_months: number | null;
  limits: Json; is_active: boolean; created_at: string; updated_at: string;
}

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
  appointment_date: string
  appointment_time?: string | null
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
      set_user_plan: { Args: { p_user: string; p_plan: 'free' | 'growth' | 'custom'; p_businesses: number; p_services: number; p_staff: number; p_daily_appointments: number; p_expires_on: string | null; p_work_shifts_enabled: boolean; p_max_work_shifts: number | null }; Returns: undefined };
      business_work_shift_limits: { Args: { p_business: string }; Returns: Array<{ enabled: boolean; max_shifts: number | null }> };
      business_effective_plan_limits: { Args: { p_business: string }; Returns: Array<{ plan_code: string; effective_status: SubscriptionStatus; started_at: string | null; expires_at: string | null; remaining_days: number | null; max_businesses: number | null; max_services: number; max_staff: number; max_daily_appointments: number; advanced_scheduling: boolean; work_shifts_enabled: boolean; max_work_shifts: number }> };
      owner_effective_plan_limits: { Args: { p_owner: string }; Returns: Array<{ plan_code: string; effective_status: SubscriptionStatus; started_at: string | null; expires_at: string | null; remaining_days: number | null; max_businesses: number | null; max_services: number; max_staff: number; max_daily_appointments: number; advanced_scheduling: boolean; work_shifts_enabled: boolean; max_work_shifts: number }> };
      can_create_business: { Args: { p_owner: string }; Returns: boolean };
      record_manual_subscription_payment: { Args: { p_owner: string; p_plan: string; p_amount: number; p_currency: string; p_method: PaymentMethod; p_custom_method: string | null; p_status: PaymentStatus; p_paid_at: string | null; p_start_at: string; p_duration_months: number | null; p_custom_end_at: string | null; p_reference: string | null; p_note: string | null; p_custom_limits: Json }; Returns: string };
      set_owner_subscription_status: { Args: { p_owner: string; p_status: 'active' | 'suspended' | 'cancelled'; p_reason: string | null }; Returns: undefined };
      update_manual_payment: { Args: { p_payment: string; p_method: PaymentMethod; p_custom_method: string | null; p_reference: string | null; p_note: string | null; p_status: PaymentStatus }; Returns: undefined };
      set_business_day_with_transfer: { Args: { p_business: string; p_date: string; p_closed: boolean; p_reason: string; p_request: string }; Returns: Json };
      set_business_day_booking: { Args: { p_business: string; p_closed: boolean; p_reason: string; p_cancel_today: boolean; p_request: string }; Returns: Json };
      daily_notice_summary: { Args: { p_business: string }; Returns: Json };
      move_appointment_back: { Args: { p_appointment: string; p_steps: number }; Returns: Json };
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
      work_shifts: {
        Row: { [K in keyof WorkShift as K extends 'staff_count' ? never : K]: WorkShift[K] }
        Relationships: []
        Insert: Omit<WorkShift, 'id' | 'created_at' | 'updated_at' | 'staff_count'> & {
          id?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<WorkShift, 'id' | 'business_id' | 'created_at' | 'updated_at' | 'staff_count'>>
      }
      subscription_plan_catalog: {
        Row: { [K in keyof SubscriptionPlan]: SubscriptionPlan[K] }
        Insert: { [K in keyof SubscriptionPlan]?: SubscriptionPlan[K] }
        Update: { [K in keyof SubscriptionPlan]?: SubscriptionPlan[K] }
        Relationships: []
      }
      owner_subscriptions: {
        Row: { [K in keyof OwnerSubscription]: OwnerSubscription[K] }
        Insert: { [K in keyof OwnerSubscription]?: OwnerSubscription[K] }
        Update: { [K in keyof OwnerSubscription]?: OwnerSubscription[K] }
        Relationships: []
      }
      subscription_payments: {
        Row: { [K in keyof SubscriptionPayment]: SubscriptionPayment[K] }
        Insert: { [K in keyof SubscriptionPayment]?: SubscriptionPayment[K] }
        Update: { [K in keyof SubscriptionPayment]?: SubscriptionPayment[K] }
        Relationships: []
      }
      subscription_migration_conflicts: {
        Row: { owner_id: string; reason: string; legacy_subscription_ids: string[]; detected_at: string; resolved_at: string | null }
        Insert: { owner_id: string; reason: string; legacy_subscription_ids: string[]; detected_at?: string; resolved_at?: string | null }
        Update: { reason?: string; legacy_subscription_ids?: string[]; resolved_at?: string | null }
        Relationships: []
      }
      appointments: {
        Row: { [K in keyof Appointment]: Appointment[K] }
        Relationships: []
        Insert: Omit<Appointment, 'id' | 'created_at' | 'updated_at' | 'service' | 'staff' | 'late_count'> & {
          id?: string
          status?: AppointmentStatus
          estimated_wait_minutes?: number
          late_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Appointment, 'id' | 'business_id'>>
      }
    }
  }
}
