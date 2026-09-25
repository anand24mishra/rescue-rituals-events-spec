/** Mirrors the API contract. See docs/API_SPEC.md and the live /docs page. */

export type EventType =
  | 'ADOPTION_EVENT'
  | 'RESCUE_FAIR'
  | 'FOSTER_WORKSHOP'
  | 'VOLUNTEER_EVENT'
  | 'COMMUNITY_MEETUP'
  | 'OTHER';

export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';

export type RsvpStatus = 'CONFIRMED' | 'WAITLISTED' | 'CANCELLED';

export interface ViewerRsvp {
  status: RsvpStatus;
  waitlistPosition: number | null;
}

export interface EventSummary {
  id: string;
  title: string;
  description: string;
  eventType: EventType;
  status: EventStatus;
  location: string;
  startsAt: string;
  endsAt: string;
  timezone: string | null;
  capacity: number | null;
  confirmedCount: number;
  spotsRemaining: number | null;
  isFull: boolean;
  waitlistEnabled: boolean;
  createdById: string;
  organiser?: { id: string; name: string };
  /** Absent for an anonymous request; null when signed in with no RSVP. */
  viewerRsvp?: ViewerRsvp | null;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface AuthResult {
  user: AuthUser;
  accessToken: string;
  expiresIn: number;
}

export interface Attendee {
  userId: string;
  name: string;
  status: RsvpStatus;
  rsvpedAt: string;
  waitlistPosition: number | null;
}

export interface RsvpResult {
  eventId: string;
  userId: string;
  status: RsvpStatus;
  confirmedCount: number;
  capacity: number | null;
  waitlistPosition: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventDraft {
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  eventType?: EventType;
  status?: EventStatus;
  timezone?: string | null;
  capacity?: number | null;
  waitlistEnabled?: boolean;
}

export interface EventFilters {
  page?: number;
  limit?: number;
  upcoming?: boolean;
  location?: string;
  search?: string;
  eventType?: EventType;
  status?: EventStatus;
  createdById?: string;
}

/** One of the caller's own RSVPs, with the event it belongs to. */
export interface MyRsvp {
  event: EventSummary;
  status: RsvpStatus;
  waitlistPosition: number | null;
  rsvpedAt: string;
}
