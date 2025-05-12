import { Badge } from './ui/badge';
import { getStatusVariant } from '../lib/utils';
import { InstanceSummary } from '../lib/types';

interface StatusBadgeProps {
  status?: string;
  instances?: InstanceSummary[];
  showLabel?: boolean;
  className?: string;
  blinkOnError?: boolean;
}

export function StatusBadge({
  status = 'unknown',
  instances = [],
  showLabel = true,
  className = '',
  blinkOnError = true
}: StatusBadgeProps) {
  // If instances array is provided, determine overall status based on instance statuses
  let statusStr = status?.toString() || 'unknown';
  let shouldBlink = false;

  if (instances && instances.length > 0) {
    // Check if any instance is in running state
    const hasRunningInstance = instances.some(
      instance => instance.status === 'running' || instance.status === 'connected'
    );

    // Check if any instance is in error state
    const hasErrorInstance = instances.some(
      instance => instance.status === 'error' || instance.status === 'unhealthy'
    );

    if (hasRunningInstance) {
      statusStr = 'running';
    } else if (hasErrorInstance) {
      statusStr = 'error';
      shouldBlink = blinkOnError;
    } else {
      statusStr = 'disconnected';
    }
  } else if (statusStr === 'error' && blinkOnError) {
    shouldBlink = true;
  }

  const variant = getStatusVariant(statusStr);

  // Determine display text based on status
  let displayText = statusStr;
  if (statusStr === 'running' || statusStr === 'connected') {
    displayText = 'Normal';
  } else if (statusStr === 'error' || statusStr === 'unhealthy') {
    displayText = 'Error';
  } else if (statusStr === 'disconnected' || statusStr === 'stopped') {
    displayText = 'Disconnected';
  } else if (statusStr === 'initializing') {
    displayText = 'Initializing';
  } else {
    displayText = 'Unknown';
  }

  return (
    <Badge
      variant={variant}
      className={`${className} ${shouldBlink ? 'animate-pulse' : ''}`}
    >
      <span className="flex items-center">
        <span className={`mr-1 h-2 w-2 rounded-full ${variant === 'success' ? 'bg-emerald-400' :
          variant === 'warning' ? 'bg-amber-400' :
            variant === 'destructive' ? 'bg-red-400' : 'bg-slate-400'
          }`} />
        {showLabel && displayText}
      </span>
    </Badge>
  );
}