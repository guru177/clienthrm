import { Link } from 'react-router-dom';
import { CalendarDays, ShieldCheck, Users, Wallet } from 'lucide-react';
import { type PropsWithChildren } from 'react';

import { cn } from '@/lib/utils';
import { staticAssetUrl } from '@/lib/static-asset';

interface AuthLayoutProps {
    title?: string;
    description?: string;
    fitViewport?: boolean;
    scrollableCard?: boolean;
}

const features = [
    {
        icon: Users,
        title: 'Employee Directory',
        text: 'Centralize employee data and keep records accessible.',
    },
    {
        icon: Wallet,
        title: 'Payroll & Salaries',
        text: 'Automate payroll processing and ensure accurate payments.',
    },
    {
        icon: CalendarDays,
        title: 'Leave Management',
        text: 'Track leaves, holidays, and attendance with ease.',
    },
    {
        icon: ShieldCheck,
        title: 'Secure & Compliant',
        text: 'Enterprise-grade security to protect your data and ensure compliance.',
    },
] as const;

function BrandIcon({ width = 120, height = 56 }: { width?: number; height?: number }) {
    return (
        <div
            className="flex shrink-0 items-center justify-center rounded-xl bg-white px-3 py-2 shadow-sm"
            style={{ width, height }}
        >
            <img
                src={staticAssetUrl('images/logo.png')}
                alt="HR Daddy"
                className="h-full w-full object-contain"
                style={{ maxWidth: width - 20, maxHeight: height - 12 }}
            />
        </div>
    );
}

function AuthBrandHeader() {
    return (
        <Link to="/login" className="inline-flex">
            <BrandIcon width={128} height={60} />
        </Link>
    );
}

function BrandLogo({
    maxWidth = '88px',
    className = '',
    variant = 'light',
}: {
    maxWidth?: string;
    className?: string;
    variant?: 'light' | 'white';
}) {
    return (
        <div
            className={cn(
                'rounded-xl px-3 py-2 shadow-sm',
                variant === 'white' ? 'bg-white' : 'bg-[#e8f2ff]',
                className,
            )}
        >
            <img
                src={staticAssetUrl('images/logo.png')}
                alt="HR Daddy"
                className="h-auto w-full object-contain"
                style={{ maxWidth }}
            />
        </div>
    );
}

export default function AuthSplitLayout({
    children,
    title,
    description,
    fitViewport = false,
    scrollableCard = false,
}: PropsWithChildren<AuthLayoutProps>) {
    return (
        <div
            className={cn(
                'grid bg-[#f8fafc] lg:grid-cols-2',
                fitViewport ? 'h-dvh max-h-dvh overflow-hidden' : 'min-h-dvh',
            )}
        >
            {/* Left — branding */}
            <div
                className={cn(
                    'relative hidden flex-col overflow-hidden bg-[#0a192f] text-white lg:flex',
                    fitViewport ? 'h-dvh max-h-dvh px-10 py-8 xl:px-12' : 'min-h-dvh px-10 py-10 xl:px-14 xl:py-12',
                )}
            >
                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                    <div className="absolute -right-10 top-8 h-56 w-56 rounded-full bg-[#1e4f8f]/35 blur-3xl" />
                    <div className="absolute -left-16 top-24 h-80 w-80 rounded-full bg-[#1e3a5f]/60 blur-3xl" />
                    <div className="absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full bg-[#132f4c]/80 blur-2xl" />
                    <svg
                        className="absolute bottom-0 left-0 w-full opacity-30"
                        viewBox="0 0 1440 280"
                        preserveAspectRatio="none"
                        aria-hidden
                    >
                        <path
                            fill="#1a365d"
                            d="M0,160L60,170C120,180,240,200,360,186.7C480,173,600,127,720,128C840,129,960,177,1080,186.7C1200,197,1320,171,1380,157.3L1440,144L1440,280L0,280Z"
                        />
                    </svg>
                    <svg
                        className="absolute bottom-0 left-0 w-full opacity-20"
                        viewBox="0 0 1440 280"
                        preserveAspectRatio="none"
                        aria-hidden
                    >
                        <path
                            fill="#2563eb"
                            d="M0,200L80,192C160,184,320,168,480,165.3C640,163,800,184,960,186.7C1120,189,1280,173,1360,165.3L1440,158L1440,280L0,280Z"
                        />
                    </svg>
                </div>

                <div className="relative z-10 flex h-full min-h-0 flex-1 flex-col justify-between py-2">
                    <AuthBrandHeader />

                    <div className="flex min-h-0 flex-1 flex-col justify-center gap-7 py-4">
                        <div className="max-w-xl space-y-4">
                            <h1 className="text-[2.65rem] font-bold leading-[1.1] tracking-tight xl:text-[2.85rem]">
                                Smarter <span className="text-[#3b82f6]">HR.</span>
                                <br />
                                Stronger <span className="text-[#3b82f6]">Teams.</span>
                            </h1>
                            <p className="max-w-md text-[15px] leading-relaxed text-slate-300">
                                All-in-one HRM solution to simplify workforce management, streamline operations, and drive organizational success.
                            </p>
                        </div>

                        <div className="flex max-w-xl flex-1 flex-col divide-y divide-white/10 border-y border-white/10">
                            {features.map((item) => (
                                <div
                                    key={item.title}
                                    className="flex flex-1 items-center gap-4 py-4 first:pt-5 last:pb-5"
                                >
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#112a45] ring-1 ring-white/10">
                                        <item.icon className="h-5 w-5 text-[#60a5fa]" strokeWidth={1.75} />
                                    </div>
                                    <div className="space-y-1">
                                        <h3 className="text-[16px] font-semibold text-white">{item.title}</h3>
                                        <p className="text-sm leading-snug text-slate-400">{item.text}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="shrink-0">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2.5 text-[13px] text-slate-300">
                            <ShieldCheck className="h-4 w-4 text-[#60a5fa]" strokeWidth={1.75} />
                            Trusted by growing teams worldwide
                        </div>
                    </div>
                </div>
            </div>

            {/* Right — form card */}
            <div
                className={cn(
                    'relative flex flex-col overflow-hidden bg-[#f8fafc]',
                    fitViewport ? 'h-dvh max-h-dvh' : 'min-h-dvh',
                )}
            >
                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                    <div className="absolute -right-24 top-0 h-72 w-72 rounded-full bg-[#dbeafe]/70 blur-3xl" />
                    <div className="absolute right-8 top-16 h-56 w-56 opacity-40">
                        <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden>
                            {Array.from({ length: 8 }).map((_, row) =>
                                Array.from({ length: 8 }).map((__, col) => (
                                    <circle
                                        key={`${row}-${col}`}
                                        cx={col * 26 + 12}
                                        cy={row * 26 + 12}
                                        r="1.5"
                                        fill="#cbd5e1"
                                    />
                                )),
                            )}
                        </svg>
                    </div>
                    <svg
                        className="absolute bottom-0 right-0 h-48 w-96 opacity-25"
                        viewBox="0 0 400 200"
                        preserveAspectRatio="none"
                        aria-hidden
                    >
                        <path
                            fill="#bfdbfe"
                            d="M0,120Q100,40 200,100T400,80V200H0Z"
                        />
                    </svg>
                </div>

                <div
                    className={cn(
                        'relative z-10 flex min-h-0 flex-1 flex-col px-6 sm:px-8',
                        fitViewport
                            ? 'justify-center overflow-hidden py-4'
                            : 'overflow-y-auto py-10 sm:px-10',
                    )}
                >
                    <div
                        className={cn(
                            'flex w-full flex-col',
                            fitViewport
                                ? scrollableCard
                                    ? 'mx-auto flex h-full min-h-0 w-full max-w-[560px] flex-col justify-center'
                                    : 'mx-auto max-w-[560px] shrink-0'
                                : 'm-auto max-w-[560px] px-2 sm:max-w-[600px]',
                        )}
                    >
                        <div
                            className={cn(
                                'rounded-3xl border border-[#e2e8f0] bg-white shadow-[0_24px_64px_-32px_rgba(15,23,42,0.18)]',
                                fitViewport
                                    ? 'flex max-h-[calc(100dvh-2rem)] flex-col px-8 py-6 sm:px-10'
                                    : 'px-8 py-10 sm:px-12 sm:py-11',
                                scrollableCard && fitViewport && 'min-h-0',
                            )}
                        >
                            <div className={cn('shrink-0', scrollableCard && fitViewport ? 'mb-4' : fitViewport ? 'mb-5' : 'mb-7')}>
                                <div className="flex justify-center">
                                    <BrandLogo maxWidth={fitViewport ? '76px' : '88px'} className="rounded-full" />
                                </div>
                            </div>

                            <div
                                className={cn(
                                    'shrink-0 space-y-1.5 text-center',
                                    scrollableCard && fitViewport ? 'mb-4' : fitViewport ? 'mb-5' : 'mb-8',
                                )}
                            >
                                <h1
                                    className={cn(
                                        'font-bold tracking-tight text-[#0f172a]',
                                        fitViewport ? 'text-2xl' : 'text-[1.65rem]',
                                    )}
                                >
                                    {title}
                                </h1>
                                <p className="text-sm text-slate-500">{description}</p>
                            </div>

                            <div
                                className={cn(
                                    'w-full',
                                    scrollableCard && fitViewport && 'min-h-0 flex-1 overflow-y-auto pr-1',
                                )}
                            >
                                {children}
                            </div>
                        </div>

                        {!scrollableCard && (
                        <p
                            className={cn(
                                'flex items-center justify-center gap-2 text-center text-[13px] text-slate-500',
                                fitViewport ? 'mt-4' : 'mt-8',
                            )}
                        >
                            <ShieldCheck className="h-4 w-4 shrink-0 text-[#3b82f6]" strokeWidth={1.75} />
                            Your data is secure with enterprise-grade protection
                        </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
