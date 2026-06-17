import { Loader2Icon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpinnerProps extends Omit<React.ComponentProps<'svg'>, 'size'> {
    size?: 'sm' | 'default';
}

function Spinner({ className, size = 'default', ...props }: SpinnerProps) {
    const sizeClasses = { sm: 'size-4', default: 'size-6' };
    return (
        <Loader2Icon
            role="status"
            aria-label="Loading"
            className={cn(sizeClasses[size], 'animate-spin text-primary', className)}
            {...props}
        />
    );
}

export { Spinner };
