import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

export function QrCode({ value, size = 200 }: { value: string; size?: number }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { margin: 1, width: size * 2, color: { dark: '#17142e', light: '#ffffff' } })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(''));
    return () => {
      alive = false;
    };
  }, [value, size]);

  return src ? <img src={src} width={size} height={size} alt="Código QR para vincular" /> : <span style={{ width: size, height: size }} />;
}
