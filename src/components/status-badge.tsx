import React from 'react';
import { Badge } from './ui/badge';
import { getStatusVariant } from '../lib/utils';

interface StatusBadgeProps {
  status: string;
  showLabel?: boolean;
  className?: string;
}

export function StatusBadge({ status, showLabel = true, className }: StatusBadgeProps) {
  const variant = getStatusVariant(status);
  
  return (
    <Badge variant={variant} className={className}>
      <span className="flex items-center">
        <span className={`mr-1 h-2 w-2 rounded-full ${
          variant === 'success' ? 'bg-emerald-400' :
          variant === 'warning' ? 'bg-amber-400' :
          variant === 'destructive' ? 'bg-red-400' : 'bg-slate-400'
        }`} />
        {showLabel && status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    </Badge>
  );
}