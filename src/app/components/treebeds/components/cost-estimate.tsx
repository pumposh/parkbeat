import { useState } from 'react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/cost'

interface CostItem {
  item: string
  cost: string | number
  isIncluded?: boolean
}

interface LaborItem {
  description: string
  hours: number
  rate: number
  isIncluded?: boolean
}

interface CostBreakdown {
  materials: {
    items: CostItem[]
    total: number
  }
  labor: {
    items: LaborItem[]
    total: number
  }
  other: {
    items: CostItem[]
    total: number
  }
  total: number
}

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

export function CostEstimate({ 
  costs, 
  isReadOnly = true,
  onChange 
}: CostEstimateProps) {
  const [isCostBreakdownExpanded, setIsCostBreakdownExpanded] = useState(!isReadOnly)
  const [editingItem, setEditingItem] = useState<EditingState | null>(null)

  const handleItemToggle = (
    section: 'materials' | 'labor' | 'other',
    index: number,
    isIncluded: boolean
  ) => {
    if (isReadOnly) return

    const updatedCosts = { ...costs }
    
    if (section === 'labor') {
      const laborItem = updatedCosts.labor.items[index] as LaborItem
      laborItem.isIncluded = isIncluded
      updatedCosts.labor.total = updatedCosts.labor.items.reduce((sum, item) => 
        sum + (item.isIncluded ? item.hours * item.rate : 0), 0
      )
    } else {
      const item = updatedCosts[section].items[index] as CostItem
      item.isIncluded = isIncluded
      updatedCosts[section].total = updatedCosts[section].items.reduce((sum, item) => 
        sum + (item.isIncluded ? parseFloat(item.cost.toString()) : 0), 0
      )
    }

    updatedCosts.total = (
      updatedCosts.materials.total + 
      updatedCosts.labor.total + 
      updatedCosts.other.total
    )

    onChange?.(updatedCosts)
  }

  const handleCostChange = (
    section: 'materials' | 'labor' | 'other',
    index: number,
    value: string | number,
    field?: 'hours' | 'rate'
  ) => {
    if (isReadOnly) return

    const updatedCosts = { ...costs }
    
    if (section === 'labor' && field) {
      const laborItem = updatedCosts.labor.items[index] as LaborItem
      laborItem[field] = parseFloat(value.toString()) || 0
      updatedCosts.labor.total = updatedCosts.labor.items.reduce((sum, item) => 
        sum + (item.isIncluded ? item.hours * item.rate : 0), 0
      )
    } else if (section !== 'labor') {
      const item = updatedCosts[section].items[index] as CostItem
      item.cost = value.toString()
      updatedCosts[section].total = updatedCosts[section].items.reduce((sum, item) => 
        sum + (item.isIncluded ? parseFloat(item.cost.toString()) : 0), 0
      )
    }

    updatedCosts.total = (
      updatedCosts.materials.total + 
      updatedCosts.labor.total + 
      updatedCosts.other.total
    )

    onChange?.(updatedCosts)
  }

  const handleEditStart = (section: 'materials' | 'labor' | 'other', index: number, field?: 'hours' | 'rate') => {
    if (isReadOnly) return
    setEditingItem({ section, index, field })
  }

  const handleEditComplete = () => {
    setEditingItem(null)
  }

  const LineItemToggle = ({ isIncluded = true, onChange }: { 
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
  )

  const EditableValue = ({ 
    value, 
    section, 
    index, 
    field,
    isIncluded = true,
    disabled = false,
    unit = '$',
  }: { 
    value: string | number
    section: 'materials' | 'labor' | 'other'
    index: number
    field?: 'hours' | 'rate'
    isIncluded?: boolean
    disabled?: boolean
    unit?: string
  }) => {
    const isEditing = editingItem?.section === section && 
                     editingItem?.index === index && 
                     editingItem?.field === field

    if (isEditing) {
      return (
        <input
          type="number"
          value={value.toString().replace(/[^0-9.]/g, '')}
          onChange={(e) => handleCostChange(section, index, e.target.value, field)}
          onBlur={handleEditComplete}
          autoFocus
          className={cn(
            "input w-[80px] text-right py-0 px-2 h-6 text-sm",
            !isIncluded && "opacity-50"
          )}
          disabled={disabled || !isIncluded}
        />
      )
    }

    return (
      <div className="flex items-center gap-2">
        <span className={cn(
          "tabular-nums text-right",
          !isIncluded && "opacity-50"
        )}>
          {unit === '$' ? formatCurrency(parseFloat(value.toString())) : value.toString()} {unit !== '$' ? unit : ''}
        </span>
        {!isReadOnly && !disabled && (
          <button
            type="button"
            onClick={() => handleEditStart(section, index, field)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <i className="fa-solid fa-pencil text-xs" />
          </button>
        )}
      </div>
    )
  }

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
            <span className="text-sm font-medium">
              {formatCurrency(costs.total)}
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
            <>
              <div className="text-gray-500 dark:text-gray-400 mb-1">Materials</div>
              {costs.materials.items.map((item, i) => (
                <div key={`material-${i}`}>
                  <div className="pl-2 text-gray-600 dark:text-gray-300 flex justify-between items-center">
                    <div className="flex items-center flex-1">
                      {!isReadOnly && (
                        <LineItemToggle
                          isIncluded={item.isIncluded ?? true}
                          onChange={(isIncluded) => handleItemToggle('materials', i, isIncluded)}
                        />
                      )}
                      <span className={cn(
                        "font-medium flex-1 pl-2",
                        !isReadOnly && !item.isIncluded && "opacity-50"
                      )}>
                        {item.item?.replace('- ', '')}
                      </span>
                    </div>
                    <EditableValue
                      value={item.cost}
                      section="materials"
                      index={i}
                      isIncluded={item.isIncluded ?? true}
                    />
                  </div>
                </div>
              ))}
            </>
          )}
          {costs.labor.items.length > 0 && costs.labor.total > 0 && (
            <>
              <div className="text-gray-500 dark:text-gray-400 mb-1">Labor</div>
              {costs.labor.items.map((item, i) => (
                <div key={`labor-${i}`}>
                  <div className="pl-2 text-gray-600 dark:text-gray-300 flex justify-between items-start gap-2">
                    <div className="flex items-center flex-1">
                      {!isReadOnly && (
                        <LineItemToggle
                          isIncluded={item.isIncluded ?? true}
                          onChange={(isIncluded) => handleItemToggle('labor', i, isIncluded)}
                        />
                      )}
                      <span className={cn(
                        "font-medium flex-1 pl-2",
                        !isReadOnly && !item.isIncluded && "opacity-50"
                      )}>
                        {item.description?.replace('- ', '')}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-2 justify-end">
                        <EditableValue
                          value={item.hours}
                          section="labor"
                          unit="h"
                          index={i}
                          field="hours"
                          isIncluded={item.isIncluded ?? true}
                        />
                        <span className="text-sm opacity-50">×</span>
                        <EditableValue
                          value={item.rate}
                          section="labor"
                          index={i}
                          field="rate"
                          isIncluded={item.isIncluded ?? true}
                        />
                      </div>
                      <div className={cn(
                        "text-sm text-gray-500 dark:text-gray-400",
                        !item.isIncluded && "opacity-50"
                      )}>
                        {formatCurrency(item.hours * item.rate)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
          {costs.other.items.length > 0 && costs.other.total > 0 && (
            <>
              <div className="text-gray-500 dark:text-gray-400 mb-1">Other</div>
              {costs.other.items.map((item, i) => (
                <div key={`other-${i}`}>
                  <div className="pl-2 text-gray-600 dark:text-gray-300 flex justify-between items-center">
                    <div className="flex items-center flex-1">
                      {!isReadOnly && (
                        <LineItemToggle
                          isIncluded={item.isIncluded ?? true}
                          onChange={(isIncluded) => handleItemToggle('other', i, isIncluded)}
                        />
                      )}
                      <span className={cn(
                        "font-medium flex-1 pl-2",
                        !isReadOnly && !item.isIncluded && "opacity-50"
                      )}>
                        {item.item?.replace('- ', '')}
                      </span>
                    </div>
                    <EditableValue
                      value={item.cost}
                      section="other"
                      index={i}
                      isIncluded={item.isIncluded ?? true}
                    />
                  </div>
                </div>
              ))}
            </>
          )}
          <div className="flex justify-between font-medium text-gray-900 dark:text-gray-100 pt-2 border-t border-gray-200 dark:border-gray-600">
            <span>Total</span>
            <span className="tabular-nums text-right min-w-[100px]">{formatCurrency(costs.total)}</span>
          </div>
        </div>
      </div>
    </div>
  )
} 