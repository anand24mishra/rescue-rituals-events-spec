import type {
  Attendee,
  AuthResult,
  AuthUser,
  EventDraft,
  EventFilters,
  EventSummary,
  MyRsvp,
  Paginated,
  RsvpResult,
} from './types';

/**
 * In development this is empty, so requests go to `/api/...` on the Vite origin
 * and are proxied to the API. In a deployed build it is the API's origin.
 */
const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

const API_PREFIX = '/api/v1';

/**
 * An error carrying the API's own error code.
 *
 * The code is what the UI branches on — `EVENT_AT_CAPACITY` needs a different
 * message and a different affordance from `RSVP_ALREADY_EXISTS` — and the
 * server's `message` is written to be shown to a person, so it is used directly
 * rather than being re-worded here and drifting out of sync.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when retrying the same request could plausibly succeed. */
  get isRetryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

type TokenReader = () => string | null;

let readToken: TokenReader = () => null;

/** Lets AuthProvider own token storage without the client importing React. */
export function setTokenReader(reader: TokenReader): void {
  readToken = reader;
}

/** Called when the API reports the token is no longer valid. */
let onUnauthorized: () => void = () => {};

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Sent as `Idempotency-Key`, making a retry of this request safe. */
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Skip the bearer token even when one is available. */
  anonymous?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, idempotencyKey, signal, anonymous } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey !== undefined) headers['Idempotency-Key'] = idempotencyKey;

  const token = anonymous === true ? null : readToken();
  if (token !== null) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    // A network failure is not the same as an API rejection, and saying so is
    // more useful than "something went wrong".
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Could not reach the server. Check your connection and try again.',
    );
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload: unknown = text.length > 0 ? safeParse(text) : undefined;

  if (!response.ok) {
    const envelope = (payload ?? {}) as {
      code?: string;
      message?: string;
      details?: Record<string, unknown>;
      requestId?: string;
    };

    // 401 on an authenticated request means the stored token is no longer
    // usable; clearing it here stops every subsequent screen from failing the
    // same way.
    if (response.status === 401 && token !== null) onUnauthorized();

    throw new ApiError(
      response.status,
      envelope.code ?? 'UNKNOWN_ERROR',
      envelope.message ?? `Request failed with status ${response.status}`,
      envelope.details,
      envelope.requestId,
    );
  }

  return payload as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Serialises a flat object of query parameters, omitting empty values. */
function toQuery(filters: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query.length > 0 ? `?${query}` : '';
}

export const api = {
  register: (body: { name: string; email: string; password: string }) =>
    request<AuthResult>(`${API_PREFIX}/auth/register`, {
      method: 'POST',
      body,
      anonymous: true,
    }),

  login: (body: { email: string; password: string }) =>
    request<AuthResult>(`${API_PREFIX}/auth/login`, {
      method: 'POST',
      body,
      anonymous: true,
    }),

  me: (signal?: AbortSignal) =>
    request<AuthUser>(`${API_PREFIX}/auth/me`, { signal }),

  listEvents: (filters: EventFilters = {}, signal?: AbortSignal) =>
    request<Paginated<EventSummary>>(
      `${API_PREFIX}/events${toQuery({ ...filters })}`,
      { signal },
    ),

  getEvent: (id: string, signal?: AbortSignal) =>
    request<EventSummary>(`${API_PREFIX}/events/${id}`, { signal }),

  createEvent: (body: EventDraft) =>
    request<EventSummary>(`${API_PREFIX}/events`, { method: 'POST', body }),

  updateEvent: (id: string, body: Partial<EventDraft>) =>
    request<EventSummary>(`${API_PREFIX}/events/${id}`, {
      method: 'PATCH',
      body,
    }),

  deleteEvent: (id: string) =>
    request<void>(`${API_PREFIX}/events/${id}`, { method: 'DELETE' }),

  /**
   * An idempotency key is generated for every RSVP, not only for retries. The
   * point is that if the response is lost in transit, the user's retry — or a
   * double-click — resolves to the original outcome instead of a confusing
   * "you have already RSVP'd" for something they never saw succeed.
   */
  rsvp: (eventId: string, idempotencyKey: string = crypto.randomUUID()) =>
    request<RsvpResult>(`${API_PREFIX}/events/${eventId}/rsvp`, {
      method: 'POST',
      idempotencyKey,
    }),

  cancelRsvp: (eventId: string) =>
    request<void>(`${API_PREFIX}/events/${eventId}/rsvp`, { method: 'DELETE' }),

  /** The caller's own active RSVPs, with each event attached. */
  listMyRsvps: (
    params: { upcoming?: boolean; page?: number; limit?: number } = {},
    signal?: AbortSignal,
  ) =>
    request<Paginated<MyRsvp>>(`${API_PREFIX}/me/rsvps${toQuery({ ...params })}`, {
      signal,
    }),

  listAttendees: (
    eventId: string,
    params: { status?: 'CONFIRMED' | 'WAITLISTED'; page?: number; limit?: number } = {},
    signal?: AbortSignal,
  ) =>
    request<Paginated<Attendee>>(
      `${API_PREFIX}/events/${eventId}/attendees${toQuery(params)}`,
      { signal },
    ),

  health: (signal?: AbortSignal) =>
    request<{ status: string; database: string }>('/health', {
      signal,
      anonymous: true,
    }),
};
