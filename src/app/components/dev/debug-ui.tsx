'use client';

import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

/**
 * Shared UI components for debug controls to ensure consistent styling
 */

interface DebugPanelProps {
  children: ReactNode;
  className?: string;
}

export function DebugPanel({ children, className }: DebugPanelProps) {
  return (
    <div className={cn(
      "bg-white/90 dark:bg-zinc-800/90 backdrop-blur-md",
      "shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.24)]",
      "border border-zinc-200/50 dark:border-zinc-700/50",
      "p-3 rounded-lg text-sm text-zinc-800 dark:text-white",
      className
    )}>
      {children}
    </div>
  );
}

interface DebugToggleButtonProps {
  onClick: () => void;
  icon: string;
  title: string;
  className?: string;
  children?: ReactNode;
}

export function DebugToggleButton({ onClick, icon, title, className }: DebugToggleButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center justify-center",
        "w-10 h-10 rounded-full",
        "bg-white/90 dark:bg-zinc-800/90 backdrop-blur-md",
        "shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.24)]",
        "border border-zinc-200/50 dark:border-zinc-700/50",
        "text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white transition-colors",
        className
      )}
      title={title}
    >
      <i className={`fa-solid ${icon}`}></i>
    </button>
  );
}

interface DebugButtonProps {
  onClick: () => void;
  disabled?: boolean;
  variant?: 'success' | 'danger' | 'neutral';
  children: ReactNode;
  className?: string;
}

export function DebugButton({ 
  onClick, 
  disabled = false, 
  variant = 'neutral', 
  children,
  className 
}: DebugButtonProps) {
  const variantClasses = {
    success: disabled 
      ? "bg-zinc-200 dark:bg-zinc-600/80 text-zinc-500 dark:text-zinc-400 cursor-not-allowed" 
      : "bg-emerald-100 dark:bg-emerald-500/80 text-emerald-700 dark:text-white hover:bg-emerald-200 dark:hover:bg-emerald-500",
    danger: disabled 
      ? "bg-zinc-200 dark:bg-zinc-600/80 text-zinc-500 dark:text-zinc-400 cursor-not-allowed" 
      : "bg-red-100 dark:bg-red-500/80 text-red-700 dark:text-white hover:bg-red-200 dark:hover:bg-red-500",
    neutral: disabled 
      ? "bg-zinc-200 dark:bg-zinc-600/80 text-zinc-500 dark:text-zinc-400 cursor-not-allowed" 
      : "bg-zinc-100 dark:bg-zinc-500/80 text-zinc-700 dark:text-white hover:bg-zinc-200 dark:hover:bg-zinc-500"
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-3 py-1 rounded text-xs transition-colors",
        variantClasses[variant],
        className
      )}
    >
      {children}
    </button>
  );
}

interface DebugInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function DebugInput({ value, onChange, className }: DebugInputProps) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full px-2 py-1",
        "bg-zinc-50 dark:bg-zinc-700/80",
        "border border-zinc-200 dark:border-zinc-600/50",
        "rounded text-sm text-zinc-800 dark:text-white",
        "focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-500",
        className
      )}
    />
  );
}

interface DebugSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}

export function DebugSelect({ value, onChange, options, className }: DebugSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full px-2 py-1",
        "bg-zinc-50 dark:bg-zinc-700/80",
        "border border-zinc-200 dark:border-zinc-600/50",
        "rounded text-sm text-zinc-800 dark:text-white",
        "focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-500",
        className
      )}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} className="bg-white dark:bg-zinc-800">
          {option.label}
        </option>
      ))}
    </select>
  );
}

interface DebugLabelProps {
  children: ReactNode;
  className?: string;
}

export function DebugLabel({ children, className }: DebugLabelProps) {
  return (
    <label className={cn("block text-zinc-600 dark:text-zinc-300 mb-1", className)}>
      {children}
    </label>
  );
} 