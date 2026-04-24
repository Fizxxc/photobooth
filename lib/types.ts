export type UserRole = 'admin' | 'operator';
export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'cancelled';
export type SessionStatus = 'draft' | 'pending_payment' | 'paid' | 'completed' | 'cancelled';

export interface BoothOverview {
  id: string;
  name: string;
  slug: string;
  is_enabled: boolean;
}

export interface OverlayItem {
  id: string;
  user_id: string;
  label: string;
  bucket_id: string;
  storage_path: string;
  width: number;
  height: number;
  is_active: boolean;
  signed_url?: string;
}

export interface SessionDraft {
  id: string;
  session_code: string;
  final_bucket_id: string;
  final_storage_path: string;
}
