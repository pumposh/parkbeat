import { Children, isValidElement, cloneElement, createElement, type ReactNode, type ReactElement } from 'react'
import { generateId } from './id'
import ReactDOM from 'react-dom/client'

/**
 * Get the auto-size of an element
 * @param element - The element to get the auto-size of
 * @returns The auto-size of the element
 */
export const getElementAutoSize = (element: HTMLElement) => {
  console.group('getElementAutoSize')
  console.log('Input element:', element)
  console.log('Element children:', element.children)

  const parent = window.document.body ?? element.parentElement;
  if (!parent) {
    console.warn('No parent element found')
    console.groupEnd()
    return { width: 0, height: 0 }
  }

  // Create a container for the clone
  const container = document.createElement('div')
  container.style.position = 'absolute'
  container.style.left = '-9999px'
  container.style.width = 'auto'
  container.style.minWidth = 'fit-content'
  container.style.height = 'auto'
  container.style.minHeight = 'fit-content'
  container.style.opacity = '0'
  container.style.pointerEvents = 'none'
  container.style.visibility = 'hidden'
  
  // Clone the element and update React keys
  console.log('Creating root in container:', container)
  const root = ReactDOM.createRoot(container)
  const content = element.firstElementChild
  console.log('First element child:', content)

  if (content) {
    console.log('Converting to React element and updating keys')
    const reactElement = content as unknown as ReactElement
    
    // Create a wrapper element with a unique key to ensure no conflicts
    const wrapperKey = `autosize-wrapper-${generateId()}`
    console.log('Created wrapper key:', wrapperKey)
    
    const wrappedContent = createElement('div', {
      key: wrapperKey,
      style: { position: 'static', visibility: 'visible' }
    }, updateChildrenKeys(reactElement))
    
    console.log('Wrapped content:', wrappedContent)
    root.render(wrappedContent)
  } else {
    console.warn('No content element found to clone')
  }

  parent.appendChild(container)
  const { width, height } = container.getBoundingClientRect()
  console.log('Measured dimensions:', { width, height })
  parent.removeChild(container)
  root.unmount()

  console.groupEnd()
  return { width, height }
}

/**
 * Update keys of all React children to be unique
 * @param children - The React children to update
 * @returns The children with updated keys
 */
export const updateChildrenKeys = (children: ReactNode): ReactNode => {
  console.group('updateChildrenKeys')
  console.log('Input children:', children)

  const result = Children.map(children, child => {
    if (!isValidElement(child)) {
      console.log('Not a valid element, returning as is:', child)
      return child
    }
    
    // Generate a unique key for this element
    const uniqueKey = `autosize-${generateId()}`
    console.log('Generated key:', uniqueKey, 'for element:', child)
    
    // Clone with new key and recursively update children
    const element = child as ReactElement<{ children?: ReactNode }>
    const cloned = cloneElement(element, {
      key: uniqueKey,
      ...element.props,
      children: updateChildrenKeys(element.props.children)
    })
    console.log('Cloned element:', cloned)
    return cloned
  })

  console.log('Result:', result)
  console.groupEnd()
  return result
}
  