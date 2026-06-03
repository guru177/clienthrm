import { Link } from 'react-router-dom';
import { Building2, ShieldCheck, Briefcase, Users, CalendarDays, LineChart } from 'lucide-react';
import { type PropsWithChildren } from 'react';

import AppLogoIcon from '@/components/app-logo-icon';

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
        <div className="grid min-h-screen lg:grid-cols-2">
            {/* Left Side - Branding/Design (Dark Premium Theme) */}
            <div className="relative hidden w-[110%] -ml-[10%] -mr-[10%] flex-col justify-between overflow-hidden bg-gradient-to-br from-[#040e1e] via-[#092244] to-[#010815] p-16 text-white lg:flex isolation-auto shadow-[20px_0_30px_-15px_rgba(0,0,0,0.5)] z-10">

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
                <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                    {/* Elegant soft glowing orbs */}
                    <div className="absolute top-[-20%] right-[-10%] w-[60vw] h-[60vw] max-w-[800px] max-h-[800px] bg-blue-500/10 rounded-full blur-[120px]" style={{ animation: 'pulseBg 8s ease-in-out infinite' }} />
                    <div className="absolute bottom-[10%] left-[-10%] w-[50vw] h-[50vw] max-w-[600px] max-h-[600px] bg-indigo-500/10 rounded-full blur-[100px]" style={{ animation: 'pulseBg 12s ease-in-out infinite reverse' }} />

                    {/* Animated User Graphic - Docked to bottom right */}
                    <div className="absolute bottom-10 right-1 w-[90%] h-[90%] max-w-[500px] flex items-end justify-end mix-blend-screen opacity-50 origin-bottom-right" style={{ animation: 'floatBg 15s ease-in-out infinite' }}>
                        <img
                            src="/images/hr-bg.png"
                            alt="HR Background"
                            className="w-full h-full object-contain object-bottom mix-blend-screen"
                        />
                    </div>
                </div>

                {/* Logo */}
                <div className="relative z-10 pl-[8%]">
                    <Link
                        to="/login"
                        className="flex items-center gap-2 text-lg font-bold tracking-tight text-white"
                    >
                        <div className="flex bg-white/10 p-2 rounded-xl shadow-lg border border-white/20 backdrop-blur-md">
                            <img src="/images/logo.webp" alt="RAINTECH HRM Logo" className="h-8 w-auto object-contain drop-shadow-sm" />
                        </div>
                        <span className="text-xl">RAINTECH HRM</span>
                    </Link>
                </div>

                {/* Main Content */}
                <div className="relative z-10 space-y-10 pl-[8%] max-w-[85%]">
                    <div className="space-y-4">
                        <h1 className="text-4xl font-extrabold leading-tight tracking-tight lg:text-[3.25rem] text-white drop-shadow-md">
                            Manage Your Workforce
                            <br />
                            Seamlessly
                        </h1>
                        <p className="text-lg font-medium text-blue-100/90 leading-relaxed max-w-lg">
                            Powerful HRM tools to streamline your payroll, track attendance, and empower your team.
                        </p>
                    </div>

                    {/* Features */}
                    <div className="grid gap-6">
                        <div className="flex items-center gap-5">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 shadow-lg border border-white/20 backdrop-blur-md">
                                <Users className="h-6 w-6 text-blue-200" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white drop-shadow-sm">
                                    Employee Directory
                                </h3>
                                <p className="text-sm font-medium text-blue-200/80">
                                    Keep all employee records organized and accessible
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-5">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 shadow-lg border border-white/20 backdrop-blur-md">
                                <Briefcase className="h-6 w-6 text-blue-200" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white drop-shadow-sm">
                                    Payroll & Salaries
                                </h3>
                                <p className="text-sm font-medium text-blue-200/80">
                                    Automated component calculations and direct deposits
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-5">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 shadow-lg border border-white/20 backdrop-blur-md">
                                <CalendarDays className="h-6 w-6 text-blue-200" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white drop-shadow-sm">
                                    Leave Management
                                </h3>
                                <p className="text-sm font-medium text-blue-200/80">
                                    Track holidays, sick leaves, and attendance instantly
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-5">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 shadow-lg border border-white/20 backdrop-blur-md">
                                <ShieldCheck className="h-6 w-6 text-blue-200" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white drop-shadow-sm">
                                    Secure & Compliant
                                </h3>
                                <p className="text-sm font-medium text-blue-200/80">
                                    Enterprise-grade security with robust roles and permissions
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="relative z-10 text-sm font-medium text-blue-200/60 pl-[8%]">
                    <p>
                        &copy; {new Date().getFullYear()} HRM Pro. All rights
                        reserved.
                    </p>
                </div>
            </div>

            {/* Right Side - Form */}
            <div className="flex items-center justify-center p-8 bg-background">
                <div className="w-full max-w-md space-y-8">
                    {/* Mobile Logo */}
                    <div className="flex flex-col items-center gap-2 lg:hidden">
                        <Link
                            to="/login"
                            className="flex items-center gap-2 text-lg font-bold"
                        >
                            <div className="flex bg-[#001f3f] dark:bg-white p-1.5 rounded-lg">
                                <img src="/images/logo.webp" alt="HRM Pro Logo" className="h-6 w-auto object-contain dark:invert" />
                            </div>
                            <span>HRM Pro</span>
                        </Link>
                    </div>

                    {/* Form Header */}
                    <div className="space-y-2 text-center lg:text-left">
                        <h1 className="text-2xl font-bold tracking-tight">
                            {title}
                        </h1>
                        <p className="text-sm text-muted-foreground font-medium">
                            {description}
                        </p>
                    </div>

                    {/* Form Content */}
                    {children}
                </div>
            </div>
        </div>
    );
}
