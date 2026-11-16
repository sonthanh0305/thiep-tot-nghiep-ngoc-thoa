import type {
  AttendanceStatus,
  CountdownBreakdown,
  PhotoboothFrame,
  RsvpEntry,
  RsvpFormInput,
  ScheduleMilestone,
  ValidationResult,
} from '../types';

export const GRADUATION_INFO = {
  graduateName: 'Trần Thị Ngọc Thoa',
  ceremonyTitle: 'Lễ Tốt Nghiệp 2026',
  englishHeader: 'GRADUATION',
  greetingText: 'Chúc mừng tốt nghiệp!',
  universityName: 'HỌC VIỆN CÔNG NGHỆ BƯU CHÍNH VIỄN THÔNG',
  universityShort: 'PTIT TP.HCM',
  dateDisplay: '01.12.2026',
  timeDisplay: '11h30',
  isoTargetDate: '2026-12-01T11:30:00+07:00',
  targetTimestampMs: Date.parse('2026-12-01T11:30:00+07:00'),
  hallName: 'Hội trường A',
  addressLine: '97 Man Thiện, Tăng Nhơn Phú, TPHCM',
  fullVenueAddress:
    'Hội trường A — Học viện Công nghệ Bưu chính Viễn thông, 97 Man Thiện, Tăng Nhơn Phú, TP. Thủ Đức, TP.HCM',
  googleMapsUrl:
    'https://www.google.com/maps/search/?api=1&query=97+Man+Thien+Tang+Nhon+Phu+TPHCM+Hoc+Vien+Cong+Nghe+Buu+Chinh+Vien+Thong',
  posterAssetPath: '/assets/aistudio/Untitled_Design__1__9d6c8672.png',
  photoboothAssetPath: '/assets/aistudio/a_e8fec45a.jpg',
  campusMapAssetPath: '/assets/aistudio/image_5c284f8d.png',
  contactPhone: '0909 261 226',
} as const;

export const DEFAULT_INVITED_GUEST_LIST: string[] = [
  'Bố mẹ iu',
  'Anh iu',
  'Em trai và người ấy',
  'Bác Nhân',
  'Anh chị Thắng Lan',
  'Chị Hằng',
  'Anh chị Bình Hiệp',
  'Các cháu của o/dì',
  'Đình Phước',
  'Thành Đạt',
  'Team Kế toán Seagull',
  'Anh Vũ, chị Trinh',
  'Trà My, Ngọc Nhi, Thành, Hằng',
  'Trần Thành',
  'Trần Hằng',
  'Tấn Đạt và người ấy',
  'Team tiếng Trung (ĐA, Bi)',
  'Team Danh, Linh Linh, TC',
  'Hội bạn Hồng Ngọc, Bảo, Vũ',
  'Anh Phạm Hưng',
  'Quỳnh Trang',
  'Phương Trang',
];

export const CEREMONY_SCHEDULE: ScheduleMilestone[] = [
  {
    time: '11:00',
    title: 'Đón khách & Chụp hình tại Sảnh Hội trường A',
    location: '97 Man Thiện, Tăng Nhơn Phú, TP.HCM',
    description:
      'Gặp gỡ gia đình, bạn bè và lưu lại những khung hình kỷ niệm tại khuôn viên trường.',
  },
  {
    time: '11:30',
    title: 'Lễ Tốt Nghiệp & Trao Bằng Cử Nhân',
    location: 'Hội trường A — PTIT TP.HCM',
    description:
      'Nghi thức trao bằng tốt nghiệp chính thức của Trần Thị Ngọc Thoa.',
  },
  {
    time: '12:15',
    title: 'Giao lưu & Chụp ảnh Lưu niệm sau buổi lễ',
    location: 'Khu vực Sân trường & Hội trường A',
    description:
      'Chung vui cùng Ngọc Thoa và lưu giữ kỷ niệm ngày ra trường.',
  },
];

export const PHOTOBOOTH_FRAMES: PhotoboothFrame[] = [
  {
    id: 1,
    title: 'Khung 01 · Lễ Phục Cử Nhân',
    caption: 'Khoảnh khắc khoác lễ phục tốt nghiệp năm 2026.',
    timestampLabel: 'MEMORIES · 01',
    cropRatioX: [0.042, 0.946],
    cropRatioY: [0.018, 0.244],
    rotationDeg: 0,
  },
  {
    id: 2,
    title: 'Khung 02 · Chào Cột Mốc Mới',
    caption: 'Sẵn sàng cho hành trình mới phía trước.',
    timestampLabel: '2026 · 02',
    cropRatioX: [0.042, 0.946],
    cropRatioY: [0.264, 0.491],
    rotationDeg: 0,
  },
  {
    id: 3,
    title: 'Khung 03 · Kỷ Niệm Ngày Ra Trường',
    caption: 'Khép lại chặng đường đại học đáng nhớ.',
    timestampLabel: 'PHOTO TIME · 03',
    cropRatioX: [0.042, 0.946],
    cropRatioY: [0.511, 0.738],
    rotationDeg: 0,
  },
  {
    id: 4,
    title: 'Khung 04 · Rạng Rỡ Ngày Tốt Nghiệp',
    caption: 'Hẹn gặp tại Hội trường A lúc 11h30 ngày 01.12.2026.',
    timestampLabel: 'MEMORIES · 04',
    cropRatioX: [0.042, 0.946],
    cropRatioY: [0.758, 0.985],
    rotationDeg: 0,
  },
];

export const QUICK_WISH_TEMPLATES: string[] = [
  'Chúc mừng Ngọc Thoa tốt nghiệp! Chúc bạn luôn rạng rỡ và gặt hái nhiều thành công trên chặng đường mới.',
  'Chúc Tân cử nhân Trần Thị Ngọc Thoa công việc thuận lợi, vạn sự hanh thông và luôn giữ nụ cười thật tươi!',
  'Hẹn gặp Ngọc Thoa lúc 11h30 ngày 01.12.2026 tại Hội trường A để chung vui nhé!',
];

export const INITIAL_RSVP_ENTRIES: RsvpEntry[] = [];

export function canAccessHostLinkGenerator(
  searchOrUrl: string | URLSearchParams,
): boolean {
  let params: URLSearchParams;
  if (typeof searchOrUrl === 'string') {
    const queryIndex = searchOrUrl.indexOf('?');
    const queryString =
      queryIndex >= 0
        ? searchOrUrl.slice(queryIndex)
        : searchOrUrl.startsWith('guest=') || searchOrUrl.includes('=')
          ? searchOrUrl
          : '';
    params = new URLSearchParams(queryString);
  } else {
    params = searchOrUrl;
  }

  const guestParam = (params.get('guest') ?? '').trim();
  const adminParam = (params.get('admin') ?? '').trim();

  if (guestParam.length > 0 && adminParam !== '1' && adminParam !== 'true') {
    return false;
  }

  return true;
}

/**
 * Tách danh sách tên khách mời chuẩn theo từng dòng (`\r?\n`).
 * Giữ nguyên dấu phẩy `,` và dấu ngoặc `()` trên cùng một dòng (ví dụ: "Team tiếng Trung (ĐA, Bi)").
 */
export function parseGuestListText(rawText: string): string[] {
  const parts = rawText
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const name of parts) {
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(name);
    }
  }
  return unique;
}

export function calculateCountdown(
  nowMs: number,
  targetMs: number = GRADUATION_INFO.targetTimestampMs,
): CountdownBreakdown {
  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      totalSeconds: 0,
      isPast: true,
      statusLabel: 'Lễ tốt nghiệp đang diễn ra tại Hội trường A',
    };
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    days,
    hours,
    minutes,
    seconds,
    totalSeconds,
    isPast: false,
    statusLabel: `Còn ${days} ngày ${hours} giờ tới Lễ Tốt Nghiệp`,
  };
}

export function validateRsvpInput(input: RsvpFormInput): ValidationResult {
  const errors: ValidationResult['errors'] = {};
  const trimmedName = (input.guestName ?? '').trim();
  const trimmedMessage = (input.message ?? '').trim();

  if (!trimmedName) {
    errors.guestName = 'Vui lòng nhập tên của bạn.';
  } else if (trimmedName.length < 2) {
    errors.guestName = 'Tên cần có ít nhất 2 ký tự.';
  }

  if (!trimmedMessage) {
    errors.message = 'Hãy viết đôi lời nhắn gửi tới Ngọc Thoa nhé.';
  } else if (trimmedMessage.length < 4) {
    errors.message = 'Lời chúc cần có ít nhất 4 ký tự.';
  }

  if (
    !Number.isFinite(input.partySize) ||
    input.partySize < 1 ||
    input.partySize > 10
  ) {
    errors.partySize = 'Số lượng người tham dự từ 1 đến 10.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function computeRsvpStats(entries: RsvpEntry[]): {
  totalResponses: number;
  attendingCeremonyCount: number;
  totalExpectedGuests: number;
  remoteWishesCount: number;
} {
  let attendingCeremonyCount = 0;
  let totalExpectedGuests = 0;
  let remoteWishesCount = 0;

  for (const entry of entries) {
    if (entry.attendance === 'attending' || entry.attendance === 'after_ceremony') {
      attendingCeremonyCount += 1;
      totalExpectedGuests += Math.max(1, entry.partySize || 1);
    } else {
      remoteWishesCount += 1;
    }
  }

  return {
    totalResponses: entries.length,
    attendingCeremonyCount,
    totalExpectedGuests,
    remoteWishesCount,
  };
}

export function formatAttendanceLabel(status: AttendanceStatus): string {
  switch (status) {
    case 'attending':
      return 'Tham dự lúc 11h30 tại Hội trường A';
    case 'after_ceremony':
      return 'Ghé chụp hình lúc 12h15';
    case 'remote_wish':
      return 'Gửi lời chúc từ xa';
  }
}

export function findRsvpForInvitedGuest(
  invitedName: string,
  entries: RsvpEntry[],
): RsvpEntry | undefined {
  const target = invitedName.trim().toLowerCase();
  if (!target) return undefined;

  return entries.find((entry) => {
    const cardKey = (entry.invitedCardName ?? '').trim().toLowerCase();
    const guestKey = (entry.guestName ?? '').trim().toLowerCase();
    return (
      cardKey === target ||
      guestKey === target ||
      guestKey.includes(target) ||
      target.includes(guestKey)
    );
  });
}

export function buildPersonalizedShareUrl(
  baseUrl: string,
  guestName: string,
): string {
  try {
    const url = new URL(baseUrl);
    const cleanName = guestName.trim();
    url.searchParams.delete('autostart');
    url.searchParams.delete('pronoun');
    url.searchParams.delete('admin');
    if (cleanName) {
      url.searchParams.set('guest', cleanName);
    } else {
      url.searchParams.delete('guest');
    }
    return url.toString();
  } catch {
    const encoded = encodeURIComponent(guestName.trim());
    return encoded ? `${baseUrl}?guest=${encoded}` : baseUrl;
  }
}

export function generateIcsCalendarContent(guestName: string = 'Bạn'): string {
  const cleanGuest = guestName.trim() || 'Bạn';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tran Thi Ngoc Thoa Graduation//PTIT 2026//VI',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:graduation-tran-thi-ngoc-thoa-20261201@ptit.edu.vn',
    'DTSTAMP:20261115T120000Z',
    'DTSTART:20261201T043000Z',
    'DTEND:20261201T063000Z',
    `SUMMARY:Lễ Tốt Nghiệp Trần Thị Ngọc Thoa (${cleanGuest})`,
    'LOCATION:Hội trường A - Học viện Công nghệ Bưu chính Viễn thông\\, 97 Man Thiện\\, Tăng Nhơn Phú\\, TPHCM',
    `DESCRIPTION:Trân trọng kính mời ${cleanGuest} tới dự Lễ Tốt Nghiệp của Trần Thị Ngọc Thoa lúc 11h30 ngày 01.12.2026 tại Hội trường A\\, 97 Man Thiện\\, Tăng Nhơn Phú\\, TPHCM.`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}
