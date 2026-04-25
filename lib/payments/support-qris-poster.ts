import 'server-only';

import sharp from 'sharp';
import QRCode from 'qrcode';

const TEMPLATE_WIDTH = 1748;  // 14.8 cm @ 300 DPI
const TEMPLATE_HEIGHT = 2480; // 21 cm @ 300 DPI

const QR_SLOT = {
  x: 491,
  y: 791,
  width: 765,
  height: 765
};

type BuildSupportQrisPosterInput = {
  templateBuffer: Buffer;
  qrisString: string;
};

export async function buildSupportQrisPoster({
  templateBuffer,
  qrisString
}: BuildSupportQrisPosterInput): Promise<Buffer> {
  const qrBuffer = await QRCode.toBuffer(qrisString, {
    errorCorrectionLevel: 'M',
    margin: 0,
    width: QR_SLOT.width
  });

  const output = await sharp(templateBuffer)
    .resize(TEMPLATE_WIDTH, TEMPLATE_HEIGHT, {
      fit: 'fill'
    })
    .composite([
      {
        input: qrBuffer,
        left: QR_SLOT.x,
        top: QR_SLOT.y
      }
    ])
    .png()
    .toBuffer();

  return output;
}