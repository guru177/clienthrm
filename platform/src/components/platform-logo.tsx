import { Link } from 'react-router-dom';

export default function PlatformLogo() {
    return (
        <Link to="/" className="inline-flex">
            <div className="flex min-h-12 items-center justify-center overflow-hidden rounded-lg bg-white px-2 py-1 shadow-sm ring-1 ring-border/40">
                <img
                    src="/images/logo.png"
                    alt="Raintech HRM"
                    className="h-auto w-full max-w-[110px] object-contain"
                    onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                    }}
                />
            </div>
        </Link>
    );
}
