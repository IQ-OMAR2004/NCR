'use client';

import { QRCodeSVG } from 'qrcode.react';

/** QR encoding the NCR number — scanned on the shop floor to open the record. */
export function TagQr({ value }: { value: string }) {
  return <QRCodeSVG value={value} size={74} fgColor="#0B2138" />;
}
