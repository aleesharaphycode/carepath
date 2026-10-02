export interface PatientProfile {
  id: string;
  user_id: string;
  full_name: string;
  date_of_birth: string | null;
  gender: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export type PatientProfileInsert = Omit<PatientProfile, "id" | "created_at" | "updated_at">;
export type PatientProfileUpdate = Partial<Pick<PatientProfile, "full_name" | "date_of_birth" | "gender" | "phone">>;

export type DocumentProcessingStatus = "pending" | "processing" | "completed" | "failed";

export type DocumentType =
  | "general"
  | "prescription"
  | "lab_report"
  | "discharge_summary"
  | "scan"
  | "other";

export interface MedicalDocument {
  id: string;
  patient_id: string;
  file_name: string;
  storage_path: string;
  file_type: string;
  file_size: number;
  document_type: DocumentType | string;
  processing_status: DocumentProcessingStatus;
  uploaded_at: string;
  updated_at: string;
  signed_url?: string | null;
}

export type MedicalDocumentInsert = {
  patient_id: string;
  file_name: string;
  storage_path: string;
  file_type: string;
  file_size: number;
  document_type?: string;
  processing_status?: DocumentProcessingStatus;
};

// Structured Clinical Record Types
export interface SourceReference {
  document_id: string;
  page?: number | null;
  source_text: string;
}

export interface DiagnosisItem {
  name: string;
  status?: string | null;
  date?: string | null;
  source_reference: SourceReference;
  confidence_note?: string | null;
}

export interface MedicationItem {
  name: string;
  dose?: string | null;
  route?: string | null;
  frequency?: string | null;
  duration?: string | null;
  instructions?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  source_reference: SourceReference;
  confidence_note?: string | null;
}

export interface InvestigationItem {
  name: string;
  date?: string | null;
  result?: string | null;
  unit?: string | null;
  reference_range?: string | null;
  abnormal_flag?: boolean | null;
  source_reference: SourceReference;
  confidence_note?: string | null;
}

export interface ProcedureItem {
  name: string;
  date?: string | null;
  details?: string | null;
  source_reference: SourceReference;
  confidence_note?: string | null;
}

export interface AllergyItem {
  substance: string;
  reaction?: string | null;
  severity?: string | null;
  source_reference: SourceReference;
  confidence_note?: string | null;
}

export interface FollowUpItem {
  description: string;
  confirmed_date?: string | null;
  relative_time?: string | null;
  source_reference: SourceReference;
  confidence_note?: string | null;
}

export interface MedicalDocumentExtraction {
  document_type: string;
  document_date?: string | null;
  provider_name?: string | null;
  patient_name_as_written?: string | null;
  diagnoses: DiagnosisItem[];
  medications: MedicationItem[];
  investigations: InvestigationItem[];
  procedures: ProcedureItem[];
  allergies: AllergyItem[];
  follow_ups: FollowUpItem[];
  clinical_notes?: string | null;
  source_references: SourceReference[];
  confidence_notes?: string | null;
}

// Unified Health Journey Intelligence Types
export type TimelineEventType = "diagnosis" | "medication" | "investigation" | "procedure" | "follow_up";

export interface TimelineEvent {
  id: string;
  event_type: TimelineEventType;
  title: string;
  date: string | null;
  date_display: string;
  is_date_confirmed: boolean;
  details: Record<string, string | number | boolean | null | undefined>;
  document_id: string;
  document_name: string;
  source_page?: number | null;
  source_text: string;
  confidence_note?: string | null;
}

export interface TimelineResponse {
  events: TimelineEvent[];
  total_count: number;
  categories: Record<string, number>;
}

export type HealthEventType = "visit" | "test" | "medication" | "procedure" | "follow_up";
export type HealthEventStatus = "completed" | "planned";

export interface HealthEventItem {
  id: string;
  patient_id: string;
  document_id?: string | null;
  event_date: string;
  event_type: HealthEventType;
  title: string;
  doctor_name?: string | null;
  clinic_name?: string | null;
  location?: string | null;
  description?: string | null;
  status: HealthEventStatus;
  document_name?: string | null;
  created_at: string;
}

export interface HealthEventCreateRequest {
  event_date: string;
  event_type: HealthEventType;
  title: string;
  doctor_name?: string | null;
  clinic_name?: string | null;
  location?: string | null;
  description?: string | null;
  status?: HealthEventStatus;
  document_id?: string | null;
  patient_id?: string | null;
}

export interface HealthEventCandidate {
  document_id: string;
  document_name: string;
  document_type: string;
  detected_date?: string | null;
  confidence_is_date_confirmed: boolean;
  suggested_event_type: HealthEventType;
  suggested_title: string;
  doctor_name?: string | null;
  clinic_name?: string | null;
  location?: string | null;
  description?: string | null;
  status: HealthEventStatus;
}

export interface CalendarEvent {
  id: string;
  event_type: "follow_up" | "investigation" | "procedure" | "appointment" | "visit" | "test" | "medication";
  title: string;
  date: string | null;
  date_display: string;
  is_projected: boolean;
  relative_time_text?: string | null;
  projection_basis?: string | null;
  document_id?: string | null;
  document_name?: string | null;
  source_page?: number | null;
  source_text?: string | null;
  confidence_note?: string | null;
  status?: HealthEventStatus;
  doctor_name?: string | null;
  clinic_name?: string | null;
  location?: string | null;
  description?: string | null;
}

export interface CalendarResponse {
  events: CalendarEvent[];
  total_events: number;
  confirmed_count: number;
  projected_count: number;
}

export interface MismatchSourceInfo {
  document_id: string;
  document_name: string;
  source_page?: number | null;
  source_text: string;
  value: string;
}

export interface MismatchItem {
  id: string;
  category: "medication" | "investigation" | "procedure" | "anatomical_site" | "follow_up" | string;
  title: string;
  field_name: string;
  source_a: MismatchSourceInfo;
  source_b: MismatchSourceInfo;
  explanation: string;
  verification_message: string;
  status: "flagged" | "verified" | "dismissed" | string;
  created_at?: string | null;
}

export interface MismatchResponse {
  mismatches: MismatchItem[];
  total_count: number;
}

// ============================================================================
// Family Health Circles, Consent & QR Doctor Access Types
// ============================================================================

export interface FamilyMemberProfile {
  id: string;
  patient_id: string;
  full_name: string;
  date_of_birth?: string | null;
  gender?: string | null;
  phone?: string | null;
  relationship: string;
  role: "owner" | "admin" | "member" | string;
  can_view_records: boolean;
  access_status: "active" | "pending" | "revoked" | string;
  is_current_user: boolean;
  created_at: string;
}

export interface FamilyGroupItem {
  id: string;
  name: string;
  created_by: string;
  is_owner: boolean;
  members: FamilyMemberProfile[];
  created_at: string;
}

export interface FamilyDashboardResponse {
  groups: FamilyGroupItem[];
  patient_id: string;
}

export interface CreateFamilyGroupRequest {
  name: string;
}

export interface AddFamilyMemberRequest {
  family_group_id: string;
  full_name: string;
  relationship: string;
  date_of_birth?: string | null;
  gender?: string | null;
  phone?: string | null;
  target_email?: string | null;
  can_view_records?: boolean;
}

export interface FamilyInvitationItem {
  id: string;
  family_group_id: string;
  group_name: string;
  inviter_name: string;
  relationship: string;
  status: string;
  created_at: string;
  is_registered: boolean;
}

export interface FamilyInvitationsResponse {
  invitations: FamilyInvitationItem[];
}

export interface UpdateFamilyMemberRequest {
  relationship?: string;
  can_view_records?: boolean;
  access_status?: string;
}

export interface ConsentSessionItem {
  id: string;
  patient_id: string;
  patient_name: string;
  recipient_name: string;
  access_token: string;
  qr_access_url: string;
  verification_code?: string;
  scope: string[];
  duration_minutes: number;
  expires_at: string;
  revoked_at?: string | null;
  status: "active" | "revoked" | "expired" | string;
  created_at: string;
}

export interface ConsentSessionListResponse {
  sessions: ConsentSessionItem[];
}

export interface CreateConsentRequest {
  patient_id?: string | null;
  recipient_name: string;
  scope: string[];
  duration_minutes: number;
}

export interface RevokeConsentResponse {
  success: boolean;
  session_id: string;
  message: string;
  revoked_at: string;
}

export interface AuditLogItem {
  id: string;
  session_id?: string | null;
  patient_id: string;
  actor: "patient" | "doctor" | "system" | string;
  action: string;
  details: string;
  ip_address?: string | null;
  timestamp: string;
}

export interface AuditLogResponse {
  logs: AuditLogItem[];
}

export interface DoctorAccessResponse {
  session_id: string;
  recipient_name: string;
  patient_name: string;
  scope: string[];
  expires_at: string;
  time_remaining_seconds: number;
  is_active: boolean;
  profile?: {
    full_name: string;
    date_of_birth?: string | null;
    gender?: string | null;
    phone?: string | null;
  } | null;
  diagnoses?: ScopedClinicalItem[] | null;
  medications?: ScopedClinicalItem[] | null;
  investigations?: ScopedClinicalItem[] | null;
  procedures?: ScopedClinicalItem[] | null;
  follow_ups?: ScopedClinicalItem[] | null;
  timeline?: TimelineEvent[] | null;
  documents?: MedicalDocument[] | null;
}

export interface ScopedClinicalItem {
  id?: string;
  name?: string;
  title?: string;
  dose?: string;
  dosage?: string;
  route?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
  result?: string;
  result_value?: string;
  unit?: string;
  reference_range?: string;
  abnormal_flag?: boolean;
  status?: string;
  date?: string;
  medication_name?: string;
  test_name?: string;
  condition_name?: string;
  diagnosis_date?: string;
  procedure_name?: string;
  procedure_date?: string;
  description?: string;
}

export interface FamilyMemberClinicalRecords {
  patient_id?: string;
  timeline?: { events: TimelineEvent[] };
  medications?: ScopedClinicalItem[];
  investigations?: ScopedClinicalItem[];
  diagnoses?: ScopedClinicalItem[];
  procedures?: ScopedClinicalItem[];
  documents?: MedicalDocument[];
}

// ==============================================================================
// AI DOCTOR / HEALTH ASSISTANT TYPES
// ==============================================================================

export interface AIDoctorSourceReference {
  document_id: string;
  document_name: string;
  document_type?: string | null;
  date?: string | null;
  relevance_note?: string | null;
}

export interface AIDoctorOTCMedicine {
  name: string;
  dosage?: string | null;
  when?: string | null;
  warning?: string | null;
}

export interface AIDoctorResponse {
  urgency: "green" | "yellow" | "orange" | "red";
  urgency_label: string;
  reply: string;
  possible_causes: string[];
  what_to_do: string[];
  home_remedies: string[];
  otc_medicines: AIDoctorOTCMedicine[];
  precautions: string[];
  when_to_rush: string[];
  doctor_type?: string | null;
  sources_used: AIDoctorSourceReference[];
  follow_up_questions: string[];
  safety_alert?: string | null;
  safety_violations?: string[] | null;
  patient_name?: string | null;
  patient_id?: string | null;
}

export interface AIDoctorChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  data?: AIDoctorResponse;
  feedback?: "up" | "down";
  timestamp: string;
}

export interface AIDoctorFeedbackPayload {
  message_id: string;
  rating: "up" | "down";
  comment?: string;
  user_message?: string;
  ai_response?: string;
}

export interface DoctorAccessStatusResponse {
  is_valid: boolean;
  requires_pin: boolean;
  is_approved: boolean;
  expires_at: string;
  time_remaining_seconds: number;
}
