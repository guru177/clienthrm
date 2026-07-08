import { useEffect, useState } from 'react';
import { staticAssetUrl } from '@/lib/static-asset';

const STEPS = [
    'Initializing workspace…',
    'Loading interface…',
    'Connecting to server…',
    'Preparing dashboard…',
];

type ElectronSplashLoaderProps = {
    message?: string;
};

export function ElectronSplashLoader({ message }: ElectronSplashLoaderProps) {
    const [progress, setProgress] = useState(12);
    const [stepIndex, setStepIndex] = useState(0);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setProgress((current) => {
                if (current >= 92) return current;
                return Math.min(92, current + Math.random() * 8 + 2);
            });
            setStepIndex((current) => (current + 1) % STEPS.length);
        }, 900);
        return () => window.clearInterval(timer);
    }, []);

    const status = message || STEPS[stepIndex];

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white text-slate-900">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(13,74,138,0.10),transparent_55%),radial-gradient(90%_60%_at_100%_100%,rgba(59,130,246,0.08),transparent_60%),linear-gradient(160deg,#f8fafc_0%,#ffffff_42%,#eef4fb_100%)]" />

            <div className="relative z-10 flex w-full max-w-md flex-col items-center px-8">
                <div className="relative mb-8 grid h-28 w-28 place-items-center">
                    <div className="absolute inset-3 rounded-[28px] bg-[radial-gradient(circle,rgba(13,74,138,0.16),transparent_70%)] blur-xl" />
                    <div className="absolute inset-0 rounded-[28px] border border-slate-900/10 bg-gradient-to-br from-white to-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_14px_32px_rgba(15,23,42,0.10)]" />
                    <img
                        src={staticAssetUrl('images/logo.png')}
                        alt="HR Daddy"
                        className="relative h-16 w-16 object-contain drop-shadow-[0_6px_14px_rgba(15,23,42,0.12)]"
                    />
                </div>

                <div className="text-center">
                    <h1 className="text-[28px] font-light uppercase tracking-[0.14em] text-slate-900">
                        HR Daddy
                    </h1>
                    <p className="mt-2 text-xs uppercase tracking-[0.22em] text-slate-500">
                        Human Resource Management
                    </p>
                </div>

                <div className="mt-12 w-full">
                    <div className="mb-2 flex items-center justify-between gap-3 text-[11px] tracking-[0.04em] text-slate-500">
                        <span className="truncate">{status}</span>
                        <span className="tabular-nums text-slate-700">{Math.round(progress)}%</span>
                    </div>
                    <div className="relative h-1 overflow-hidden rounded-full bg-slate-900/10 shadow-[inset_0_1px_2px_rgba(15,23,42,0.06)]">
                        <div
                            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#0a3272] via-[#0d4a8a] to-[#3b82f6] shadow-[0_0_12px_rgba(13,74,138,0.28)] transition-[width] duration-500 ease-out"
                            style={{ width: `${progress}%` }}
                        />
                        <div className="absolute inset-0 animate-[shimmer_1.6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/65 to-transparent" />
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes shimmer {
                    0% { transform: translateX(-120%); }
                    100% { transform: translateX(220%); }
                }
            `}</style>
        </div>
    );
}
