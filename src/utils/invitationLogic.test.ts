import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_INVITED_GUEST_LIST,
  GRADUATION_INFO,
  INITIAL_RSVP_ENTRIES,
  buildPersonalizedShareUrl,
  calculateCountdown,
  canAccessHostLinkGenerator,
  computeRsvpStats,
  findRsvpForInvitedGuest,
  generateIcsCalendarContent,
  parseGuestListText,
  validateRsvpInput,
} from './invitationLogic';

test('GRADUATION_INFO matches poster, photobooth, and campus map assets accurately', () => {
  assert.equal(GRADUATION_INFO.graduateName, 'Trần Thị Ngọc Thoa');
  assert.equal(
    GRADUATION_INFO.universityName,
    'HỌC VIỆN CÔNG NGHỆ BƯU CHÍNH VIỄN THÔNG',
  );
  assert.equal(GRADUATION_INFO.dateDisplay, '01.12.2026');
  assert.equal(GRADUATION_INFO.timeDisplay, '11h30');
  assert.equal(GRADUATION_INFO.hallName, 'Hội trường A');
  assert.equal(GRADUATION_INFO.photoboothAssetPath, '/assets/aistudio/a_e8fec45a.jpg');
  assert.equal(GRADUATION_INFO.campusMapAssetPath, '/assets/aistudio/image_5c284f8d.png');
  assert.ok(DEFAULT_INVITED_GUEST_LIST.includes('Team tiếng Trung (ĐA, Bi)'));
  assert.ok(DEFAULT_INVITED_GUEST_LIST.includes('Team Danh, Linh Linh, TC'));
  assert.ok(DEFAULT_INVITED_GUEST_LIST.includes('Hội bạn Hồng Ngọc, Bảo, Vũ'));
  assert.equal(INITIAL_RSVP_ENTRIES.length, 0);
});

test('calculateCountdown returns accurate remaining days, hours, minutes, seconds', () => {
  const targetMs = Date.parse('2026-12-01T11:30:00+07:00');
  const oneDayTwoHoursBefore =
    targetMs - (1 * 86400 + 2 * 3600 + 15 * 60 + 30) * 1000;

  const result = calculateCountdown(oneDayTwoHoursBefore, targetMs);
  assert.equal(result.isPast, false);
  assert.equal(result.days, 1);
  assert.equal(result.hours, 2);
  assert.equal(result.minutes, 15);
  assert.equal(result.seconds, 30);
});

test('calculateCountdown handles past timestamps gracefully', () => {
  const targetMs = Date.parse('2026-12-01T11:30:00+07:00');
  const afterCeremony = targetMs + 60_000;

  const result = calculateCountdown(afterCeremony, targetMs);
  assert.equal(result.isPast, true);
  assert.equal(result.days, 0);
  assert.equal(result.totalSeconds, 0);
});

test('validateRsvpInput rejects empty guestName or short message and accepts valid input', () => {
  const invalidEmpty = validateRsvpInput({
    guestName: ' ',
    pronoun: '',
    relation: 'Bạn bè',
    attendance: 'attending',
    partySize: 1,
    message: 'Hi',
  });
  assert.equal(invalidEmpty.valid, false);
  assert.ok(invalidEmpty.errors.guestName);
  assert.ok(invalidEmpty.errors.message);

  const valid = validateRsvpInput({
    guestName: 'Khách Mời A',
    pronoun: '',
    relation: 'Bạn cùng lớp',
    attendance: 'attending',
    partySize: 2,
    message: 'Chúc mừng Ngọc Thoa tốt nghiệp rực rỡ nhé!',
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.errors, {});
});

test('computeRsvpStats aggregates attending guests and remote wishes accurately', () => {
  const stats = computeRsvpStats([
    {
      id: '1',
      guestName: 'Gia đình',
      pronoun: '',
      relation: 'Người thân',
      attendance: 'attending',
      partySize: 3,
      message: 'Chúc mừng tốt nghiệp!',
      createdAt: '16.11.2026',
    },
    {
      id: '2',
      guestName: 'Bạn bè',
      pronoun: '',
      relation: 'Bạn học',
      attendance: 'remote_wish',
      partySize: 1,
      message: 'Chúc mừng bạn!',
      createdAt: '16.11.2026',
    },
  ]);
  assert.equal(stats.totalResponses, 2);
  assert.equal(stats.attendingCeremonyCount, 1);
  assert.equal(stats.totalExpectedGuests, 3);
  assert.equal(stats.remoteWishesCount, 1);
});

test('canAccessHostLinkGenerator blocks admin link creation when guest param is present', () => {
  assert.equal(canAccessHostLinkGenerator('https://example.com/'), true);
  assert.equal(canAccessHostLinkGenerator(''), true);
  assert.equal(
    canAccessHostLinkGenerator('https://example.com/?guest=Khach+Moi'),
    false,
  );
  assert.equal(
    canAccessHostLinkGenerator('?guest=Khach+Moi&admin=1'),
    true,
  );
});

test('buildPersonalizedShareUrl strips admin/pronoun and embeds only guest name', () => {
  const url = buildPersonalizedShareUrl(
    'https://example.com/?admin=1&autostart=1&pronoun=Anh',
    'Gia đình',
  );
  assert.ok(url.includes('guest=Gia+%C4%91%C3%ACnh'));
  assert.ok(!url.includes('admin='));
  assert.ok(!url.includes('pronoun='));
  assert.ok(!url.includes('autostart='));
  assert.equal(canAccessHostLinkGenerator(url), false);

  const fallbackGuestUrl = buildPersonalizedShareUrl(
    'https://example.com/',
    '',
  );
  assert.ok(fallbackGuestUrl.includes('guest='));
  assert.equal(canAccessHostLinkGenerator(fallbackGuestUrl), false);

  const ics = generateIcsCalendarContent('Gia đình');
  assert.ok(ics.includes('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('Hội trường A'));
});

test('parseGuestListText splits strictly by line and preserves commas and parentheses on the same line', () => {
  const raw = [
    'Anh Vũ, chị Trinh',
    'Trà My, Ngọc Nhi, Thành, Hằng',
    'Team tiếng Trung (ĐA, Bi)',
    'Team Danh, Linh Linh, TC',
    'Hội bạn Hồng Ngọc, Bảo, Vũ',
  ].join('\n');
  const names = parseGuestListText(raw);
  assert.deepEqual(names, [
    'Anh Vũ, chị Trinh',
    'Trà My, Ngọc Nhi, Thành, Hằng',
    'Team tiếng Trung (ĐA, Bi)',
    'Team Danh, Linh Linh, TC',
    'Hội bạn Hồng Ngọc, Bảo, Vũ',
  ]);
});

test('findRsvpForInvitedGuest binds guest RSVP entries to the invited guest list item', () => {
  const entries = [
    {
      id: 'w-1',
      guestName: 'Bi (Team tiếng Trung)',
      invitedCardName: 'Team tiếng Trung (ĐA, Bi)',
      submittedByRole: 'guest' as const,
      pronoun: '',
      relation: 'Đồng nghiệp',
      attendance: 'attending' as const,
      partySize: 2,
      message: 'Tụi mình sẽ qua đúng 11h30 nhé!',
      createdAt: '10:30',
    },
  ];
  const matched = findRsvpForInvitedGuest('Team tiếng Trung (ĐA, Bi)', entries);
  assert.ok(matched);
  assert.equal(matched?.attendance, 'attending');
  assert.equal(findRsvpForInvitedGuest('Bác Nhân', entries), undefined);
});
