import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react'
import { cn } from '@/lib/utils'
import { formatCurrency, parseCostValue } from '@/lib/cost'
import { useDebouncedCallback } from '@/hooks/use-debounce'
import type { 
  CostBreakdown, 
  BaseCostItem,
  LaborCostItem 
} from '@/server/types/shared'
import './cost-estimate.css'

// Local interface for UI-specific type operations with cost items
type CostItem = BaseCostItem & {
  cost: string | number // Allow number for UI flexibility
}

type LaborItem = LaborCostItem

interface CostEstimateProps {
  costs: CostBreakdown
  isReadOnly?: boolean
  onChange?: (updatedCosts: CostBreakdown) => void
}

interface EditingState {
  section: 'materials' | 'labor' | 'other'
  index: number
  field?: 'hours' | 'rate'
}

// Memoized LineItemToggle component
const LineItemToggle = memo(({ isIncluded = true, onChange }: { 
  isIncluded?: boolean
  onChange: (isIncluded: boolean) => void 
}) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation()
      e.preventDefault()
      onChange(!isIncluded)
    }}
    className={cn(
      "w-4 h-4 rounded-full border transition-colors mr-2 flex-shrink-0",
      isIncluded 
        ? "bg-emerald-500 border-emerald-500 hover:bg-emerald-600 hover:border-emerald-600" 
        : "bg-transparent border-gray-300 dark:border-gray-600 hover:border-emerald-500 dark:hover:border-emerald-500"
    )}
    role="checkbox"
    aria-checked={isIncluded}
  >
    {isIncluded && (
      <div className="w-2 h-2 bg-white rounded-full m-auto" />
    )}
  </button>
))

LineItemToggle.displayName = 'LineItemToggle'

// Memoized EditableValue component
const EditableValue = memo(({ 
  value, 
  section, 
  index, 
  field,
  isIncluded = true,
  disabled = false,
  unit = '$',
  isReadOnly,
  onEdit,
  onValueChange,
  onEditComplete,
}: { 
  value: string | number
  section: 'materials' | 'labor' | 'other'
  index: number
  field?: 'hours' | 'rate'
  isIncluded?: boolean
  disabled?: boolean
  unit?: string
  isReadOnly: boolean
  onEdit: (section: 'materials' | 'labor' | 'other', index: number, field?: 'hours' | 'rate') => void
  onValueChange: (section: 'materials' | 'labor' | 'other', index: number, value: string | number, field?: 'hours' | 'rate') => void
  onEditComplete: () => void
  isEditing: boolean
}) => {
  const cleanValue = (v: string | number) => {
    // Make sure we get a string that only contains numbers and decimal points
    const cleaned = v.toString().replace(/[^0-9.]/g, '')
    
    // If it's just a decimal point, return 0
    if (cleaned === '.' || cleaned === '') {
      return '0'
    }
    
    // Handle multiple decimal points
    const parts = cleaned.split('.')
    if (parts.length > 2) {
      return parts[0] + '.' + parts.slice(1).join('')
    }
    
    return cleaned
  }

  const [localValue, _setLocalValue] = useState(cleanValue(value))

  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    const newValue = cleanValue(value)
    if (newValue !== localValue && !isFocused) {
      _setLocalValue(newValue)
    }
  }, [value, isFocused])

  // Set cursor to the end of input when focused
  useEffect(() => {
    if (isFocused && ref.current) {
      const length = ref.current.value.length;
      ref.current.setSelectionRange(length, length);
    }
  }, [isFocused]);

  const debouncedCallback = useDebouncedCallback((v: string) => {
    onValueChange(section, index, v, field)
  }, 1000, [onEditComplete])

  const setLocalValue = (v: string) => {
    if (v === '' || v === '.') {
      _setLocalValue('0')
      onValueChange(section, index, '0', field)
    } else {
      // Clean the input value to only allow valid numbers
      const cleanedValue = v.replace(/[^0-9.]/g, '')
      
      // Handle multiple decimal points
      const parts = cleanedValue.split('.')
      let finalValue = cleanedValue
      if (parts.length > 2) {
        finalValue = parts[0] + '.' + parts.slice(1).join('')
      }
      
      // Remove leading zeros in whole number part (unless it's just 0)
      if (finalValue !== '0') {
        const parts = finalValue.split('.')
        const whole = parts[0] || ''
        const decimal = parts.length > 1 ? parts[1] : undefined
        
        finalValue = whole.replace(/^0+(?=\d)/, '') + (decimal ? `.${decimal}` : '')
      }
      
      _setLocalValue(finalValue)
      onValueChange(section, index, finalValue, field)
    }
  }

  const mostRecentValue = useRef(localValue)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      debouncedCallback.flush?.()
      onEditComplete()
    } else if (e.key === 'Escape') {
      // Reset to original value and complete editing
      setLocalValue(mostRecentValue.current)
      onEditComplete()
    }
  }, [onEditComplete, debouncedCallback])

  // Format the display value for both display and to calculate width
  const formattedValue = useMemo(() => {
    const stripped = value.toString().replaceAll('$', '')
    if (unit === '$') {
      const numericValue = parseFloat(stripped);
      // Use the same format logic as in formatCurrency
      const hasCents = (numericValue - Math.floor(numericValue)) !== 0;
      
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: hasCents ? 2 : 0,
        maximumFractionDigits: hasCents ? 2 : 0
      }).format(numericValue);
    } 
    return stripped;
  }, [value, unit])

  // Calculate approximate width based on the formatted value
  const minWidth = useMemo(() => {
    const valueLength = localValue.toString().length
    return Math.max(10, valueLength * 10) + 2 // 8px per character is a rough estimate
  }, [localValue])

  const ref = useRef<HTMLInputElement>(null)


  if (!isReadOnly) {
    return (
      <div className="inline-flex items-center flex-shrink-0 gap-2">
        <div className="flex items-center gap-0">
          {unit === '$' && (
            <span className="ml-1 text-md font-mono text-[16px]">$</span>
          )}
          <input
            ref={ref}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onFocus={() => {
              mostRecentValue.current = localValue
              setIsFocused(true)
              setTimeout(() => {
                if (ref.current) {
                  const length = ref.current.value.length;
                  ref.current.setSelectionRange(length, length);
                }
              }, 0);
            }}
            onBlur={() => {
              setIsFocused(false)
              onEditComplete()
            }}
            onKeyDown={handleKeyDown}
            className={cn(
              "CostEstimateInput font-mono text-md bg-transparent border-0 outline-none tabular-nums text-right p-0",
              !isIncluded && "opacity-50"
            )}
            disabled={disabled || !isIncluded}
            style={{ 
              maxWidth: `${minWidth}px`,
              width: `${minWidth}px`,
              minWidth: `${minWidth}px`
            }}
          />
          {unit !== '$' && (
            <span className="ml-1 text-md font-mono text-[16px]">{unit}</span>
          )}
        </div>
        <div
          onClick={() => {
            onEdit(section, index, field)
            if (ref.current) {
              ref.current.focus()
            }
          }}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0"
          aria-label={`Edit ${section} value`}
        >
          <i className="fa-solid fa-chevron-left text-xs" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-0 flex-shrink-0">
      <span
        className={cn(
          "tabular-nums text-right font-mono text-md",
          !isReadOnly && !disabled && "cursor-pointer",
          !isIncluded && "opacity-50"
        )}
        onClick={() => !isReadOnly && !disabled && onEdit(section, index, field)}
      >
        <span>{formattedValue}</span>
        {unit !== '$' && <span className="ml-[2px]">{unit}</span>}
      </span>
      {!isReadOnly && !disabled && (
        <button
          type="button"
          onClick={() => onEdit(section, index, field)}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0"
          aria-label={`Edit ${section} value`}
        >
          <i className="fa-solid fa-pencil text-xs" />
        </button>
      )}
    </div>
  )
})

EditableValue.displayName = 'EditableValue'

// Memoized CostSection component
const CostSection = memo(({ 
  title, 
  items, 
  section, 
  isReadOnly, 
  editingItem,
  onItemToggle,
  onEditStart,
  onCostChange,
  onEditComplete
}: {
  title: string
  items: (CostItem | LaborItem)[]
  section: 'materials' | 'labor' | 'other'
  isReadOnly: boolean
  editingItem: EditingState | null
  onItemToggle: (section: 'materials' | 'labor' | 'other', index: number, isIncluded: boolean) => void
  onEditStart: (section: 'materials' | 'labor' | 'other', index: number, field?: 'hours' | 'rate') => void
  onCostChange: (section: 'materials' | 'labor' | 'other', index: number, value: string | number, field?: 'hours' | 'rate') => void
  onEditComplete: () => void
}) => {
  if (items.length === 0) return null
  
  // Filter out items with isIncluded === false when in read-only mode
  const displayItems = isReadOnly 
    ? items.filter(item => item.isIncluded !== false) 
    : items;
    
  if (displayItems.length === 0) return null;

  return (
    <>
      <div className="text-gray-500 dark:text-gray-400 mb-1">{title}</div>
      {displayItems.map((item, i) => {
        // Find the original index in the items array
        const originalIndex = items.findIndex(originalItem => 
          originalItem === item
        );
        
        if (section === 'labor') {
          const laborItem = item as LaborItem
          const isHoursEditing = editingItem?.section === section && 
                               editingItem?.index === originalIndex && 
                               editingItem?.field === 'hours'
          const isRateEditing = editingItem?.section === section && 
                              editingItem?.index === originalIndex && 
                              editingItem?.field === 'rate'

          return (
            <div key={`labor-${originalIndex}`}>
              <div className="pl-2 text-gray-600 dark:text-gray-300 flex justify-between items-start gap-2">
                <div className="flex items-center flex-1">
                  {!isReadOnly && (
                    <LineItemToggle
                      isIncluded={laborItem.isIncluded ?? true}
                      onChange={(isIncluded) => onItemToggle(section, originalIndex, isIncluded)}
                    />
                  )}
                  <span className={cn(
                    "font-medium flex-1 pl-2",
                    !isReadOnly && !laborItem.isIncluded && "opacity-50"
                  )}>
                    {laborItem.description?.replace('- ', '')}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-2 justify-end">
                    <EditableValue
                      value={laborItem.hours}
                      section={section}
                      unit="h"
                      index={originalIndex}
                      field="hours"
                      isIncluded={laborItem.isIncluded ?? true}
                      isReadOnly={isReadOnly}
                      onEdit={onEditStart}
                      onValueChange={onCostChange}
                      onEditComplete={onEditComplete}
                      isEditing={isHoursEditing}
                    />
                    <span className="text-sm opacity-50">×</span>
                    <EditableValue
                      value={laborItem.rate}
                      section={section}
                      index={originalIndex}
                      field="rate"
                      isIncluded={laborItem.isIncluded ?? true}
                      isReadOnly={isReadOnly}
                      onEdit={onEditStart}
                      onValueChange={onCostChange}
                      onEditComplete={onEditComplete}
                      isEditing={isRateEditing}
                    />
                  </div>
                  <div className={cn(
                    "text-sm text-gray-500 dark:text-gray-400 font-mono text-md",
                    !isReadOnly && !laborItem.isIncluded && "opacity-50"
                  )}>
                    {formatCurrency(laborItem.hours * laborItem.rate)}
                  </div>
                </div>
              </div>
            </div>
          )
        } else {
          const costItem = item as CostItem
          const isEditing = editingItem?.section === section && 
                          editingItem?.index === originalIndex && 
                          editingItem?.field === undefined

          return (
            <div key={`${section}-${originalIndex}`}>
              <div className="pl-2 text-gray-600 dark:text-gray-300 flex justify-between items-center">
                <div className="flex items-center flex-1">
                  {!isReadOnly && (
                    <LineItemToggle
                      isIncluded={costItem.isIncluded ?? true}
                      onChange={(isIncluded) => onItemToggle(section, originalIndex, isIncluded)}
                    />
                  )}
                  <span className={cn(
                    "font-medium flex-1 pl-2",
                    !isReadOnly && !costItem.isIncluded && "opacity-50"
                  )}>
                    {costItem.item?.replace('- ', '')}
                  </span>
                </div>
                <EditableValue
                  value={costItem.cost}
                  section={section}
                  index={originalIndex}
                  isIncluded={costItem.isIncluded ?? true}
                  isReadOnly={isReadOnly}
                  onEdit={onEditStart}
                  onValueChange={onCostChange}
                  onEditComplete={onEditComplete}
                  isEditing={isEditing}
                />
              </div>
            </div>
          )
        }
      })}
    </>
  )
})

CostSection.displayName = 'CostSection'

export function CostEstimate({ 
  costs, 
  isReadOnly = true,
  onChange 
}: CostEstimateProps) {
  const [isCostBreakdownExpanded, setIsCostBreakdownExpanded] = useState(!isReadOnly)
  const [editingItem, setEditingItem] = useState<EditingState | null>(null)
  
  // Memoize the costs to compare with previous values
  const memoizedCosts = useMemo(() => costs, [
    costs.materials.total,
    costs.labor.total,
    costs.other.total,
    costs.total,
    // We don't include the individual items in the dependency array
    // to prevent re-renders when only the user's edits change
  ])
  
  // Create a debounced version of the commitChange function
  const debouncedCommitChange = useDebouncedCallback(
    (section: 'materials' | 'labor' | 'other', index: number, value: string | number, field?: 'hours' | 'rate') => {
      if (isReadOnly) return

      const updatedCosts = { ...costs }
      
      if (section === 'labor' && field) {
        const laborItem = updatedCosts.labor.items[index] as LaborItem
        // Ensure numerical values for calculations
        laborItem[field] = parseFloat(value.toString()) || 0
        
        // Recalculate labor section total based on included items
        updatedCosts.labor.total = updatedCosts.labor.items.reduce((sum, item) => 
          sum + (item.isIncluded ? (parseFloat(item.hours.toString()) || 0) * (parseFloat(item.rate.toString()) || 0) : 0), 0
        )
      } else if (section !== 'labor') {
        const item = updatedCosts[section].items[index] as CostItem
        // Parse the input value to a number first
        const numericValue = parseFloat(value.toString()) || 0;
        
        // Format based on whether it has cents
        const hasCents = (numericValue - Math.floor(numericValue)) !== 0
        item.cost = `$${hasCents ? numericValue.toFixed(2) : numericValue.toFixed(0)}`;
        
        // Recalculate section total based on included items
        updatedCosts[section].total = updatedCosts[section].items.reduce((sum, item) => 
          sum + (item.isIncluded ? parseCostValue(item.cost) : 0), 0
        )
      }

      // Recalculate the overall total
      updatedCosts.total = (
        updatedCosts.materials.total + 
        updatedCosts.labor.total + 
        updatedCosts.other.total
      )

      onChange?.(updatedCosts)
    },
    800,
    [memoizedCosts, isReadOnly, onChange]
  )

  const handleItemToggle = useCallback((
    section: 'materials' | 'labor' | 'other',
    index: number,
    isIncluded: boolean
  ) => {
    if (isReadOnly) return

    const updatedCosts = { ...costs }
    
    if (section === 'labor') {
      const laborItem = updatedCosts.labor.items[index] as LaborItem
      laborItem.isIncluded = isIncluded
      
      // Recalculate labor section total based on included items
      updatedCosts.labor.total = updatedCosts.labor.items.reduce((sum, item) => 
        sum + (item.isIncluded ? (parseFloat(item.hours.toString()) || 0) * (parseFloat(item.rate.toString()) || 0) : 0), 0
      )
    } else {
      const item = updatedCosts[section].items[index] as CostItem
      item.isIncluded = isIncluded
      
      // Recalculate section total based on included items
      updatedCosts[section].total = updatedCosts[section].items.reduce((sum, item) => 
        sum + (item.isIncluded ? parseCostValue(item.cost) : 0), 0
      )
    }

    // Recalculate the overall total
    updatedCosts.total = (
      updatedCosts.materials.total + 
      updatedCosts.labor.total + 
      updatedCosts.other.total
    )

    onChange?.(updatedCosts)
  }, [costs, isReadOnly, onChange])

  const handleCostChange = useCallback((
    section: 'materials' | 'labor' | 'other',
    index: number,
    value: string | number,
    field?: 'hours' | 'rate'
  ) => {
    if (isReadOnly) return
    
    // Debounce the actual change
    debouncedCommitChange(section, index, value, field)
  }, [isReadOnly, debouncedCommitChange])

  const handleEditStart = useCallback((section: 'materials' | 'labor' | 'other', index: number, field?: 'hours' | 'rate') => {
    if (isReadOnly) return
    
    // Initialize temp value with current value
    const valueKey = `${section}-${index}-${field || 'cost'}`
    let currentValue: string | number
    
    if (section === 'labor' && field) {
      currentValue = costs.labor.items[index]?.[field] ?? ''
    } else if (section !== 'labor') {
      currentValue = (costs[section].items[index] as CostItem)?.cost ?? ''
    } else {
      currentValue = ''
    }
    
    setEditingItem({ section, index, field })
  }, [costs, isReadOnly])

  const handleEditComplete = useCallback(() => {
    if (!editingItem) return
    // Commit the final value when input loses focus
    debouncedCommitChange.flush?.()
    
    setEditingItem(null)
  }, [editingItem, debouncedCommitChange])

  // Memoize the total display
  const totalDisplay = useMemo(() => formatCurrency(costs.total), [costs.total])

  return (
    <div className="">
      <div className="mt-4">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setIsCostBreakdownExpanded(!isCostBreakdownExpanded)
          }}
          className="w-full flex items-center justify-between text-sm font-medium text-gray-900 dark:text-gray-100 mb-2"
        >
          <span>Cost estimate</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium font-mono text-md">
              {totalDisplay}
            </span>
            <i className={cn(
              "fa-solid fa-chevron-down transition-transform",
              isCostBreakdownExpanded && "rotate-180"
            )} />
          </div>
        </button>
        <div className={cn(
          "space-y-2 text-sm overflow-hidden transition-all duration-200 ease-in-out",
          isCostBreakdownExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
        )}>
          {costs.materials.items.length > 0 && (
            <CostSection
              title="Materials"
              items={costs.materials.items}
              section="materials"
              isReadOnly={isReadOnly}
              editingItem={editingItem}
              onItemToggle={handleItemToggle}
              onEditStart={handleEditStart}
              onCostChange={handleCostChange}
              onEditComplete={handleEditComplete}
            />
          )}
          
          {costs.labor.items.length > 0 && (
            <CostSection
              title="Labor"
              items={costs.labor.items}
              section="labor"
              isReadOnly={isReadOnly}
              editingItem={editingItem}
              onItemToggle={handleItemToggle}
              onEditStart={handleEditStart}
              onCostChange={handleCostChange}
              onEditComplete={handleEditComplete}
            />
          )}
          
          {costs.other.items.length > 0 && (
            <CostSection
              title="Other"
              items={costs.other.items}
              section="other"
              isReadOnly={isReadOnly}
              editingItem={editingItem}
              onItemToggle={handleItemToggle}
              onEditStart={handleEditStart}
              onCostChange={handleCostChange}
              onEditComplete={handleEditComplete}
            />
          )}
          
          <div className="flex justify-between font-medium text-gray-900 dark:text-gray-100 pt-2 border-t border-gray-200 dark:border-gray-600">
            <span>Total</span>
            <span className="tabular-nums text-right min-w-[100px] font-mono text-md">{totalDisplay}</span>
          </div>
        </div>
      </div>
    </div>
  )
} 