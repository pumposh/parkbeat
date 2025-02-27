import { generateId } from './id'
import type { 
  ProjectCostItem, 
  CostBreakdown, 
  ProjectSuggestion,
  ProjectCostBreakdown,
  CostRevision,
} from '@/server/types/shared'
import { HydratableDate as Date } from '@/lib/utils'

const cleanItemTitle = (title: string) => {
  return title.replace('- ', '').replace(/\([^)]*\)/g, '').replace(/:/g, '').trim()
}

export function calculateProjectCosts(breakdown?: CostBreakdown) {
  if (!breakdown) return null

  const maybeParseFloat = (value: string | number) => {
    let number: number;
    if (typeof value === 'string') {
      number = Number(parseFloat(value.replace(/[^0-9.-]+/g, '')))
    } else if (typeof value === 'number') {
      number = value
    } else {
      return 0
    }

    if (isNaN(number)) {
      return 0
    }

    return number
  }

  const materials = {
    items: breakdown.materials?.map(item => ({
      ...item,
      item: cleanItemTitle(item.item),
      isIncluded: item.isIncluded ?? true
    })) || [],
    total: breakdown.materials?.reduce((sum: number, item: { item: string, cost: string, isIncluded?: boolean }) => 
      sum + (item.isIncluded ?? true ? maybeParseFloat(item.cost) : 0), 0) || 0
  }

  const labor = {
    items: breakdown.labor?.map(item => ({
      ...item,
      description: cleanItemTitle(item.description),
      isIncluded: item.isIncluded ?? true
    })) || [],
    total: breakdown.labor?.reduce((sum: number, item: { description: string, hours: number, rate: number, isIncluded?: boolean }) => 
      sum + ((item.isIncluded ?? true) ? maybeParseFloat(item.hours) * maybeParseFloat(item.rate) : 0), 0) || 0
  }

  const other = {
    items: breakdown.other?.map(item => ({
      ...item,
      item: cleanItemTitle(item.item),
      isIncluded: item.isIncluded ?? true
    })) || [],
    total: breakdown.other?.reduce((sum: number, item: { item: string, cost: string, isIncluded?: boolean }) => 
      sum + (item.isIncluded ?? true ? maybeParseFloat(item.cost) : 0), 0) || 0
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
  costs.materials.items?.forEach((item: { item: string, cost: string }) => {
    const costValue = parseFloat(item.cost?.replace?.(/[^0-9.-]+/g, ''))
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
  costs.labor.items?.forEach((item: { description: string, hours: number, rate: number, task?: string }) => {
    const hourMatch = item.description?.match(/(\d+)\s*hours?/)
    const rateMatch = item.description?.match(/\$(\d+)\/hour/)
    
    projectCosts.push({
      id: generateId(),
      type: 'labor',
      name: cleanItemTitle(item.description) || cleanItemTitle(item.task || ''),
      quantity: hourMatch ? parseInt(hourMatch[1] || '0') : undefined,
      unit: 'hours',
      unit_cost: rateMatch ? parseInt(rateMatch[1] || '0') : undefined,
      total_cost: item.hours * item.rate,
      is_required: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  })

  // Convert other costs
  costs.other.items?.forEach((item: { item: string, cost: string }) => {
    const costValue = parseFloat(item.cost?.replace?.(/[^0-9.-]+/g, ''))
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

  return {
    costItems: projectCosts,
    totalCost: costs.total,
    costBreakdown: {
      materials: costs.materials.items.map(item => ({
        ...item,
        isIncluded: true
      })),
      labor: costs.labor.items.map(item => ({
        ...item,
        isIncluded: true
      })),
      other: costs.other.items.map(item => ({
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
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
} 