import { ProjectSuggestion } from "@/server/routers/ai-helpers/aigent"
  import type { ProjectSuggestion as BaseProjectSuggestion } from "@/server/types/shared"

export function calculateProjectCosts(breakdown: NonNullable<BaseProjectSuggestion['estimatedCost']>['breakdown'] | NonNullable<ProjectSuggestion['estimatedCost']>['breakdown']) {
  if (!breakdown) return null

  const materialCosts = breakdown.materials.reduce((sum, item) => sum + item.cost, 0)
  const laborCosts = breakdown.labor.reduce((sum, item) => sum + (item.rate * item.hours), 0)
  const otherCosts = (breakdown.permits || 0) + (breakdown.management || 0) + (breakdown.contingency || 0)

  const formattedMaterials = breakdown.materials
    .map(m => [m.item, `$${m.cost.toLocaleString()}`])
    // .join(', ')

  const formattedLabor = breakdown.labor
    .filter(l => l.hours > 0 && l.rate > 0)
    .map(l => [l.task, `(${l.hours}h at $${l.rate}/h = $${(l.rate * l.hours).toLocaleString()})`])
    // .join(', ')

  const formattedOther = [
    ['Permits', `$${breakdown.permits?.toLocaleString() || 0}`],
    ['Management', `$${breakdown.management?.toLocaleString() || 0}`],
    ['Contingency', `$${breakdown.contingency?.toLocaleString() || 0}`]
  ]

  return {
    total: materialCosts + laborCosts + otherCosts,
    materials: {
      total: materialCosts,
      items: formattedMaterials,
      formatted: formattedMaterials.map(m => m.join(': ')).join(', ')
    },
    labor: {
      total: laborCosts,
      items: formattedLabor,
      formatted: formattedLabor.map(l => l.join(': ')).join(', ')
    },
    other: {
      total: otherCosts,
      items: formattedOther,
      formatted: formattedOther.map(o => o.join(': ')).join(', ')
    }
  }
} 