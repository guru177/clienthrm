import { Link } from 'react-router-dom';

export default function PlatformLogo({ compact = false }: { compact?: boolean }) {
    return (
        <Link to="/" className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center overflow-hidden rounded-lg bg-white/80 shadow-sm ring-1 ring-white/60">
                <img
                    src="/images/logo.webp"
                    alt="Raintech HRM"
                    className="size-8 object-contain"
                    onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                    }}
                />
            </div>
            {!compact && (
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#001f3f]">Raintech HRM</p>
                    <p className="truncate text-xs text-[#1e3a5f]/70">Platform</p>
                </div>
            )}
        </Link>
    );
}
