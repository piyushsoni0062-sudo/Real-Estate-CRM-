// Shared API entity types (mirrors the server's serialized shapes).

export interface AuthUser {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  avatarUrl: string | null;
  designation: string | null;
  role: { id: string; name: string };
  permissions: string[];
}

export interface Option {
  id: string;
  name: string;
  color: string;
  order?: number;
  isSystem?: boolean;
}

export interface Stage extends Option {
  isWon?: boolean;
  isLost?: boolean;
}

export interface UserLite {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface Lead {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  altMobile: string | null;
  city: string | null;
  address: string | null;
  budgetMin: string | null;
  budgetMax: string | null;
  requirement: string | null;
  propertyType: string | null;
  score: number;
  lostReason: string | null;
  status: Option;
  statusId: string;
  source: Option;
  sourceId: string;
  stage: Stage | null;
  stageId: string | null;
  assignedTo: UserLite | null;
  assignedToId: string | null;
  project: { id: string; name: string } | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadActivity {
  id: string;
  type: string;
  title: string;
  description: string | null;
  createdAt: string;
  user: UserLite | null;
}

export interface LeadNote {
  id: string;
  body: string;
  createdAt: string;
  user: UserLite;
  userId: string;
}

export interface FollowUp {
  id: string;
  dueAt: string;
  repeat: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
  status: "PENDING" | "DONE" | "CANCELLED";
  notes: string | null;
  assignedTo: UserLite;
  lead?: { id: string; name: string; mobile: string };
}

export interface FileUpload {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface LeadDetail extends Lead {
  createdBy: UserLite | null;
  activities: LeadActivity[];
  notes: LeadNote[];
  documents: Array<{ id: string; title: string | null; file: FileUpload; createdAt: string }>;
  followUps: FollowUp[];
  siteVisits: SiteVisit[];
  tasks: Task[];
  bookings: Booking[];
}

export interface Project {
  id: string;
  name: string;
  location: string | null;
  city: string | null;
  description: string | null;
  status: "UPCOMING" | "ACTIVE" | "COMPLETED";
  amenities: string[];
  nearby: Array<{ name: string; distance: string }> | null;
  priceMin: string | null;
  priceMax: string | null;
  files?: FileUpload[];
  _count?: { properties: number; leads: number };
  inventory?: Record<string, number>;
  properties?: Property[];
}

export interface Property {
  id: string;
  title: string;
  code: string;
  type: "PLOT" | "VILLA" | "APARTMENT" | "COMMERCIAL" | "FARMHOUSE";
  status: "AVAILABLE" | "HOLD" | "BOOKED" | "SOLD";
  facing: string | null;
  areaSqft: string | null;
  price: string;
  location: string | null;
  city: string | null;
  address: string | null;
  description: string | null;
  amenities: string[];
  project: { id: string; name: string } | null;
  projectId: string | null;
  images: FileUpload[];
  priceHistory?: Array<{ id: string; price: string; createdAt: string }>;
  _count?: { bookings: number; siteVisits: number };
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  address: string | null;
  city: string | null;
  lead: { id: string; name: string; status?: { name: string } } | null;
  bookings: Booking[];
  files?: FileUpload[];
  createdAt: string;
}

export interface SiteVisit {
  id: string;
  scheduledAt: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "RESCHEDULED";
  checkInAt: string | null;
  feedback: string | null;
  remarks: string | null;
  lead: { id: string; name: string; mobile: string };
  leadId: string;
  property: { id: string; title: string; code?: string } | null;
  project: { id: string; name: string } | null;
  assignedTo: UserLite;
  assignedToId: string;
}

export interface Booking {
  id: string;
  amount: string;
  tokenAmount: string | null;
  paymentPlan: string | null;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
  bookingDate: string;
  notes: string | null;
  lead: { id: string; name: string; mobile?: string };
  customer: { id: string; name: string } | null;
  property: { id: string; title: string; code: string; price?: string };
  createdBy: UserLite | null;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status: "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED";
  dueAt: string | null;
  repeat: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
  checklist: Array<{ text: string; done: boolean }> | null;
  assignedTo: UserLite | null;
  assignedToId: string | null;
  createdBy: UserLite;
  lead: { id: string; name: string } | null;
  comments?: Array<{ id: string; body: string; createdAt: string; user: UserLite }>;
  attachments?: FileUpload[];
  createdAt: string;
}

export interface TeamUser {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  designation: string | null;
  avatarUrl: string | null;
  salesTarget: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  role: { id: string; name: string };
  department: { id: string; name: string } | null;
  createdAt: string;
  stats?: {
    leads: number;
    siteVisits: number;
    bookings: number;
    monthRevenue: string;
    pendingTasks: number;
  };
}

export interface AttendanceRecord {
  id: string;
  date: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  status: "PRESENT" | "LATE" | "HALF_DAY" | "LEAVE" | "ABSENT";
  workMinutes: number | null;
  user?: {
    id: string;
    name: string;
    avatarUrl: string | null;
    designation: string | null;
    department: { name: string } | null;
  };
}

export interface Leave {
  id: string;
  fromDate: string;
  toDate: string;
  type: string;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  user: UserLite;
  approvedBy: UserLite | null;
  createdAt: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string | null;
  type: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface Integration {
  id: string;
  key: string;
  name: string;
  enabled: boolean;
  config: Record<string, unknown> | null;
}

export interface Template {
  id: string;
  name: string;
  type: "EMAIL" | "WHATSAPP";
  subject: string | null;
  body: string;
}
