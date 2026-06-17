import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

export interface SearchableSelectOption {
    value: string;
    label: string;
}

interface SearchableSelectProps {
    value: string;
    onValueChange: (value: string) => void;
    options: SearchableSelectOption[];
    placeholder?: string;
    searchPlaceholder?: string;
    className?: string;
    emptyMessage?: string;
}

interface PanelPosition {
    top: number;
    left: number;
    width: number;
    maxHeight: number;
}

export function SearchableSelect({
    value,
    onValueChange,
    options,
    placeholder = 'Select…',
    searchPlaceholder = 'Search…',
    className,
    emptyMessage = 'No results found',
}: SearchableSelectProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [position, setPosition] = useState<PanelPosition>({
        top: 0,
        left: 0,
        width: 0,
        maxHeight: 240,
    });
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const selected = options.find((o) => o.value === value);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return options;
        return options.filter(
            (o) =>
                o.label.toLowerCase().includes(q) ||
                o.value.toLowerCase().includes(q),
        );
    }, [options, query]);

    function updatePosition() {
        const trigger = triggerRef.current;
        if (!trigger) return;

        const rect = trigger.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom - 12;
        const spaceAbove = rect.top - 12;
        const preferred = 288;
        const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
        const maxHeight = Math.max(160, Math.min(preferred, openUp ? spaceAbove : spaceBelow));

        setPosition({
            top: openUp ? rect.top - maxHeight - 4 : rect.bottom + 4,
            left: rect.left,
            width: rect.width,
            maxHeight,
        });
    }

    useLayoutEffect(() => {
        if (!open) return;
        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;

        function handlePointerDown(e: MouseEvent) {
            const target = e.target as Node;
            if (
                !rootRef.current?.contains(target) &&
                !panelRef.current?.contains(target)
            ) {
                setOpen(false);
                setQuery('');
            }
        }

        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [open]);

    function selectOption(option: SearchableSelectOption) {
        onValueChange(option.value);
        setOpen(false);
        setQuery('');
    }

    const panel = open ? (
        <div
            ref={panelRef}
            className="fixed z-[100] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg"
            style={{
                top: position.top,
                left: position.left,
                width: position.width,
                maxHeight: position.maxHeight,
            }}
        >
            <div className="border-b p-2">
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={searchPlaceholder}
                    autoFocus
                    className="h-9"
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            setOpen(false);
                            setQuery('');
                        }
                    }}
                />
            </div>
            <ul role="listbox" className="overflow-y-auto p-1" style={{ maxHeight: position.maxHeight - 52 }}>
                {filtered.length === 0 ? (
                    <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                        {emptyMessage}
                    </li>
                ) : (
                    filtered.map((option) => {
                        const isSelected = option.value === value;
                        return (
                            <li key={option.value}>
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={isSelected}
                                    onClick={() => selectOption(option)}
                                    className={cn(
                                        'flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground',
                                        isSelected && 'bg-accent/60',
                                    )}
                                >
                                    <CheckIcon
                                        className={cn(
                                            'size-4 shrink-0',
                                            isSelected ? 'opacity-100' : 'opacity-0',
                                        )}
                                    />
                                    <span className="truncate">{option.label}</span>
                                </button>
                            </li>
                        );
                    })
                )}
            </ul>
        </div>
    ) : null;

    return (
        <div ref={rootRef} className={cn('relative w-full', className)}>
            <button
                ref={triggerRef}
                type="button"
                aria-expanded={open}
                aria-haspopup="listbox"
                onClick={() => setOpen((v) => !v)}
                className={cn(
                    'border-input flex h-10 w-full items-center justify-between rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                    !selected && 'text-muted-foreground',
                )}
            >
                <span className="truncate text-left">
                    {selected?.label ?? placeholder}
                </span>
                <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
            </button>

            {panel && createPortal(panel, document.body)}
        </div>
    );
}
