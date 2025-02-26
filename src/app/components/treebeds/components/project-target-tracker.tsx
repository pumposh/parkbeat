'use client'

import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/cost'

interface ProjectTargetTrackerProps {
  currentAmount: number
  targetAmount: number
  className?: string
}

export function ProjectTargetTracker({ 
  currentAmount, 
  targetAmount, 
  className 
}: ProjectTargetTrackerProps) {
  // Calculate percentage with a maximum of 100%
  const percentage = Math.round((currentAmount / targetAmount) * 100) || 0
  
  // Determine color based on percentage
  const getColorClass = () => {
    if (percentage < 25) return 'bg-gray-500'
    if (percentage < 50) return 'bg-orange-800'
    if (percentage < 75) return 'bg-orange-500'
    if (percentage < 100) return 'bg-yellow-500'
    return 'bg-green-500'
  }
  
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex justify-between items-center text-xs text-muted-foreground">
        <div className="font-medium">
          {formatCurrency(currentAmount)} raised
        </div>
        <div>
          {percentage}% of {formatCurrency(targetAmount)}
        </div>
      </div>
      
      <div className="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div 
          className={cn("h-full transition-all duration-500 ease-in-out", getColorClass())}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  )
} 