'use client';

import { useState, ReactNode } from 'react';
import { BetaTag } from './beta-tag';
import { DebugMenu } from './debug-menu';

/**
 * A component that combines the beta tag and debug menu dialog.
 * It accepts a child component as a trigger slot to open the debug menu dialog.
 * If no children are provided, it falls back to using the BetaTag component.
 */
export function DebugControl({ 
  className, 
  children 
}: { 
  className?: string;
  children?: ReactNode;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const handleTriggerClick = async (open: boolean) => {
    if (!open) await asyncTimeout(300);
    setIsDialogOpen(open);
  };

  // Simplify the implementation to avoid type issues
  let triggerElement;
  
  if (children) {
    // If children are provided, wrap them in a div
    triggerElement = (
      <div onClick={() => handleTriggerClick(true)} className={className}>
        {children}
      </div>
    );
  } else {
    // Otherwise, fall back to the BetaTag
    triggerElement = (
      <BetaTag 
        className={className} 
        onClick={() => handleTriggerClick(true)} 
      />
    );
  }

  return (
    <>
      {triggerElement}
      <DebugMenu 
        isOpen={isDialogOpen} 
        onOpenChange={(open) => handleTriggerClick(open)} 
        initialTabId="connection"
      />
    </>
  );
}

// Helper function for timeout
const asyncTimeout = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
} 