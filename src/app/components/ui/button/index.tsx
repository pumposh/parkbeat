'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'ghost' | 'link' | 'primary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  children: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', children, ...props }, ref) => {
    const variantClasses = {
      default: 'frosted-glass',
      primary: 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600',
      destructive: 'bg-red-500 text-white hover:bg-red-600 dark:bg-red-700 dark:hover:bg-red-600',
      outline: 'border border-zinc-200 dark:border-zinc-700 bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800',
      ghost: 'bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-50',
      link: 'bg-transparent underline-offset-4 hover:underline text-zinc-900 dark:text-zinc-50',
    };

    const sizeClasses = {
      default: 'h-10 px-4 py-2',
      sm: 'h-8 px-3 py-1 text-sm',
      lg: 'h-12 px-6 py-3 text-lg',
      icon: 'h-10 w-10',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-md font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-500',
          'disabled:opacity-50 disabled:pointer-events-none',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button'; 