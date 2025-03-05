# Autosize Component

A React component that uses ResizeObserver to dynamically adjust its size based on its children's dimensions. Fully supports server-side rendering (SSR) with hydration.

## Features

- Automatically resizes to fit its children
- Supports minimum and maximum dimensions
- Provides callbacks for resize events
- Configurable debounce for resize events
- Can observe parent, children, or both
- Can be disabled when needed
- **Full SSR compatibility** with deterministic IDs and proper hydration

## Usage

```tsx
import { Autosize } from '@/app/components/ui/autosize'

const MyComponent = () => {
  const handleResize = (dimensions) => {
    console.log(`New dimensions: ${dimensions.width}px × ${dimensions.height}px`)
  }

  return (
    <Autosize 
      onResize={handleResize}
      minHeight={100}
      className="my-container"
    >
      <div>Content that will cause the parent to resize</div>
      {/* More content */}
    </Autosize>
  )
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | ReactNode | (required) | The content to be rendered inside the component |
| `className` | string | `''` | Additional CSS classes to apply to the container |
| `style` | CSSProperties | `{}` | Additional inline styles to apply to the container |
| `onResize` | function | `undefined` | Callback function that receives the new dimensions `{ width, height }` |
| `resizeDebounceMs` | number | `100` | Debounce delay in milliseconds for resize events |
| `minWidth` | number \| string | `undefined` | Minimum width of the container |
| `minHeight` | number \| string | `undefined` | Minimum height of the container |
| `maxWidth` | number \| string | `undefined` | Maximum width of the container |
| `maxHeight` | number \| string | `undefined` | Maximum height of the container |
| `width` | number \| string | `undefined` | Fixed width (overrides automatic sizing) |
| `height` | number \| string | `undefined` | Fixed height (overrides automatic sizing) |
| `observeParent` | boolean | `false` | Whether to observe the parent element for size changes |
| `observeChildren` | boolean | `true` | Whether to observe child elements for size changes |
| `disabled` | boolean | `false` | Whether to disable the resize functionality |
| `id` | string | `undefined` | Custom ID for the container (optional, will generate a deterministic ID if not provided) |

## Example

See the [example.tsx](./example.tsx) file for a complete example of how to use the Autosize component.

## How It Works

The Autosize component uses the ResizeObserver API to monitor its children for size changes. When a change is detected, it calculates the dimensions needed to fit all children and updates its own size accordingly.

The component also handles cleanup of observers when unmounting or when children change, to prevent memory leaks.

### Server-Side Rendering (SSR) Support

The component is fully compatible with server-side rendering frameworks like Next.js:

1. **Deterministic IDs**: Uses React's built-in `useId` hook to generate deterministic IDs that are consistent between server and client renders.

2. **Safe Effect Handling**: Uses an isomorphic version of `useLayoutEffect` that safely falls back to `useEffect` during server rendering to avoid warnings.

3. **Mount Detection**: Tracks component mounting state to ensure that browser-specific code only runs after hydration is complete.

4. **Hydration-Safe Dimensions**: During server rendering and initial hydration, the component uses default dimensions to avoid hydration mismatches, then updates to actual dimensions after client-side hydration.

5. **Browser API Detection**: Safely checks for browser APIs before attempting to use them, preventing server-side errors.

## Use Cases

- Dynamic content that needs to fit its container
- Components that need to adjust their size based on user interactions
- Responsive layouts that need to adapt to content changes
- Animations that involve size changes
- Server-rendered applications that need consistent component behavior 