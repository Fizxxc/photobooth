type BuildPhotoStripInput = {
  frames: Blob[];
  overlayUrl: string;
};

type Slot = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
};

const STRIP_WIDTH = 1240;   // 10.5 cm @ 300 DPI
const STRIP_HEIGHT = 3508;  // 29.7 cm @ 300 DPI

const STRIP_WIDTH_CM = 10.5;
const STRIP_HEIGHT_CM = 29.7;

const PX_PER_CM_X = STRIP_WIDTH / STRIP_WIDTH_CM;
const PX_PER_CM_Y = STRIP_HEIGHT / STRIP_HEIGHT_CM;

function cmToPxX(cm: number) {
  return Math.round(cm * PX_PER_CM_X);
}

function cmToPxY(cm: number) {
  return Math.round(cm * PX_PER_CM_Y);
}

/**
 * Slot transparan berdasarkan ukuran persis dari Canva
 * Foto 1: X 0.59, Y 2.14, W 9.33, H 6.82
 * Foto 2: X 0.59, Y 9.75, W 9.33, H 6.82
 * Foto 3: X 0.59, Y 17.36, W 9.33, H 6.82
 */
const PHOTO_SLOTS: Slot[] = [
  {
    x: cmToPxX(0.59),
    y: cmToPxY(2.14),
    width: cmToPxX(9.33),
    height: cmToPxY(6.82),
    radius: 28
  },
  {
    x: cmToPxX(0.59),
    y: cmToPxY(9.75),
    width: cmToPxX(9.33),
    height: cmToPxY(6.82),
    radius: 28
  },
  {
    x: cmToPxX(0.59),
    y: cmToPxY(17.36),
    width: cmToPxX(9.33),
    height: cmToPxY(6.82),
    radius: 28
  }
];

/**
 * Utility: load image from Blob or URL
 */
function loadImage(src: string): Promise<HTMLImageElement>;
function loadImage(src: Blob): Promise<HTMLImageElement>;
function loadImage(src: string | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';

    let objectUrl: string | null = null;

    if (typeof src === 'string') {
      image.src = src;
    } else {
      objectUrl = URL.createObjectURL(src);
      image.src = objectUrl;
    }

    image.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = (error) => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(error);
    };
  });
}

/**
 * Rounded rect clipping
 */
function clipRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 24
) {
  const r = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.clip();
}

/**
 * Draw image cover ke slot transparan
 * - foto akan memenuhi frame
 * - bagian berlebih di-crop otomatis
 */
function drawImageCover(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  frame: Slot
) {
  const sourceWidth =
    image instanceof HTMLImageElement ? image.naturalWidth : (image as ImageBitmap).width;
  const sourceHeight =
    image instanceof HTMLImageElement ? image.naturalHeight : (image as ImageBitmap).height;

  const scale = Math.max(frame.width / sourceWidth, frame.height / sourceHeight);

  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const dx = frame.x + (frame.width - drawWidth) / 2;
  const dy = frame.y + (frame.height - drawHeight) / 2;

  ctx.save();
  clipRoundedRect(ctx, frame.x, frame.y, frame.width, frame.height, frame.radius ?? 24);
  ctx.drawImage(image, dx, dy, drawWidth, drawHeight);
  ctx.restore();
}

/**
 * Build final photostrip
 * - ukuran final 1240 x 3508
 * - 3 foto dimasukkan ke area transparan
 * - overlay PNG transparan diletakkan di paling atas
 */
export async function buildPhotoStrip({
  frames,
  overlayUrl
}: BuildPhotoStripInput): Promise<Blob> {
  if (!frames || frames.length !== 3) {
    throw new Error('Photostrip requires exactly 3 frames.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = STRIP_WIDTH;
  canvas.height = STRIP_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas context is not available.');
  }

  // background dasar
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, STRIP_WIDTH, STRIP_HEIGHT);

  // load 3 captured frames
  const frameImages = await Promise.all(frames.map((blob) => loadImage(blob)));

  // gambar foto ke masing-masing slot transparan
  frameImages.forEach((image, index) => {
    drawImageCover(ctx, image, PHOTO_SLOTS[index]);
  });

  // gambar overlay PNG transparan di atas
  if (overlayUrl) {
    const overlayImage = await loadImage(overlayUrl);
    ctx.drawImage(overlayImage, 0, 0, STRIP_WIDTH, STRIP_HEIGHT);
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to export final photostrip.'));
          return;
        }
        resolve(blob);
      },
      'image/png',
      1
    );
  });
}

export const PHOTO_STRIP_SIZE = {
  width: STRIP_WIDTH,
  height: STRIP_HEIGHT
};

export const PHOTO_STRIP_SLOTS = PHOTO_SLOTS;