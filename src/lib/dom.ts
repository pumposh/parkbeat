import { Children, isValidElement, cloneElement, createElement, type ReactNode, type ReactElement } from 'react'
import { generateId } from './id'
import ReactDOM from 'react-dom/client'

/**
 * Get the auto-size of an element
 * @param element - The element to get the auto-size of
 * @returns The auto-size of the element
 */
export const getElementAutoSize = (element: HTMLElement) => {
  const parent = window.document.body ?? element.parentElement;
  if (!parent) {
    return { width: 0, height: 0 }
  }

  // Create a container to measure the element
  const container = document.createElement('div')
  container.style.position = 'absolute'
  container.style.visibility = 'hidden'
  container.style.pointerEvents = 'none'
  container.style.top = '0'
  container.style.left = '0'
  container.style.width = 'auto'
  container.style.height = 'auto'
  container.style.maxWidth = 'none'
  container.style.maxHeight = 'none'
  container.style.overflow = 'visible'
  container.style.display = 'inline-block'

  // Clone the element's content
  const contentElement = element.querySelector('[data-content]')
  const root = ReactDOM.createRoot(container)

  if (contentElement) {
    const reactElement = (contentElement as any)._reactRootContainer?._internalRoot?.current?.child?.memoizedProps?.children
    
    // Wrap the content in a div with the same styles as the original element
    const wrappedContent = createElement('div', {
      style: { position: 'static', visibility: 'visible' }
    }, updateChildrenKeys(reactElement))
    
    root.render(wrappedContent)
  }

  parent.appendChild(container)
  const { width, height } = container.getBoundingClientRect()
  parent.removeChild(container)
  root.unmount()

  return { width, height }
}

/**
 * Update keys of all React children to be unique
 * @param children - The React children to update
 * @returns The children with updated keys
 */
export const updateChildrenKeys = (children: ReactNode): ReactNode => {
  // Remove console logging to prevent potential infinite recursion with logger
  return Children.map(children, child => {
    if (!isValidElement(child)) {
      return child
    }
    
    // Generate a unique key for this element
    const uniqueKey = `autosize-${generateId()}`
    
    // Clone with new key and recursively update children
    const element = child as ReactElement<{ children?: ReactNode }>
    const cloned = cloneElement(element, {
      key: uniqueKey,
      ...element.props,
      children: updateChildrenKeys(element.props.children)
    })
    return cloned
  })
}
  