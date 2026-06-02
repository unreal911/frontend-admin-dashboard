import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Frontend Admin Next';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '56px',
          background:
            'radial-gradient(circle at top right, #dce9ff 0%, #edf3ff 35%, #ffffff 58%)',
          color: '#10243f',
          fontFamily: 'Segoe UI, sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div
            style={{
              fontSize: '28px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '2px',
              color: '#0b63ce',
            }}
          >
            Frontend Admin Next
          </div>
          <div style={{ fontSize: '68px', fontWeight: 800, lineHeight: 1.08, maxWidth: '920px' }}>
            Panel Administrativo
          </div>
        </div>

        <div style={{ fontSize: '30px', color: '#35516f' }}>
          Migracion de frontend Angular a Next.js
        </div>
      </div>
    ),
    size,
  );
}
