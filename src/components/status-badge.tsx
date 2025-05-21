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
  let statusStr = status?.toString().toLowerCase() || 'unknown';
  let shouldBlink = false;

  if (instances && instances.length > 0) {
    // Check if any instance is in ready or busy state
    const hasActiveInstance = instances.some(
      instance => ['ready', 'busy', 'running', 'connected', 'active', 'healthy', 'thinking', 'fetch'].includes((instance.status || '').toLowerCase())
    );

    // Check if any instance is in error state
    const hasErrorInstance = instances.some(
      instance => ['error', 'unhealthy', 'stopped', 'failed'].includes((instance.status || '').toLowerCase())
    );

    // Check if any instance is initializing
    const hasInitializingInstance = instances.some(
      instance => ['initializing', 'starting', 'connecting'].includes((instance.status || '').toLowerCase())
    );

    // 状态优先级：如果有任何实例是活跃的，整个服务就是活跃的
    if (hasActiveInstance) {
      statusStr = 'ready';
    } else if (hasInitializingInstance) {
      statusStr = 'initializing';
    } else if (hasErrorInstance) {
      statusStr = 'error';
      shouldBlink = blinkOnError;
    } else {
      statusStr = 'shutdown';
    }
  } else if (['error', 'unhealthy', 'stopped', 'failed'].includes(statusStr) && blinkOnError) {
    shouldBlink = true;
  }

  const variant = getStatusVariant(statusStr);

  // Determine display text based on status
  let displayText = statusStr;
  if (['ready', 'running', 'connected', 'busy', 'active', 'healthy', 'thinking', 'fetch'].includes(statusStr)) {
    displayText = 'Ready';
  } else if (['error', 'unhealthy', 'failed'].includes(statusStr)) {
    displayText = 'Error';
  } else if (['shutdown', 'disconnected', 'stopped', 'disabled'].includes(statusStr)) {
    displayText = 'Disconnected';
  } else if (['initializing', 'starting', 'connecting'].includes(statusStr)) {
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