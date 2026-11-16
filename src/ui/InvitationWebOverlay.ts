import type { AttendanceStatus, RsvpEntry } from '../types';
import {
  DEFAULT_INVITED_GUEST_LIST,
  GRADUATION_INFO,
  PHOTOBOOTH_FRAMES,
  canAccessHostLinkGenerator,
  parseGuestListText,
  calculateCountdown,
  buildPersonalizedShareUrl,
  generateIcsCalendarContent,
  formatAttendanceLabel,
} from '../utils/invitationLogic';
import {
  renderPersonalizedPosterToCanvas,
  extractPhotoboothFrameDataUrls,
} from '../utils/posterRenderer';
import {
  loadGraduationDatabase,
  saveGraduationDatabase,
  exportDatabaseAsJsonFile,
} from '../services/jsonDatabase';
import { soundEngine } from '../utils/soundEffects';

const THEME_STORAGE_KEY = 'ngoc_thoa_grad_theme';

export class InvitationWebOverlay {
  private container: HTMLElement;

  private isEnvelopeOpened = false;
  private isOpeningAnimation = false;
  private theme: 'light' | 'dark' = 'light';
  private guestName = 'Quý khách';
  private isAdminMode = true;
  private invitedGuestList: string[] = [...DEFAULT_INVITED_GUEST_LIST];
  private rsvpEntries: RsvpEntry[] = [];
  private countdownTimerId: number | null = null;
  private posterCanvas: HTMLCanvasElement;
  private posterPreviewDataUrl: string = GRADUATION_INFO.posterAssetPath;
  private photoboothThumbs: Map<number, string> = new Map();
  private toastTimeoutId: number | null = null;

  constructor() {
    this.posterCanvas = document.createElement('canvas');

    const root = document.getElementById('root') || document.body;
    this.container = document.createElement('div');
    this.container.id = 'graduation-app-shell';
    root.appendChild(this.container);

    try {
      const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme === 'dark' || savedTheme === 'light') {
        this.theme = savedTheme;
      }
    } catch {
      // Ignore
    }
    this.applyThemeToDocument();

    const params = new URLSearchParams(window.location.search);
    const urlGuest = (params.get('guest') ?? '').trim();
    if (urlGuest.length > 0) {
      this.guestName = urlGuest;
    }
    this.isAdminMode = canAccessHostLinkGenerator(window.location.search);

    if (params.get('autostart') === '1' || params.get('open') === '1') {
      this.isEnvelopeOpened = true;
    }

    this.render();
    this.startCountdownLoop();
    void this.initializeDataAndAssets();
  }

  private applyThemeToDocument(): void {
    document.documentElement.setAttribute('data-theme', this.theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, this.theme);
    } catch {
      // Ignore
    }
  }

  private toggleTheme(): void {
    soundEngine.playSoftClick();
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    this.applyThemeToDocument();
    this.render();
  }

  private async initializeDataAndAssets(): Promise<void> {
    try {
      const db = await loadGraduationDatabase();
      // Repair any legacy comma-split fragments ("Team tiếng Trung (ĐA" / "Bi)") if present
      const hasLegacyBrokenFragment = db.guestList.some(
        (item) => item === 'Team tiếng Trung (ĐA' || item === 'Bi)',
      );
      if (db.guestList.length === 0 || hasLegacyBrokenFragment) {
        this.invitedGuestList = [...DEFAULT_INVITED_GUEST_LIST];
        await this.persistDatabase();
      } else {
        this.invitedGuestList = db.guestList;
      }
      this.rsvpEntries = db.rsvpEntries;
      this.render();
    } catch {
      // Fallback handled inside jsonDatabase
    }

    await this.refreshPersonalizedPosterPreview();

    try {
      this.photoboothThumbs = await extractPhotoboothFrameDataUrls();
      this.updatePhotoboothThumbnailsInDom();
    } catch {
      // Fallback uses photobooth strip image
    }
  }

  private async persistDatabase(): Promise<void> {
    await saveGraduationDatabase({
      guestList: this.invitedGuestList,
      rsvpEntries: this.rsvpEntries,
      updatedAt: new Date().toISOString(),
    });
  }

  private async refreshPersonalizedPosterPreview(): Promise<void> {
    try {
      const dataUrl = await renderPersonalizedPosterToCanvas(
        this.posterCanvas,
        this.guestName,
      );
      if (dataUrl) {
        this.posterPreviewDataUrl = dataUrl;
      }
      const previewImg = document.getElementById(
        'live-poster-preview-img',
      ) as HTMLImageElement | null;
      if (previewImg && this.posterPreviewDataUrl) {
        previewImg.src = this.posterPreviewDataUrl;
      }
      const envPreviewImg = document.getElementById(
        'envelope-card-preview-img',
      ) as HTMLImageElement | null;
      if (envPreviewImg && this.posterPreviewDataUrl) {
        envPreviewImg.src = this.posterPreviewDataUrl;
      }
    } catch {
      // Keep original poster path on error
    }
  }

  private updatePhotoboothThumbnailsInDom(): void {
    for (const frame of PHOTOBOOTH_FRAMES) {
      const url = this.photoboothThumbs.get(frame.id);
      const img = document.getElementById(
        `photobooth-thumb-${frame.id}`,
      ) as HTMLImageElement | null;
      if (img && url) {
        img.src = url;
      }
    }
  }

  private startCountdownLoop(): void {
    if (this.countdownTimerId !== null) {
      window.clearInterval(this.countdownTimerId);
    }
    this.countdownTimerId = window.setInterval(() => {
      this.updateCountdownDom();
    }, 1000);
  }

  private updateCountdownDom(): void {
    const parts = calculateCountdown(Date.now());
    const dEl = document.getElementById('cd-days');
    const hEl = document.getElementById('cd-hours');
    const mEl = document.getElementById('cd-minutes');
    const sEl = document.getElementById('cd-seconds');

    if (dEl) dEl.textContent = String(parts.days).padStart(2, '0');
    if (hEl) hEl.textContent = String(parts.hours).padStart(2, '0');
    if (mEl) mEl.textContent = String(parts.minutes).padStart(2, '0');
    if (sEl) sEl.textContent = String(parts.seconds).padStart(2, '0');
  }

  public openPhotoInspectModal(frameId: number): void {
    const modal = document.getElementById('photo-lightbox-modal');
    const modalImg = document.getElementById(
      'photo-lightbox-img',
    ) as HTMLImageElement | null;
    const modalCaption = document.getElementById('photo-lightbox-caption');
    const modalBadge = document.getElementById('photo-lightbox-badge');

    const frame =
      PHOTOBOOTH_FRAMES.find((f) => f.id === frameId) || PHOTOBOOTH_FRAMES[0];
    if (modal && modalImg && modalCaption && modalBadge) {
      modalImg.src =
        this.photoboothThumbs.get(frame.id) ||
        GRADUATION_INFO.photoboothAssetPath;
      modalCaption.textContent = frame.caption;
      modalBadge.textContent = `${frame.timestampLabel} • ${frame.title}`;
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  }

  public openOriginalMapModal(): void {
    const modal = document.getElementById('photo-lightbox-modal');
    const modalImg = document.getElementById(
      'photo-lightbox-img',
    ) as HTMLImageElement | null;
    const modalCaption = document.getElementById('photo-lightbox-caption');
    const modalBadge = document.getElementById('photo-lightbox-badge');

    if (modal && modalImg && modalCaption && modalBadge) {
      modalImg.src = GRADUATION_INFO.campusMapAssetPath;
      modalBadge.textContent = 'BẢN ĐỒ PTIT TP.HCM — 97 MAN THIỆN';
      modalCaption.textContent =
        'Bước vào Cổng chính (97 Man Thiện) rồi rẽ tay phải là tới ngay nguyên khu Hội Trường A (HTA) to đùng và bãi Giữ xe bên phải.';
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  }

  private showToast(message: string): void {
    const toast = document.getElementById('graduation-toast');
    const toastText = document.getElementById('graduation-toast-text');
    if (!toast || !toastText) return;

    toastText.textContent = message;
    toast.classList.remove('hidden');
    toast.classList.add('flex');

    if (this.toastTimeoutId !== null) {
      window.clearTimeout(this.toastTimeoutId);
    }
    this.toastTimeoutId = window.setTimeout(() => {
      toast.classList.add('hidden');
      toast.classList.remove('flex');
    }, 2600);
  }

  private triggerEnvelopeOpeningSequence(): void {
    if (this.isOpeningAnimation || this.isEnvelopeOpened) return;
    this.isOpeningAnimation = true;
    soundEngine.playEnvelopeOpenChime();

    const stage = document.getElementById('envelope-opening-stage');
    stage?.classList.add('is-opening');

    window.setTimeout(() => {
      stage?.classList.add('stage-fade-out');
      window.setTimeout(() => {
        this.isEnvelopeOpened = true;
        this.isOpeningAnimation = false;
        this.render();
      }, 320);
    }, 1060);
  }

  /**
   * Renders a crisp, hand-crafted SVG illustration of the PTIT HCM Campus Map
   * modeled after the user's reference map (`/assets/aistudio/image_5c284f8d.png`),
   * prominently highlighting the large HTA (Khu Hội Trường A) complex on the right
   * when entering the Main Gate and turning right.
   */
  private renderPtitCampusMapIllustration(): string {
    return `
      <div class="rounded-2xl theme-card-subtle p-4 sm:p-5 mt-3">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div class="flex items-center gap-2.5">
            <span class="text-lg">🗺️</span>
            <div>
              <h4 class="text-sm sm:text-base font-bold theme-text-primary">
                Sơ Đồ Khuôn Viên PTIT TP.HCM — Chỉ Dẫn Khu Hội Trường A (HTA)
              </h4>
              <p class="text-xs theme-text-secondary">
                Bước vào <strong>Cổng chính (97 Man Thiện)</strong> rồi <strong>rẽ tay phải</strong> là tới ngay nguyên khu <strong>Hội Trường A (HTA)</strong> lớn và bãi <strong>Giữ xe</strong> bên phải
              </p>
            </div>
          </div>
          <button type="button"
                  id="btn-view-original-map"
                  class="btn-secondary px-3 py-1.5 rounded-xl text-xs cursor-pointer shrink-0">
            🔍 Xem ảnh bản đồ gốc
          </button>
        </div>

        <!-- Illustrated PTIT HCM Vector Map -->
        <div class="w-full rounded-xl overflow-hidden border border-theme" style="background-color: #7ea39c;">
          <svg viewBox="0 0 680 420" class="w-full h-auto block select-none" role="img" aria-label="Bản đồ PTIT HCM - Khu Hội Trường A (HTA) bên phải cổng chính">
            <!-- Sage-Teal Campus Background -->
            <rect width="680" height="420" fill="#7ea39c" />

            <!-- Top Title Pill: BẢN ĐỒ PTIT HCM -->
            <g transform="translate(185, 8)">
              <rect x="0" y="0" width="310" height="34" rx="17" fill="#ffffff" />
              <text x="155" y="23" text-anchor="middle" fill="#4f5bd5" font-family="Plus Jakarta Sans, sans-serif" font-weight="800" font-size="18" letter-spacing="1.5">
                BẢN ĐỒ PTIT HCM
              </text>
            </g>

            <!-- LEFT BLOCK: KTX (M, N, P, K, BC), Y Tế, Q, H, and Building E -->
            <g transform="translate(20, 50)">
              <rect x="0" y="0" width="160" height="218" rx="4" fill="#ffffff" />
              <!-- KTX Pink U-shape -->
              <rect x="8" y="8" width="144" height="14" fill="#ec6b9e" />
              <rect x="8" y="22" width="15" height="80" fill="#ec6b9e" />
              <rect x="137" y="22" width="15" height="80" fill="#ec6b9e" />
              <rect x="8" y="88" width="62" height="14" fill="#ec6b9e" />
              <rect x="92" y="88" width="60" height="14" fill="#ec6b9e" />
              <!-- BC Green Square -->
              <rect x="34" y="34" width="42" height="34" fill="#7cf365" />
              <text x="55" y="55" text-anchor="middle" fill="#3a5a40" font-size="11" font-weight="700">BC</text>

              <!-- Node Badges N, M, P, K -->
              <circle cx="80" cy="12" r="10" fill="#9e9b98" />
              <text x="80" y="16" text-anchor="middle" fill="#fff" font-size="9.5" font-weight="700">N</text>
              <circle cx="15" cy="56" r="10" fill="#9e9b98" />
              <text x="15" y="60" text-anchor="middle" fill="#fff" font-size="9.5" font-weight="700">M</text>
              <circle cx="145" cy="52" r="10" fill="#9e9b98" />
              <text x="145" y="56" text-anchor="middle" fill="#fff" font-size="9.5" font-weight="700">P</text>
              <circle cx="104" cy="94" r="10" fill="#9e9b98" />
              <text x="104" y="98" text-anchor="middle" fill="#fff" font-size="9.5" font-weight="700">K</text>

              <!-- Y tế Red Box -->
              <rect x="44" y="120" width="24" height="22" fill="#c92a2a" />
              <text x="56" y="135" text-anchor="middle" fill="#fff" font-size="8" font-weight="700">Y tế</text>

              <!-- Q & H Blue KTX Bars -->
              <rect x="6" y="154" width="72" height="16" fill="#38a3f1" />
              <circle cx="42" cy="162" r="10" fill="#9e9b98" />
              <text x="42" y="166" text-anchor="middle" fill="#fff" font-size="9.5" font-weight="700">Q</text>

              <rect x="6" y="194" width="72" height="16" fill="#38a3f1" />
              <circle cx="42" cy="202" r="10" fill="#9e9b98" />
              <text x="42" y="206" text-anchor="middle" fill="#fff" font-size="9.5" font-weight="700">H</text>

              <!-- Building E (Orange Vertical Block) -->
              <rect x="90" y="112" width="64" height="100" fill="#f7a941" />
              <circle cx="122" cy="162" r="13" fill="#9e9b98" />
              <text x="122" y="166" text-anchor="middle" fill="#fff" font-size="11" font-weight="700">E</text>
            </g>

            <!-- TOP-CENTER BLOCK: Căn tin, BĐ, HTD, and Khu I / I6 -->
            <g transform="translate(190, 50)">
              <rect x="0" y="0" width="310" height="86" rx="4" fill="#ffffff" />
              <!-- Căn tin Yellow -->
              <rect x="6" y="6" width="126" height="74" fill="#fff352" />
              <text x="44" y="34" text-anchor="middle" fill="#5c5346" font-size="14" font-weight="700">Căn tin</text>
              <!-- BĐ Green -->
              <rect x="84" y="6" width="46" height="38" fill="#7cf365" stroke="#fff" stroke-width="2" />
              <text x="107" y="29" text-anchor="middle" fill="#495057" font-size="12" font-weight="700">BĐ</text>
              <!-- HTD Circle -->
              <circle cx="28" cy="68" r="15" fill="#9e9b98" />
              <text x="28" y="72" text-anchor="middle" fill="#fff" font-size="9.5" font-weight="700">HTD</text>

              <!-- Khu I Blue -->
              <rect x="134" y="6" width="170" height="74" fill="#38a3f1" />
              <circle cx="218" cy="38" r="12" fill="#9e9b98" />
              <text x="218" y="42" text-anchor="middle" fill="#fff" font-size="11" font-weight="700">I</text>
              <rect x="248" y="56" width="30" height="20" fill="#7950f2" stroke="#fff" stroke-width="1.5" />
              <text x="263" y="70" text-anchor="middle" fill="#fff" font-size="9.5" font-weight="700">I6</text>
            </g>

            <!-- TOP-RIGHT BLOCK: Khu J -->
            <g transform="translate(510, 50)">
              <rect x="0" y="0" width="66" height="86" rx="4" fill="#ffffff" />
              <rect x="6" y="6" width="54" height="37" fill="#38a3f1" />
              <rect x="6" y="43" width="54" height="37" fill="#ec6b9e" />
              <circle cx="33" cy="43" r="11" fill="#9e9b98" />
              <text x="33" y="47" text-anchor="middle" fill="#fff" font-size="10.5" font-weight="700">J</text>
            </g>

            <!-- MIDDLE GREEN PARK: KHUÔN VIÊN -->
            <g transform="translate(222, 144)">
              <rect x="0" y="0" width="354" height="48" rx="4" fill="#ffffff" />
              <rect x="5" y="5" width="344" height="38" fill="#46b937" />
              <text x="150" y="29" text-anchor="middle" fill="#ffffff" font-size="15" font-weight="700">khuôn viên 🌳</text>
            </g>

            <!-- CENTER BLOCK: DÃY PHÒNG HỌC A & THÁP A -->
            <g transform="translate(190, 200)">
              <rect x="0" y="0" width="234" height="54" rx="4" fill="#ffffff" />
              <rect x="5" y="5" width="224" height="44" rx="2" fill="#f7a941" />

              <!-- Photocopy Badge -->
              <circle cx="22" cy="22" r="17" fill="#8d8a87" />
              <text x="22" y="19" text-anchor="middle" fill="#fff" font-size="8.5" font-weight="700">Photo</text>
              <text x="22" y="29" text-anchor="middle" fill="#fff" font-size="8.5" font-weight="700">copy</text>

              <!-- Tháp A Red Icon -->
              <circle cx="74" cy="22" r="13" fill="#d92b2b" stroke="#fff" stroke-width="1.5" />
              <path d="M68 28 L74 12 L80 28 Z" fill="none" stroke="#fff" stroke-width="1.6" />
              <line x1="70" y1="22" x2="78" y2="22" stroke="#fff" stroke-width="1.4" />

              <!-- A Badge -->
              <circle cx="126" cy="27" r="13" fill="#9e9b98" />
              <text x="126" y="31" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="700">A</text>
              <text x="178" y="31" text-anchor="middle" fill="#5c3d33" font-size="10.5" font-weight="700">Dãy phòng học A</text>
            </g>

            <!-- Tháp A Cloud Callout -->
            <g transform="translate(225, 260)">
              <rect x="0" y="0" width="54" height="20" rx="10" fill="#ffffff" />
              <text x="27" y="14" text-anchor="middle" fill="#495057" font-size="10" font-weight="700">Tháp A</text>
            </g>

            <!-- BUILDING B (Next to A) -->
            <g transform="translate(432, 200)">
              <rect x="0" y="0" width="50" height="54" rx="4" fill="#ffffff" />
              <rect x="5" y="5" width="40" height="44" fill="#f7a941" />
              <circle cx="25" cy="27" r="12" fill="#9e9b98" />
              <text x="25" y="31" text-anchor="middle" fill="#fff" font-size="11" font-weight="700">B</text>
            </g>

            <!-- PARKING LOT: GIỮ XE (Right side above HTA) -->
            <g transform="translate(494, 168)">
              <rect x="0" y="0" width="166" height="66" rx="6" fill="#ffffff" />
              <rect x="5" y="5" width="156" height="56" rx="4" fill="#fff352" />
              <text x="83" y="31" text-anchor="middle" fill="#2b2d42" font-size="16" font-weight="800">🛵 Bãi Giữ Xe</text>
              <text x="83" y="48" text-anchor="middle" fill="#5c5346" font-size="11" font-weight="700">(Vào cổng rẽ phải gửi xe)</text>
            </g>

            <!-- ============================================================
                 HERO DESTINATION ON THE RIGHT: KHU HỘI TRƯỜNG A (HTA) TO ĐÙNG!
                 ============================================================ -->
            <g transform="translate(486, 246)">
              <!-- Glowing pulsing highlight ring around HTA -->
              <rect x="-5" y="-5" width="184" height="112" rx="12" fill="none" stroke="#fde047" stroke-width="4" class="map-pin-pulse" />
              <rect x="0" y="0" width="174" height="102" rx="8" fill="#ffffff" />
              <rect x="6" y="6" width="162" height="90" rx="6" fill="#7c4dff" />

              <!-- Top Badge inside HTA -->
              <rect x="18" y="13" width="138" height="22" rx="11" fill="#fde047" />
              <text x="87" y="28" text-anchor="middle" fill="#7c2d12" font-size="10.5" font-weight="800">
                📍 NƠI TỔ CHỨC LỄ (11h30)
              </text>

              <!-- Giant HTA Title -->
              <text x="87" y="59" text-anchor="middle" fill="#ffffff" font-size="24" font-weight="800" letter-spacing="1">
                HTA
              </text>
              <text x="87" y="77" text-anchor="middle" fill="#fef08a" font-size="12.5" font-weight="800">
                KHU HỘI TRƯỜNG A
              </text>
              <text x="87" y="91" text-anchor="middle" fill="#f3e8ff" font-size="10" font-weight="600">
                (Vào cổng chính ➔ Rẽ tay phải)
              </text>
            </g>

            <!-- LEGEND BOX (Bottom-Left) -->
            <g transform="translate(116, 286)">
              <rect x="0" y="0" width="112" height="68" rx="4" fill="#ffffff" />
              <rect x="8" y="7" width="14" height="11" fill="#7c4dff" />
              <text x="27" y="16" fill="#343a40" font-size="9.5" font-weight="700">HTA (Hội trường A)</text>
              <rect x="8" y="22" width="14" height="11" fill="#f7a941" />
              <text x="27" y="31" fill="#343a40" font-size="9.5" font-weight="600">Phòng học</text>
              <rect x="8" y="37" width="14" height="11" fill="#38a3f1" />
              <text x="27" y="46" fill="#343a40" font-size="9.5" font-weight="600">KTX Nam</text>
              <rect x="8" y="52" width="14" height="11" fill="#ec6b9e" />
              <text x="27" y="61" fill="#343a40" font-size="9.5" font-weight="600">KTX Nữ</text>
            </g>

            <!-- BOTTOM ROAD: ĐƯỜNG MAN THIỆN & CỔNG CHÍNH -->
            <g transform="translate(20, 372)">
              <rect x="0" y="0" width="640" height="30" rx="5" fill="#ffffff" />
              <rect x="6" y="6" width="218" height="18" fill="#6366f1" />
              <text x="115" y="19" text-anchor="middle" fill="#ffffff" font-size="10" font-weight="700">ĐƯỜNG MAN THIỆN (97 MAN THIỆN)</text>

              <!-- Main Gate Opening -->
              <rect x="276" y="2" width="112" height="26" rx="6" fill="#fef3c7" stroke="#d97706" stroke-width="2" />
              <text x="332" y="19" text-anchor="middle" fill="#92400e" font-size="11.5" font-weight="800">⬆️ CỔNG CHÍNH</text>

              <rect x="432" y="6" width="202" height="18" fill="#6366f1" />
              <circle cx="534" cy="15" r="11" fill="#d92b2b" stroke="#fff" stroke-width="2" />
            </g>

            <!-- ANIMATED DOTTED WALKING / DRIVING ROUTE:
                 Enter Main Gate (x=352, y=370) -> Turn Right (Rẽ phải) -> HTA (Khu Hội Trường A) & Giữ Xe -->
            <path d="M 352 370 L 352 312 L 478 312" fill="none" stroke="#fde047" stroke-width="4.5" class="map-route-animated" />
            <polygon points="482,312 470,305 470,319" fill="#fde047" />

            <!-- Secondary branch up to Bãi Giữ Xe -->
            <path d="M 442 312 L 442 202 L 490 202" fill="none" stroke="#ffffff" stroke-width="3" class="map-route-animated" />

            <!-- Direction Callout Pill on the Turn-Right Path -->
            <g transform="translate(358, 282)">
              <rect x="0" y="0" width="108" height="22" rx="11" fill="#8b1e16" stroke="#fde047" stroke-width="1.5" />
              <text x="54" y="15" text-anchor="middle" fill="#fde047" font-size="10" font-weight="800">
                Rẽ phải ➔ HTA ➡️
              </text>
            </g>

            <!-- Graduate Character Welcoming at Main Gate -->
            <g transform="translate(332, 338)">
              <circle cx="0" cy="-12" r="12" fill="#fcd34d" stroke="#8b1e16" stroke-width="2" />
              <text x="0" y="-7" text-anchor="middle" font-size="13">🎓</text>
            </g>
          </svg>
        </div>

        <!-- 3-Step Quick Arrival Guide below Map -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-3 text-xs sm:text-sm">
          <div class="rounded-xl theme-card px-3.5 py-2.5 flex items-center gap-2">
            <span class="font-bold theme-text-accent">1. Cổng vào:</span>
            <span class="theme-text-secondary">Cổng chính 97 Man Thiện</span>
          </div>
          <div class="rounded-xl theme-card px-3.5 py-2.5 flex items-center gap-2">
            <span class="font-bold theme-text-accent">2. Rẽ tay phải:</span>
            <span class="theme-text-secondary">Gửi xe tại Bãi giữ xe bên phải</span>
          </div>
          <div class="rounded-xl theme-card px-3.5 py-2.5 flex items-center gap-2">
            <span class="font-bold theme-text-accent">3. Nơi dự lễ:</span>
            <span class="theme-text-secondary">Khu Hội Trường A (HTA - Màu tím)</span>
          </div>
        </div>
      </div>
    `;
  }

  public render(): void {
    const cd = calculateCountdown(Date.now());
    const displayGuestName = this.guestName.trim() || 'Quý khách';
    const themeIcon = this.theme === 'light' ? '🌙 Tối' : '☀️ Sáng';

    // 1. Envelope Opening Screen (Hover nudges & peeks open -> Click flies card out & fills screen)
    if (!this.isEnvelopeOpened) {
      this.container.innerHTML = `
        <div id="envelope-opening-stage" class="envelope-stage select-none">
          <!-- Floating Bottom-Right Theme Toggle -->
          <div class="floating-bottom-dock">
            <button id="btn-theme-toggle-splash"
                    class="floating-dock-btn">
              <span>${themeIcon}</span>
            </button>
          </div>

          <div class="envelope-header-intro text-center mb-2">
            <span class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full theme-badge text-xs sm:text-sm font-bold uppercase tracking-wider mb-2">
              🎓 ${GRADUATION_INFO.universityName}
            </span>
            <h1 class="font-serif-editorial text-3xl sm:text-4xl font-bold theme-text-primary">
              Thiệp Mời Lễ Tốt Nghiệp
            </h1>
          </div>

          <!-- Interactive Envelope + Flying Inner Card -->
          <div id="envelope-clickable-box" class="envelope-wrapper" title="Bấm để mở thiệp mời">
            <div class="envelope-back"></div>

            <!-- The Invitation Card inside that peeks on hover & flies out to cover screen when opened -->
            <div class="envelope-inner-card">
              <div class="w-20 h-20 rounded-2xl overflow-hidden border border-strong mb-2.5 shrink-0">
                <img id="envelope-card-preview-img"
                     src="${this.posterPreviewDataUrl}"
                     alt="${GRADUATION_INFO.graduateName}"
                     referrerpolicy="no-referrer"
                     class="w-full h-full object-cover" />
              </div>
              <p class="font-script-vn text-2xl theme-text-accent leading-tight">
                ${GRADUATION_INFO.ceremonyTitle}
              </p>
              <p class="font-serif-editorial text-2xl sm:text-3xl font-bold theme-text-primary mt-0.5">
                ${GRADUATION_INFO.graduateName}
              </p>
              <p class="text-xs sm:text-sm font-mono-code theme-text-gold mt-1 font-semibold">
                ${GRADUATION_INFO.dateDisplay} | ${GRADUATION_INFO.timeDisplay} • ${GRADUATION_INFO.hallName} (HTA)
              </p>
            </div>

            <!-- Front Envelope Pocket (Lower 64% - Never overlapped by the top flap!) -->
            <div class="envelope-pocket">
              <p class="text-xs sm:text-sm uppercase tracking-widest font-semibold theme-text-muted mb-1.5">
                Trân trọng kính mời
              </p>
              <p class="font-serif-editorial text-2xl sm:text-4xl font-bold theme-text-accent leading-tight mb-2 px-2">
                ${this.escapeHtml(displayGuestName)}
              </p>
              <p class="text-xs sm:text-sm font-medium theme-text-secondary">
                ${GRADUATION_INFO.hallName} (Khu HTA) • ${GRADUATION_INFO.dateDisplay} (${GRADUATION_INFO.timeDisplay})
              </p>
            </div>

            <!-- Top Envelope Flap (Upper 38%) + Wax Seal -->
            <div class="envelope-flap">
              <div class="envelope-wax-seal">
                <span class="text-base">🎓</span>
                <span>MỞ</span>
              </div>
            </div>
          </div>

          <div class="envelope-open-cta text-center">
            <button id="btn-open-envelope"
                    class="btn-primary px-8 py-4 rounded-full text-base sm:text-lg cursor-pointer">
              ✉️ Mở Thiệp Mời
            </button>
          </div>
        </div>
      `;

      this.attachSplashListeners();
      return;
    }

    // 2. Pure Web Graduation Invitation Page (No top header, wide 1520px layout, floating bottom-right controls)
    this.container.innerHTML = `
      <div class="theme-page min-h-screen pb-20 web-page-reveal">
        <!-- Floating Bottom-Right Controls (Replay Envelope + Light/Dark Toggle) -->
        <div class="floating-bottom-dock">
          <button id="btn-replay-envelope"
                  class="floating-dock-btn"
                  title="Mở lại phong bì thiệp mời">
            <span>✉️ Phong bì</span>
          </button>
          <button id="btn-theme-toggle"
                  class="floating-dock-btn"
                  title="Đổi giao diện Sáng / Tối">
            <span>${themeIcon}</span>
          </button>
        </div>

        <!-- Wide Main Web Content -->
        <main class="w-full max-w-[1520px] mx-auto px-4 sm:px-8 lg:px-10 pt-5 space-y-6">

          ${
            this.isAdminMode
              ? `
          <section id="host-admin-dashboard"
                   class="rounded-3xl theme-card p-5 sm:p-7">
            <div class="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-theme">
              <h3 class="font-serif-editorial text-xl sm:text-2xl font-bold theme-text-primary">
                Tạo & Quản Lý Danh Sách Thiệp Mời
              </h3>

              <div class="flex flex-wrap items-center gap-2">
                <button id="btn-export-json-db"
                        class="btn-secondary px-3 py-1.5 rounded-xl text-xs cursor-pointer">
                  Tải JSON
                </button>
                <label for="input-import-json-db"
                       class="btn-secondary px-3 py-1.5 rounded-xl text-xs cursor-pointer">
                  Nhập JSON
                </label>
                <input id="input-import-json-db" type="file" accept=".json,application/json" class="hidden" />
              </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div class="lg:col-span-5 space-y-3">
                <div class="rounded-2xl theme-card-subtle p-3.5 space-y-2.5">
                  <div class="flex gap-2">
                    <input id="input-guest-name"
                           type="text"
                           value="${this.guestName === 'Quý khách' ? '' : this.escapeHtml(this.guestName)}"
                           placeholder="Nhập tên khách mời..."
                           class="flex-1 px-3 py-2 rounded-xl theme-input text-sm" />
                    <button id="btn-add-single-guest"
                            class="btn-primary px-3.5 py-2 rounded-xl text-xs shrink-0 cursor-pointer">
                      + Thêm
                    </button>
                  </div>

                  <div class="p-2.5 rounded-xl theme-input">
                    <span id="generated-invite-link"
                          class="font-mono-code text-[11px] theme-text-accent truncate block">
                      ${this.escapeHtml(this.getShareableLink())}
                    </span>
                  </div>

                  <div class="grid grid-cols-2 gap-2">
                    <button id="btn-copy-invite-link"
                            class="btn-primary py-2 px-3 rounded-xl text-xs cursor-pointer">
                      Copy Link Thiệp
                    </button>
                    <button id="btn-preview-as-guest"
                            class="btn-secondary py-2 px-3 rounded-xl text-xs cursor-pointer">
                      Xem Thiệp Khách
                    </button>
                  </div>
                </div>

                <div class="rounded-2xl theme-card-subtle p-3.5 space-y-2">
                  <textarea id="textarea-bulk-guests"
                            rows="3"
                            placeholder="Dán danh sách tên khách mời (mỗi dòng 1 thiệp, giữ nguyên dấu phẩy và ngoặc đơn trên cùng 1 dòng)..."
                            class="w-full px-3 py-2 rounded-xl theme-input text-xs"></textarea>
                  <div class="flex items-center justify-between gap-2">
                    <button id="btn-import-bulk-guests"
                            class="btn-secondary px-3.5 py-1.5 rounded-xl text-xs cursor-pointer">
                      + Thêm Danh Sách
                    </button>
                    ${
                      this.invitedGuestList.length > 0
                        ? `<button id="btn-clear-guest-list"
                                  class="px-3 py-1.5 rounded-xl theme-input text-[11px] theme-text-muted cursor-pointer">
                            Xóa hết
                          </button>`
                        : ''
                    }
                  </div>
                </div>
              </div>

              <div class="lg:col-span-7 rounded-2xl theme-card-subtle p-3.5 flex flex-col justify-between">
                <div>
                  <div class="flex items-center justify-between mb-2.5">
                    <span class="text-xs font-semibold uppercase tracking-wider theme-text-accent">
                      Danh sách khách mời (${this.invitedGuestList.length})
                    </span>
                  </div>

                  ${
                    this.invitedGuestList.length === 0
                      ? `
                    <div class="rounded-xl theme-input p-5 text-center my-2">
                      <p class="text-xs sm:text-sm theme-text-muted">
                        Chưa có tên trong danh sách.
                      </p>
                    </div>
                    `
                      : `
                    <div id="quick-guest-roster" class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[240px] overflow-y-auto custom-scrollbar p-1">
                      ${this.invitedGuestList
                        .map((name, idx) => {
                          const isSelected = name === this.guestName;
                          return `
                          <div class="flex items-center justify-between gap-1.5 px-3 py-2 rounded-xl border ${
                            isSelected
                              ? 'theme-badge border-strong'
                              : 'theme-input border-theme'
                          }">
                            <button type="button"
                                    data-roster-name="${this.escapeHtml(name)}"
                                    class="quick-guest-chip flex-1 text-left text-xs font-semibold truncate cursor-pointer ${
                                      isSelected ? 'theme-text-accent' : 'theme-text-primary'
                                    }">
                              ${idx + 1}. ${this.escapeHtml(name)}
                            </button>
                            <button type="button"
                                    data-copy-guest="${this.escapeHtml(name)}"
                                    class="quick-guest-copy px-2 py-1 rounded-lg btn-secondary text-[10px] shrink-0">
                              Copy
                            </button>
                            <button type="button"
                                    data-delete-guest-index="${idx}"
                                    class="quick-guest-delete px-2 py-1 rounded-lg theme-text-muted text-[10px] shrink-0">
                              ✕
                            </button>
                          </div>
                        `;
                        })
                        .join('')}
                    </div>
                    `
                  }
                </div>
              </div>
            </div>
          </section>
          `
              : ''
          }

          <!-- Two-Column Invitation Layout -->
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

            <!-- LEFT COLUMN: Personalized Graduation Invitation Card -->
            <div class="lg:col-span-4 flex flex-col items-center">
              <div class="w-full max-w-[480px] rounded-3xl p-3.5 theme-card">
                <div class="rounded-2xl overflow-hidden border border-strong">
                  <img id="live-poster-preview-img"
                       src="${this.posterPreviewDataUrl}"
                       alt="Thiệp Tốt Nghiệp Trần Thị Ngọc Thoa"
                       referrerpolicy="no-referrer"
                       class="w-full h-auto block select-none" />
                </div>

                <div class="mt-3 flex items-center gap-2">
                  <button id="btn-download-poster"
                          class="btn-primary flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl text-xs sm:text-sm cursor-pointer">
                    <span>⬇️</span>
                    <span>Tải Ảnh Thiệp (.PNG)</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- RIGHT COLUMN: Ceremony Details, Illustrated Campus Map, Photobooth & Wishes -->
            <div class="lg:col-span-8 space-y-6">

              <!-- Card 1: Invitation Details, Illustrated PTIT Map & Countdown -->
              <section class="rounded-3xl theme-card p-5 sm:p-7">
                <div class="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                  <span class="px-3.5 py-1 rounded-full text-xs font-mono-code uppercase tracking-wider theme-badge">
                    🎓 ${GRADUATION_INFO.universityName}
                  </span>
                </div>

                <h2 class="font-serif-editorial text-2xl sm:text-4xl font-bold theme-text-accent leading-tight mb-2">
                  Lễ Tốt Nghiệp — ${GRADUATION_INFO.graduateName}
                </h2>
                <p class="text-sm sm:text-lg theme-text-secondary leading-relaxed mb-4">
                  Trân trọng kính mời <strong class="theme-text-accent">${this.escapeHtml(displayGuestName)}</strong> đến tham dự Lễ Tốt Nghiệp và chung vui cùng Thoa.
                </p>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div class="rounded-2xl theme-card-subtle p-4 flex items-start gap-3">
                    <div class="w-9 h-9 rounded-xl theme-badge flex items-center justify-center text-base shrink-0">
                      🗓️
                    </div>
                    <div>
                      <p class="text-[11px] uppercase tracking-wider theme-text-muted">Thời Gian</p>
                      <p class="font-mono-code text-base sm:text-lg font-bold theme-text-primary mt-0.5">
                        ${GRADUATION_INFO.dateDisplay} | ${GRADUATION_INFO.timeDisplay}
                      </p>
                    </div>
                  </div>

                  <div class="rounded-2xl theme-card-subtle p-4 flex items-start gap-3">
                    <div class="w-9 h-9 rounded-xl theme-badge flex items-center justify-center text-base shrink-0">
                      📍
                    </div>
                    <div>
                      <p class="text-[11px] uppercase tracking-wider theme-text-muted">Địa Điểm</p>
                      <p class="font-serif-editorial text-base sm:text-lg font-bold theme-text-primary mt-0.5">
                        ${GRADUATION_INFO.hallName} (Khu HTA — Rẽ phải từ cổng chính)
                      </p>
                      <p class="text-xs theme-text-secondary">${GRADUATION_INFO.addressLine}</p>
                    </div>
                  </div>
                </div>

                <!-- Illustrated PTIT HCM Campus Map showing HTA (Hội Trường A) on the right -->
                ${this.renderPtitCampusMapIllustration()}

                <!-- Countdown -->
                <div class="rounded-2xl theme-card-subtle p-3.5 mt-4 mb-4">
                  <div class="grid grid-cols-4 gap-2 text-center">
                    <div class="rounded-xl theme-card py-2 px-1">
                      <div id="cd-days" class="font-mono-code text-lg sm:text-2xl font-bold theme-text-accent">
                        ${String(cd.days).padStart(2, '0')}
                      </div>
                      <div class="text-[10px] uppercase theme-text-muted">Ngày</div>
                    </div>
                    <div class="rounded-xl theme-card py-2 px-1">
                      <div id="cd-hours" class="font-mono-code text-lg sm:text-2xl font-bold theme-text-accent">
                        ${String(cd.hours).padStart(2, '0')}
                      </div>
                      <div class="text-[10px] uppercase theme-text-muted">Giờ</div>
                    </div>
                    <div class="rounded-xl theme-card py-2 px-1">
                      <div id="cd-minutes" class="font-mono-code text-lg sm:text-2xl font-bold theme-text-accent">
                        ${String(cd.minutes).padStart(2, '0')}
                      </div>
                      <div class="text-[10px] uppercase theme-text-muted">Phút</div>
                    </div>
                    <div class="rounded-xl theme-card py-2 px-1">
                      <div id="cd-seconds" class="font-mono-code text-lg sm:text-2xl font-bold theme-text-accent">
                        ${String(cd.seconds).padStart(2, '0')}
                      </div>
                      <div class="text-[10px] uppercase theme-text-muted">Giây</div>
                    </div>
                  </div>
                </div>

                <div class="flex flex-wrap items-center gap-2">
                  <a href="${GRADUATION_INFO.googleMapsUrl}"
                     target="_blank"
                     rel="noopener noreferrer"
                     class="btn-primary flex-1 min-w-[140px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm">
                    <span>🗺️</span>
                    <span>Chỉ Đường Google Maps</span>
                  </a>
                  <button id="btn-download-ics"
                          class="btn-secondary flex-1 min-w-[140px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm cursor-pointer">
                    <span>📅</span>
                    <span>Lưu Lịch Hẹn</span>
                  </button>
                </div>
              </section>

              <!-- Card 2: Photobooth 4-Frame Gallery -->
              <section class="rounded-3xl theme-card p-5 sm:p-6">
                <h3 class="font-serif-editorial text-xl sm:text-2xl font-bold theme-text-primary mb-3">
                  Khoảnh Khắc Tốt Nghiệp
                </h3>

                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  ${PHOTOBOOTH_FRAMES.map(
                    (frame) => `
                    <button type="button"
                            data-photo-id="${frame.id}"
                            class="photobooth-card rounded-2xl overflow-hidden theme-card-subtle p-1.5 text-left cursor-pointer">
                      <div class="w-full overflow-hidden rounded-xl" style="aspect-ratio: 4/3;">
                        <img id="photobooth-thumb-${frame.id}"
                             src="${this.photoboothThumbs.get(frame.id) || GRADUATION_INFO.photoboothAssetPath}"
                             alt="${frame.title}"
                             referrerpolicy="no-referrer"
                             class="w-full h-full object-cover" />
                      </div>
                      <div class="pt-2 pb-1 px-1">
                        <p class="text-[10px] font-mono-code uppercase theme-text-accent font-semibold">
                          ${frame.timestampLabel}
                        </p>
                      </div>
                    </button>
                  `,
                  ).join('')}
                </div>
              </section>

              <!-- Card 3: Guestbook & Attendance Confirmation -->
              <section class="rounded-3xl theme-card p-5 sm:p-6">
                <div class="flex items-center justify-between gap-2 mb-3">
                  <h3 class="font-serif-editorial text-xl sm:text-2xl font-bold theme-text-primary">
                    Gửi Lời Chúc & Xác Nhận Tham Dự
                  </h3>
                  <span class="px-2.5 py-1 rounded-full text-xs theme-badge font-mono-code">
                    ${this.rsvpEntries.length}
                  </span>
                </div>

                <form id="rsvp-wish-form" class="space-y-3 mb-4">
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input id="rsvp-name"
                           type="text"
                           required
                           value="${this.guestName === 'Quý khách' ? '' : this.escapeHtml(this.guestName)}"
                           placeholder="Tên của bạn..."
                           class="px-3 py-2.5 rounded-xl theme-input text-xs sm:text-sm" />
                    <input id="rsvp-relation"
                           type="text"
                           placeholder="Mối quan hệ (Bạn bè, Gia đình...)"
                           class="px-3 py-2.5 rounded-xl theme-input text-xs sm:text-sm" />
                    <select id="rsvp-attendance"
                            class="px-3 py-2.5 rounded-xl theme-input text-xs sm:text-sm">
                      <option value="attending">Tham dự lúc 11h30</option>
                      <option value="after_ceremony">Ghé chụp hình lúc 12h15</option>
                      <option value="remote_wish">Gửi lời chúc từ xa</option>
                    </select>
                  </div>

                  <div class="flex flex-col sm:flex-row gap-2.5">
                    <textarea id="rsvp-message"
                              rows="2"
                              required
                              placeholder="Lời chúc gửi đến Ngọc Thoa..."
                              class="flex-1 px-3 py-2.5 rounded-xl theme-input text-xs sm:text-sm"></textarea>
                    <button type="submit"
                            class="btn-primary px-5 py-2.5 rounded-xl text-xs sm:text-sm shrink-0 cursor-pointer">
                      Gửi Lời Chúc
                    </button>
                  </div>
                </form>

                ${
                  this.rsvpEntries.length > 0
                    ? `
                <div class="space-y-2.5 max-h-[340px] overflow-y-auto custom-scrollbar pr-1">
                  ${this.rsvpEntries
                    .map(
                      (entry) => `
                    <div class="rounded-2xl theme-card-subtle p-3.5">
                      <div class="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <div class="flex items-center gap-2">
                          <span class="font-bold text-xs sm:text-sm theme-text-accent">
                            ${this.escapeHtml(entry.guestName)}
                          </span>
                          <span class="text-[11px] theme-text-muted">
                            • ${this.escapeHtml(entry.relation)}
                          </span>
                        </div>
                        <span class="text-[10px] px-2 py-0.5 rounded-full theme-badge">
                          ${this.escapeHtml(formatAttendanceLabel(entry.attendance))}
                        </span>
                      </div>
                      <p class="text-xs sm:text-sm theme-text-primary leading-relaxed">
                        “${this.escapeHtml(entry.message)}”
                      </p>
                    </div>
                  `,
                    )
                    .join('')}
                </div>
                `
                    : ''
                }
              </section>

            </div>
          </div>
        </main>
      </div>

      <!-- Lightbox Modal for Photobooth Pose or Original Campus Map Inspection -->
      <div id="photo-lightbox-modal"
           class="fixed inset-0 z-50 hidden items-center justify-center p-4 bg-black/75">
        <div class="relative w-full max-w-2xl rounded-3xl theme-card p-5 text-center">
          <div class="flex items-center justify-between mb-3">
            <span id="photo-lightbox-badge"
                  class="text-xs font-mono-code uppercase tracking-wider theme-text-accent">
              MEMORIES 2026
            </span>
            <button id="btn-close-lightbox"
                    class="w-8 h-8 rounded-full btn-secondary font-bold text-sm cursor-pointer">
              ✕
            </button>
          </div>
          <div class="rounded-2xl overflow-hidden border border-theme mb-3">
            <img id="photo-lightbox-img"
                 src="${GRADUATION_INFO.photoboothAssetPath}"
                 alt="Preview"
                 referrerpolicy="no-referrer"
                 class="w-full max-h-[440px] object-contain mx-auto" />
          </div>
          <p id="photo-lightbox-caption" class="text-xs sm:text-sm theme-text-secondary mb-2"></p>
        </div>
      </div>

      <!-- Toast Notification -->
      <div id="graduation-toast"
           class="fixed bottom-20 right-4 z-50 hidden items-center gap-2 px-4 py-2.5 rounded-2xl theme-card text-xs sm:text-sm font-semibold theme-text-primary">
        <span id="graduation-toast-text">Đã lưu</span>
      </div>
    `;

    this.attachMainListeners();
    this.updatePhotoboothThumbnailsInDom();
  }

  private getShareableLink(): string {
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const cleanGuest = this.guestName === 'Quý khách' ? '' : this.guestName;
    return buildPersonalizedShareUrl(baseUrl, cleanGuest);
  }

  private attachSplashListeners(): void {
    document
      .getElementById('btn-open-envelope')
      ?.addEventListener('click', () => {
        this.triggerEnvelopeOpeningSequence();
      });

    document
      .getElementById('envelope-clickable-box')
      ?.addEventListener('click', () => {
        this.triggerEnvelopeOpeningSequence();
      });

    document
      .getElementById('btn-theme-toggle-splash')
      ?.addEventListener('click', () => {
        this.toggleTheme();
      });
  }

  private attachMainListeners(): void {
    document
      .getElementById('btn-theme-toggle')
      ?.addEventListener('click', () => {
        this.toggleTheme();
      });

    document
      .getElementById('btn-replay-envelope')
      ?.addEventListener('click', () => {
        soundEngine.playSoftClick();
        this.isEnvelopeOpened = false;
        this.isOpeningAnimation = false;
        this.render();
      });

    document
      .getElementById('btn-view-original-map')
      ?.addEventListener('click', () => {
        soundEngine.playSoftClick();
        this.openOriginalMapModal();
      });

    document
      .getElementById('btn-download-poster')
      ?.addEventListener('click', async () => {
        soundEngine.playSoftClick();
        try {
          const dataUrl = await renderPersonalizedPosterToCanvas(
            this.posterCanvas,
            this.guestName,
          );
          if (dataUrl) {
            const a = document.createElement('a');
            const safeSlug = (this.guestName || 'Khach-Moi')
              .trim()
              .replace(/\s+/g, '-');
            a.href = dataUrl;
            a.download = `Thiep-Tot-Nghiep-Ngoc-Thoa-${safeSlug}.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            this.showToast('Đã tải ảnh thiệp mời (.PNG)');
          }
        } catch {
          this.showToast('Không thể tải ảnh lúc này');
        }
      });

    if (this.isAdminMode) {
      const nameInput = document.getElementById(
        'input-guest-name',
      ) as HTMLInputElement | null;

      const applyGuestNameChange = (newName: string) => {
        const cleaned = newName.trim() || 'Quý khách';
        this.guestName = cleaned;
        void this.refreshPersonalizedPosterPreview();

        const linkEl = document.getElementById('generated-invite-link');
        if (linkEl) {
          linkEl.textContent = this.getShareableLink();
        }
      };

      nameInput?.addEventListener('input', () => {
        applyGuestNameChange(nameInput.value);
      });

      document
        .getElementById('btn-add-single-guest')
        ?.addEventListener('click', async () => {
          const raw = nameInput?.value.trim() || '';
          if (!raw) return;
          soundEngine.playSoftClick();
          this.guestName = raw;
          if (!this.invitedGuestList.includes(raw)) {
            this.invitedGuestList = [raw, ...this.invitedGuestList];
          }
          await this.persistDatabase();
          await this.refreshPersonalizedPosterPreview();
          this.render();
          this.showToast(`Đã thêm ${raw}`);
        });

      document.querySelectorAll('.quick-guest-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
          const pickedName = (btn as HTMLElement).getAttribute(
            'data-roster-name',
          );
          if (!pickedName) return;
          soundEngine.playSoftClick();
          this.guestName = pickedName;
          void this.refreshPersonalizedPosterPreview();
          this.render();
        });
      });

      document.querySelectorAll('.quick-guest-copy').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const pickedName = (btn as HTMLElement).getAttribute(
            'data-copy-guest',
          );
          if (!pickedName) return;
          soundEngine.playSoftClick();
          this.guestName = pickedName;
          void this.refreshPersonalizedPosterPreview();
          const link = this.getShareableLink();
          try {
            await navigator.clipboard.writeText(link);
            this.showToast(`Đã copy link của ${pickedName}`);
          } catch {
            this.showToast(link);
          }
          this.render();
        });
      });

      document.querySelectorAll('.quick-guest-delete').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const idx = Number(
            (btn as HTMLElement).getAttribute('data-delete-guest-index') || '0',
          );
          this.invitedGuestList.splice(idx, 1);
          await this.persistDatabase();
          this.render();
        });
      });

      document
        .getElementById('btn-clear-guest-list')
        ?.addEventListener('click', async () => {
          this.invitedGuestList = [];
          await this.persistDatabase();
          this.render();
        });

      document
        .getElementById('btn-import-bulk-guests')
        ?.addEventListener('click', async () => {
          const bulkArea = document.getElementById(
            'textarea-bulk-guests',
          ) as HTMLTextAreaElement | null;
          if (!bulkArea || !bulkArea.value.trim()) return;
          const names = parseGuestListText(bulkArea.value);
          if (names.length > 0) {
            this.invitedGuestList = Array.from(
              new Set([...this.invitedGuestList, ...names]),
            );
            this.guestName = names[0];
            await this.persistDatabase();
            void this.refreshPersonalizedPosterPreview();
            this.render();
            this.showToast(`Đã thêm ${names.length} khách mời`);
          }
        });

      document
        .getElementById('btn-copy-invite-link')
        ?.addEventListener('click', async () => {
          soundEngine.playSoftClick();
          const link = this.getShareableLink();
          try {
            await navigator.clipboard.writeText(link);
            this.showToast('Đã sao chép link thiệp mời');
          } catch {
            this.showToast(link);
          }
        });

      document
        .getElementById('btn-preview-as-guest')
        ?.addEventListener('click', () => {
          soundEngine.playSoftClick();
          const guestUrl = new URL(this.getShareableLink());
          guestUrl.searchParams.set('autostart', '1');
          window.history.pushState({}, '', guestUrl.toString());
          this.isAdminMode = canAccessHostLinkGenerator(
            window.location.search,
          );
          this.render();
        });

      document
        .getElementById('btn-export-json-db')
        ?.addEventListener('click', () => {
          soundEngine.playSoftClick();
          exportDatabaseAsJsonFile({
            guestList: this.invitedGuestList,
            rsvpEntries: this.rsvpEntries,
            updatedAt: new Date().toISOString(),
          });
        });

      const importInput = document.getElementById(
        'input-import-json-db',
      ) as HTMLInputElement | null;
      importInput?.addEventListener('change', async () => {
        const file = importInput.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const parsed = JSON.parse(text) as {
            guestList?: string[];
            rsvpEntries?: RsvpEntry[];
          };
          if (Array.isArray(parsed.guestList)) {
            this.invitedGuestList = parsed.guestList
              .map((n) => String(n).trim())
              .filter(Boolean);
          }
          if (Array.isArray(parsed.rsvpEntries)) {
            this.rsvpEntries = parsed.rsvpEntries;
          }
          await this.persistDatabase();
          this.render();
          this.showToast('Đã nhập file JSON');
        } catch {
          this.showToast('File JSON không hợp lệ');
        }
      });
    }

    document
      .getElementById('btn-download-ics')
      ?.addEventListener('click', () => {
        soundEngine.playSoftClick();
        const ics = generateIcsCalendarContent(this.guestName);
        const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Le-Tot-Nghiep-Tran-Thi-Ngoc-Thoa-PTIT.ics';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });

    document.querySelectorAll('.photobooth-card').forEach((card) => {
      card.addEventListener('click', () => {
        soundEngine.playSoftClick();
        const id = Number(
          (card as HTMLElement).getAttribute('data-photo-id') || '1',
        );
        this.openPhotoInspectModal(id);
      });
    });

    document
      .getElementById('btn-close-lightbox')
      ?.addEventListener('click', () => {
        const modal = document.getElementById('photo-lightbox-modal');
        modal?.classList.add('hidden');
        modal?.classList.remove('flex');
      });

    const rsvpForm = document.getElementById(
      'rsvp-wish-form',
    ) as HTMLFormElement | null;
    rsvpForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameEl = document.getElementById(
        'rsvp-name',
      ) as HTMLInputElement | null;
      const relEl = document.getElementById(
        'rsvp-relation',
      ) as HTMLInputElement | null;
      const attEl = document.getElementById(
        'rsvp-attendance',
      ) as HTMLSelectElement | null;
      const msgEl = document.getElementById(
        'rsvp-message',
      ) as HTMLTextAreaElement | null;

      const guestName = nameEl?.value.trim() || this.guestName;
      const relation = relEl?.value.trim() || 'Khách mời';
      const attendance =
        (attEl?.value as AttendanceStatus) || 'attending';
      const message = msgEl?.value.trim() || 'Chúc mừng tốt nghiệp Ngọc Thoa!';

      const newEntry: RsvpEntry = {
        id: `wish-${Date.now()}`,
        guestName,
        pronoun: '',
        relation,
        attendance,
        partySize: 1,
        message,
        createdAt: new Date().toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      this.rsvpEntries = [newEntry, ...this.rsvpEntries];
      await this.persistDatabase();
      soundEngine.playCelebrationFanfare();
      this.render();
      this.showToast(`Cảm ơn ${guestName} đã gửi lời chúc!`);
    });
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
