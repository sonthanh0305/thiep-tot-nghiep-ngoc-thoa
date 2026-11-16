export type AttendanceStatus = 'attending' | 'after_ceremony' | 'remote_wish';

export interface RsvpEntry {
  id: string;
  guestName: string;
  invitedCardName?: string;
  submittedByRole?: 'admin' | 'guest';
  pronoun: string;
  relation: string;
  attendance: AttendanceStatus;
  partySize: number;
  message: string;
  createdAt: string;
}

export interface RsvpFormInput {
  guestName: string;
  pronoun: string;
  relation: string;
  attendance: AttendanceStatus;
  partySize: number;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: {
    guestName?: string;
    message?: string;
    partySize?: string;
  };
}

export interface CountdownBreakdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
  isPast: boolean;
  statusLabel: string;
}

export interface PhotoboothFrame {
  id: number;
  title: string;
  caption: string;
  timestampLabel: string;
  cropRatioY: [number, number];
  cropRatioX: [number, number];
  rotationDeg: number;
}

export interface ScheduleMilestone {
  time: string;
  title: string;
  location: string;
  description: string;
}
