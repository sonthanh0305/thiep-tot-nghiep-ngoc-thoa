import { GRADUATION_INFO, PHOTOBOOTH_FRAMES } from './invitationLogic';

let cachedSourceImage: HTMLImageElement | null = null;
let imageLoadPromise: Promise<HTMLImageElement> | null = null;

let cachedPhotoboothImage: HTMLImageElement | null = null;
let photoboothLoadPromise: Promise<HTMLImageElement> | null = null;

export function loadPosterImage(): Promise<HTMLImageElement> {
  if (cachedSourceImage && cachedSourceImage.complete) {
    return Promise.resolve(cachedSourceImage);
  }
  if (imageLoadPromise) {
    return imageLoadPromise;
  }

  imageLoadPromise = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      cachedSourceImage = img;
      resolve(img);
    };
    img.onerror = (err) => {
      imageLoadPromise = null;
      reject(err);
    };
    img.src = GRADUATION_INFO.posterAssetPath;
  });

  return imageLoadPromise;
}

export function loadPhotoboothStripImage(): Promise<HTMLImageElement> {
  if (cachedPhotoboothImage && cachedPhotoboothImage.complete) {
    return Promise.resolve(cachedPhotoboothImage);
  }
  if (photoboothLoadPromise) {
    return photoboothLoadPromise;
  }

  photoboothLoadPromise = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      cachedPhotoboothImage = img;
      resolve(img);
    };
    img.onerror = (err) => {
      photoboothLoadPromise = null;
      reject(err);
    };
    img.src = GRADUATION_INFO.photoboothAssetPath;
  });

  return photoboothLoadPromise;
}

/**
 * Renders the original graduation poster onto the target canvas and inscribes
 * ONLY the guest's name cleanly centered inside the bottom-right "Trân trọng kính mời:" box.
 */
export async function renderPersonalizedPosterToCanvas(
  canvas: HTMLCanvasElement,
  guestName: string,
): Promise<string> {
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  try {
    const img = await loadPosterImage();
    const width = img.naturalWidth || 1068;
    const height = img.naturalHeight || 1600;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const displayGuest = guestName.trim() || 'Quý khách';

    // Coordinates of the cream invitation rectangle at the bottom-right of the poster:
    // x: 59.4% -> 94.7% of width; y: 88.6% -> 96.6% of height
    const boxX = width * 0.594;
    const boxY = height * 0.886;
    const boxW = width * 0.353;
    const boxH = height * 0.08;
    const centerX = boxX + boxW / 2;
    const centerY = boxY + boxH / 2;

    ctx.save();

    let fontSize = Math.round(width * 0.044);
    if (displayGuest.length > 16) fontSize = Math.round(width * 0.037);
    if (displayGuest.length > 22) fontSize = Math.round(width * 0.032);
    if (displayGuest.length > 28) fontSize = Math.round(width * 0.027);

    ctx.font = `700 ${fontSize}px "Dancing Script", "Cormorant Garamond", Georgia, serif`;
    ctx.fillStyle = '#5c1610';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayGuest, centerX, centerY + boxH * 0.02, boxW * 0.9);

    ctx.restore();

    return canvas.toDataURL('image/png');
  } catch {
    canvas.width = 800;
    canvas.height = 1200;
    ctx.fillStyle = '#1f1210';
    ctx.fillRect(0, 0, 800, 1200);
    ctx.fillStyle = '#f5e6d3';
    ctx.font = 'bold 42px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(GRADUATION_INFO.graduateName, 400, 300);
    return '';
  }
}

/**
 * Extracts each of the 4 photobooth frames from the high-resolution upright photobooth strip
 * (`/assets/aistudio/a_e8fec45a.jpg`) into crisp data URLs.
 */
export async function extractPhotoboothFrameDataUrls(): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  try {
    const img = await loadPhotoboothStripImage();
    const w = img.naturalWidth || 1024;
    const h = img.naturalHeight || 2560;

    for (const frame of PHOTOBOOTH_FRAMES) {
      const sx = w * frame.cropRatioX[0];
      const sy = h * frame.cropRatioY[0];
      const sw = w * (frame.cropRatioX[1] - frame.cropRatioX[0]);
      const sh = h * (frame.cropRatioY[1] - frame.cropRatioY[0]);

      const offscreen = document.createElement('canvas');
      offscreen.width = 760;
      offscreen.height = 520;
      const ctx = offscreen.getContext('2d');
      if (!ctx) continue;

      ctx.fillStyle = '#fbf8f1';
      ctx.fillRect(0, 0, offscreen.width, offscreen.height);
      ctx.drawImage(
        img,
        sx,
        sy,
        sw,
        sh,
        14,
        14,
        offscreen.width - 28,
        offscreen.height - 28,
      );

      result.set(frame.id, offscreen.toDataURL('image/jpeg', 0.95));
    }
  } catch {
    // Ignore if unavailable
  }
  return result;
}
