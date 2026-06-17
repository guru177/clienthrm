import { Link } from 'react-router-dom';
import { Briefcase, Building2, ShieldCheck, Users } from 'lucide-react';
import { type PropsWithChildren } from 'react';

interface AuthLayoutProps {
    title?: string;
    description?: string;
}

export default function AuthSplitLayout({
    children,
    title,
    description,
}: PropsWithChildren<AuthLayoutProps>) {
    return (
        <div className="grid h-dvh max-h-dvh overflow-hidden lg:grid-cols-2">
            <div className="relative z-10 hidden h-full min-h-0 w-[110%] -ml-[10%] -mr-[10%] flex-col justify-between overflow-hidden bg-gradient-to-br from-[#040e1e] via-[#092244] to-[#010815] p-10 text-white shadow-[20px_0_30px_-15px_rgba(0,0,0,0.5)] lg:flex xl:p-16">
                <style>
                    {`
                    @keyframes floatBg {
                        0% { transform: translateY(0px) rotate(0deg) scale(1); }
                        50% { transform: translateY(-15px) rotate(0.5deg) scale(1.02); }
                        100% { transform: translateY(0px) rotate(0deg) scale(1); }
                    }
                    @keyframes pulseBg {
                        0%, 100% { opacity: 0.3; }
                        50% { opacity: 0.6; }
                    }
                    `}
                </style>
                <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                    <div
                        className="absolute top-[-20%] right-[-10%] h-[60vw] max-h-[800px] w-[60vw] max-w-[800px] rounded-full bg-blue-500/10 blur-[120px]"
                        style={{ animation: 'pulseBg 8s ease-in-out infinite' }}
                    />
                    <div
                        className="absolute bottom-[10%] left-[-10%] h-[50vw] max-h-[600px] w-[50vw] max-w-[600px] rounded-full bg-indigo-500/10 blur-[100px]"
                        style={{ animation: 'pulseBg 12s ease-in-out infinite reverse' }}
                    />
                    <div
                        className="absolute bottom-10 right-1 flex h-[90%] max-h-[500px] w-[90%] max-w-[500px] origin-bottom-right items-end justify-end opacity-50 mix-blend-screen"
                        style={{ animation: 'floatBg 15s ease-in-out infinite' }}
                    >
                        <img
                            src="/images/hr-bg.png"
                            alt=""
                            className="h-full w-full object-contain object-bottom mix-blend-screen"
                        />
                    </div>
                </div>

                <div className="relative z-10 pl-[8%]">
                    <Link to="/login" className="flex items-center gap-2 text-lg font-bold tracking-tight text-white">
                        <div className="flex rounded-xl border border-white/20 bg-white/10 p-2 shadow-lg backdrop-blur-md">
                            <img src="/images/logo.webp" alt="Raintech HRM" className="h-8 w-auto object-contain" />
                        </div>
                        <span className="text-xl">RAINTECH HRM</span>
                    </Link>
                </div>

                <div className="relative z-10 min-h-0 flex-1 space-y-6 overflow-hidden pl-[8%] max-w-[85%] xl:space-y-10">
                    <div className="space-y-3 xl:space-y-4">
                        <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-white drop-shadow-md xl:text-[3.25rem]">
                            Platform
                            <br />
                            Control Center
                        </h1>
                        <p className="max-w-lg text-lg font-medium leading-relaxed text-blue-100/90">
                            Manage organizations, plans, and tenant access from one unified Raintech HRM console.
                        </p>
                    </div>

                    <div className="grid gap-4 xl:gap-6">
                        {[
                            {
                                icon: Building2,
                                title: 'Organizations',
                                text: 'Create and manage every customer workspace',
                            },
                            {
                                icon: Users,
                                title: 'Tenant Access',
                                text: 'Impersonate org admins for support and onboarding',
                            },
                            {
                                icon: Briefcase,
                                title: 'Plans & Billing',
                                text: 'Track trial, active, and suspended tenants',
                            },
                            {
                                icon: ShieldCheck,
                                title: 'Secure Platform',
                                text: 'Separate platform auth with enterprise-grade controls',
                            },
                        ].map((item) => (
                            <div key={item.title} className="flex items-center gap-5">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/10 shadow-lg backdrop-blur-md">
                                    <item.icon className="h-6 w-6 text-blue-200" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white drop-shadow-sm">{item.title}</h3>
                                    <p className="text-sm font-medium text-blue-200/80">{item.text}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="relative z-10 pl-[8%] text-sm font-medium text-blue-200/60">
                    <p>&copy; {new Date().getFullYear()} Raintech HRM. All rights reserved.</p>
                </div>
            </div>

            <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5 sm:px-8 lg:py-6">
                    <div className="m-auto flex w-full max-w-md flex-col gap-5 py-4">
                        <div className="flex flex-col items-center gap-2 lg:hidden">
                            <Link to="/login" className="flex items-center gap-2 text-lg font-bold">
                                <div className="flex rounded-lg bg-[#001f3f] p-1.5">
                                    <img src="/images/logo.webp" alt="Raintech HRM" className="h-6 w-auto object-contain" />
                                </div>
                                <span>Raintech HRM</span>
                            </Link>
                        </div>

                        <div className="shrink-0 space-y-1 text-center">
                            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
                            <p className="text-sm font-medium text-muted-foreground">{description}</p>
                        </div>

                        <div className="w-full">{children}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
