import { generateId } from './id'
import type { 
  ProjectCostItem, 
  CostBreakdown, 
  ProjectSuggestion,
  ProjectCostBreakdown,
  CostRevision,
  BaseCostItem,
  LaborCostItem
} from '@/server/types/shared'
import { HydratableDate as Date } from '@/lib/utils'

const cleanItemTitle = (title: string) => {
  return title.replace('- ', '').replace(/\([^)]*\)/g, '').replace(/:/g, '').trim()
}

/**
 * Safely parses a cost value from either a string or number
 */
export function parseCostValue(value: string | number): number {
  if (typeof value === 'string') {
    return Number(parseFloat(value.replace(/[^0-9.-]+/g, ''))) || 0
  } else if (typeof value === 'number') {
    return value
  }
  return 0
}

export function calculateProjectCosts(breakdown?: CostBreakdown | any): CostBreakdown | null {
  if (!breakdown) return null

  // Ensure the breakdown is in the new nested format
  const nestedBreakdown = convertFlatToNestedCostBreakdown(breakdown)

  const materials = {
    items: nestedBreakdown.materials.items?.map(item => ({
      ...item,
      item: cleanItemTitle(item.item),
      isIncluded: item.isIncluded ?? true
    })),
    total: nestedBreakdown.materials.items?.reduce((sum: number, item: BaseCostItem) => 
      sum + (item.isIncluded ? parseCostValue(item.cost) : 0), 0) || 0
  }

  const labor = {
    items: nestedBreakdown.labor.items?.map(item => ({
      ...item,
      description: cleanItemTitle(item.description),
      isIncluded: item.isIncluded ?? true
    })),
    total: nestedBreakdown.labor.items?.reduce((sum: number, item: LaborCostItem) => 
      sum + ((item.isIncluded) ? parseCostValue(item.hours) * parseCostValue(item.rate) : 0), 0) || 0
  }

  const other = {
    items: nestedBreakdown.other.items?.map(item => ({
      ...item,
      item: cleanItemTitle(item.item),
      isIncluded: item.isIncluded ?? true
    })),
    total: nestedBreakdown.other.items?.reduce((sum: number, item: BaseCostItem) => 
      sum + (item.isIncluded ? parseCostValue(item.cost) : 0), 0) || 0
  }

  return {
    materials,
    labor,
    other,
    total: materials.total + labor.total + other.total
  }
}

export function convertSuggestionToProjectCosts(suggestion: ProjectSuggestion): {
  costItems: ProjectCostItem[]
  totalCost: number
  costBreakdown: ProjectCostBreakdown
} | null {
  const costs = calculateProjectCosts(suggestion.estimatedCost?.breakdown)
  if (!costs) return null

  const projectCosts: ProjectCostItem[] = []

  // Convert materials
  costs.materials.items?.forEach((item: BaseCostItem) => {
    const costValue = parseCostValue(item.cost)
    projectCosts.push({
      id: generateId(),
      type: 'material',
      name: cleanItemTitle(item.item),
      total_cost: costValue,
      is_required: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  })

  // Convert labor
  costs.labor.items?.forEach((item: LaborCostItem) => {
    projectCosts.push({
      id: generateId(),
      type: 'labor',
      name: cleanItemTitle(item.description),
      quantity: item.hours,
      unit: 'hours',
      unit_cost: item.rate,
      total_cost: item.hours * item.rate,
      is_required: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  })

  // Convert other costs
  costs.other.items?.forEach((item: BaseCostItem) => {
    const costValue = parseCostValue(item.cost)
    projectCosts.push({
      id: generateId(),
      type: 'other',
      name: cleanItemTitle(item.item),
      total_cost: costValue,
      is_required: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  })

  // Convert to the flat structure expected by the DB schema
  return {
    costItems: projectCosts,
    totalCost: costs.total,
    costBreakdown: {
      materials: costs.materials.items?.map(item => ({
        ...item,
        isIncluded: true
      })),
      labor: costs.labor.items?.map(item => ({
        description: item.description,
        hours: item.hours,
        rate: item.rate,
        isIncluded: true
      })),
      other: costs.other.items?.map(item => ({
        ...item,
        isIncluded: true
      }))
    }
  }
}

export function createCostRevision(
  projectId: string, 
  previousTotal: number | null,
  newTotal: number,
  changedItems: ProjectCostItem[],
  reason: string,
  userId: string
): CostRevision {
  return {
    id: generateId(),
    project_id: projectId,
    revision_number:  1,
    previous_total: previousTotal,
    new_total: newTotal,
    change_reason: reason,
    changed_items: changedItems,
    created_by: userId,
    created_at: new Date().toISOString()
  }
}

export function formatCurrency(amount: number): string {
  // Check if the amount has cents (decimal part)
  const hasCents = amount % 1 !== 0;
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0
  }).format(amount)
}

/**
 * Converts a flat cost breakdown (old format) to the nested format (new structure)
 */
export function convertFlatToNestedCostBreakdown(flatBreakdown: any): CostBreakdown {
  // Handle case where we already have the nested format
  if (flatBreakdown?.materials?.items) {
    const result = { ...flatBreakdown } as CostBreakdown;
    // Ensure the total is calculated correctly
    result.total = result.materials.total + result.labor.total + result.other.total;
    return result;
  }

  // If we have the old format, convert it
  if (Array.isArray(flatBreakdown?.materials)) {
    const materialsTotal = flatBreakdown.materials?.reduce((sum: number, item: any) => 
      sum + (item.isIncluded !== false ? parseCostValue(item.cost) : 0), 0) || 0;
    
    const laborTotal = flatBreakdown.labor?.reduce((sum: number, item: any) => 
      sum + (item.isIncluded !== false ? (item.hours || 0) * (item.rate || 0) : 0), 0) || 0;
    
    const otherTotal = flatBreakdown.other?.reduce((sum: number, item: any) => 
      sum + (item.isIncluded !== false ? parseCostValue(item.cost) : 0), 0) || 0;
    
    const totalCost = materialsTotal + laborTotal + otherTotal;
    
    return {
      materials: {
        items: flatBreakdown.materials?.map((item: any) => {
          const cost = typeof item.cost === 'number' ? item.cost : parseCostValue(item.cost || '0');
          const hasCents = (cost - Math.floor(cost)) !== 0;
          return {
            item: item.item || '',
            cost: `$${hasCents ? cost.toFixed(2) : cost.toFixed(0)}`,
            isIncluded: item.isIncluded ?? true
          };
        }) || [],
        total: materialsTotal
      },
      labor: {
        items: flatBreakdown.labor?.map((item: any) => ({
          task: item.task,
          description: item.description || '',
          hours: typeof item.hours === 'number' ? item.hours : 0,
          rate: typeof item.rate === 'number' ? item.rate : 0,
          isIncluded: item.isIncluded ?? true
        })) || [],
        total: laborTotal
      },
      other: {
        items: flatBreakdown.other?.map((item: any) => {
          const cost = typeof item.cost === 'number' ? item.cost : parseCostValue(item.cost || '0');
          const hasCents = (cost - Math.floor(cost)) !== 0;
          return {
            item: item.item || '',
            cost: `$${hasCents ? cost.toFixed(2) : cost.toFixed(0)}`,
            isIncluded: item.isIncluded ?? true
          };
        }) || [],
        total: otherTotal
      },
      total: totalCost
    }
  }

  // If there's no breakdown, return an empty one
  return {
    materials: { items: [], total: 0 },
    labor: { items: [], total: 0 },
    other: { items: [], total: 0 },
    total: 0
  }
}

/**
 * Converts a nested cost breakdown to a flat project cost breakdown format
 */
export function convertNestedToFlatCostBreakdown(nestedBreakdown: CostBreakdown): ProjectCostBreakdown {
  return {
    materials: nestedBreakdown.materials.items?.map(item => ({
      item: item.item,
      cost: item.cost,
      isIncluded: item.isIncluded
    })),
    labor: nestedBreakdown.labor.items?.map(item => ({
      description: item.description,
      hours: item.hours,
      rate: item.rate,
      task: item.task,
      isIncluded: item.isIncluded
    })),
    other: nestedBreakdown.other.items?.map(item => ({
      item: item.item,
      cost: item.cost,
      isIncluded: item.isIncluded
    }))
  }
} 