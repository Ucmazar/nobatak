import React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'blue' | 'emerald' | 'amber' | 'rose' | 'slate' | 'waiting' | 'serving' | 'completed' | 'cancelled';
}

export function Badge({ className, variant = 'blue', children, ...props }: BadgeProps) {
  const variants = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
    waiting: 'bg-amber-50 text-amber-700 border-amber-200',
    serving: 'bg-blue-50 text-blue-700 border-blue-300 animate-pulse',
    completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
