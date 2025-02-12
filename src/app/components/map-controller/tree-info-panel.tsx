import { cn } from '@/lib/utils'
import { capitalize } from '@/lib/str'
import type { Tree } from '../treebeds/live-trees'

interface TreeInfoPanelProps {
  tree: Tree
  position: { x: number; y: number }
  isVisible: boolean
}

export const TreeInfoPanel = ({ tree, position, isVisible }: TreeInfoPanelProps) => {
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(tree._meta_created_at)

  return (
    <div 
      className={cn(
        "tree-info-panel frosted-glass",
        isVisible && "visible",
        "text-zinc-800 dark:text-zinc-50"
      )}
      style={{ 
        position: 'absolute',
        left: position.x,
        top: position.y - 8,
        transform: `translate(-50%, calc(-100% - 48px))`,
      }}
    >
      <div className={cn(
        "tree-status",
        tree.status
      )}>
        <i className={cn(
          "fa-solid",
          {
            'fa-seedling': tree.status === 'draft',
            'fa-tree': tree.status === 'live',
            'fa-archive': tree.status === 'archived'
          }
        )} />
        {capitalize(tree.status)}
      </div>
      <div className="tree-name">{tree.name}</div>
      <div className="tree-meta">Started {formattedDate}</div>
    </div>
  )
} 