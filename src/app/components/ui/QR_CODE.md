# QR Code Component

The QR Code component generates customizable QR codes with various styling options and encoding optimizations.

## Basic Usage

```tsx
import { QRCode } from '@/app/components/ui/qr-code'

// Basic usage
<QRCode url="https://example.com" />

// With custom size and styling
<QRCode 
  url="https://example.com" 
  size={300} 
  dotColor="#FF0000" 
  backgroundColor="#FFFFFF" 
/>

// With compact encoding for smaller QR codes
<QRCode 
  url="https://example.com" 
  compact={true} 
  errorCorrectionLevel="L" 
/>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `url` | `string` | (required) | The URL or text to encode in the QR code |
| `size` | `number` | `200` | Size of the QR code in pixels |
| `className` | `string` | `undefined` | Additional CSS classes to apply |
| `logoSize` | `number` | `50` | Size of the logo in pixels (set to 0 to disable) |
| `dotColor` | `string` | Based on theme | Color of the QR code dots |
| `backgroundColor` | `string` | `'transparent'` | Background color of the QR code |
| `dotOpacity` | `number` | `1` | Opacity of the QR code dots (0-1) |
| `dotSize` | `number` | `0.85` | Size of dots relative to the cell size (0-1) |
| `showButtons` | `boolean` | `true` | Whether to show download and copy buttons |
| `errorCorrectionLevel` | `'L' \| 'M' \| 'Q' \| 'H'` | `'H'` | Error correction level |
| `version` | `number` | `undefined` | QR code version (1-40) |
| `compact` | `boolean` | `false` | Enable compact mode for smaller QR codes |

## Optimizing QR Code Size

The QR code component offers several options to create more compact QR codes:

### 1. Error Correction Level

QR codes include error correction to remain scannable even when partially damaged or obscured. Lower error correction levels result in smaller QR codes but reduce resilience to damage:

- **L (Low)**: ~7% error resistance - smallest QR code size
- **M (Medium)**: ~15% error resistance
- **Q (Quartile)**: ~25% error resistance
- **H (High)**: ~30% error resistance - largest QR code size

If you don't need a logo overlay and the QR code will be displayed in ideal conditions, you can use level 'L' for the smallest possible size:

```tsx
<QRCode url="https://example.com" errorCorrectionLevel="L" />
```

### 2. Compact Mode

The `compact` prop enables several optimizations:

- Reduces padding around the QR code
- Uses lower error correction level when no logo is present
- Enables Kanji mode for better compression when applicable
- Optimizes segment encoding

```tsx
<QRCode url="https://example.com" compact={true} />
```

### 3. Version Control

The `version` prop allows you to specify the QR code version (1-40), which determines the number of modules (dots) in the QR code. Lower versions create smaller QR codes but can store less data:

```tsx
<QRCode url="https://example.com" version={2} />
```

## Methods

The QRCode component exposes methods through a ref:

```tsx
import { useRef } from 'react'
import { QRCode, QRCodeRef } from '@/app/components/ui/qr-code'

function MyComponent() {
  const qrRef = useRef<QRCodeRef>(null)
  
  const handleDownload = () => {
    qrRef.current?.downloadImage('my-qr-code.png')
  }
  
  const handleCopy = async () => {
    const success = await qrRef.current?.copyToClipboard()
    if (success) {
      console.log('QR code copied to clipboard')
    }
  }
  
  return (
    <>
      <QRCode ref={qrRef} url="https://example.com" />
      <button onClick={handleDownload}>Download</button>
      <button onClick={handleCopy}>Copy</button>
    </>
  )
}
``` 