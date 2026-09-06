import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

/**
 * The mark is the axis, not the wordmark.
 *
 * Devanagari would need a font shipped to the image renderer, and a letter at
 * 32 pixels on a home screen is unreadable anyway. The two poles either side of
 * a centre line say what the product is with no type at all, and they are the
 * same two colours the whole interface is built from.
 */
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#141219',
        borderRadius: 96,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 340,
          height: 340,
          position: 'relative',
        }}
      >
        {/* the axis */}
        <div
          style={{ position: 'absolute', width: 340, height: 6, background: '#2b2833' }}
        />
        {/* you owe */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            width: 150,
            height: 104,
            borderRadius: 14,
            background: '#c77399',
          }}
        />
        {/* owed to you */}
        <div
          style={{
            position: 'absolute',
            right: 24,
            width: 96,
            height: 104,
            borderRadius: 14,
            background: '#3fa898',
          }}
        />
        {/* zero */}
        <div
          style={{
            position: 'absolute',
            left: 168,
            width: 6,
            height: 168,
            background: '#eceae6',
          }}
        />
      </div>
    </div>,
    size,
  )
}
