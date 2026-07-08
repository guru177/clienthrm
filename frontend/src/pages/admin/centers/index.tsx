// Head removed - use document.title instead
import { MapPin } from 'lucide-react';

import AppLayout from '@/layouts/app-layout';
import CentersManager from '@/components/centers-manager';

const breadcrumbs = [
    { label: 'Management', href: '#' },
    { label: 'Branches' },
];

export default function CentersPage() {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            

            <div className="space-y-6">
                {/* Hero Header */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#e8f2fd] via-[#d0e4f8] to-[#c4d8f0] dark:from-[#0d1e33] dark:via-[#0a1828] dark:to-[#071220] px-6 py-5 shadow-sm border border-white/60 dark:border-white/10">
                    {/* Decorative blob */}
                    <div className="pointer-events-none absolute -top-10 -right-10 w-48 h-48 opacity-20">
                        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                            <path fill="#036bd3" d="M44.7,-76.4C58.4,-69.7,70.3,-58.6,77.9,-44.9C85.5,-31.2,88.7,-15.6,87.4,-0.8C86,14,80,28,72.1,40.5C64.2,53,54.2,64,42.1,71.3C30,78.6,15,82.3,0.1,82.1C-14.8,81.9,-29.6,77.8,-42.7,70.5C-55.8,63.2,-67.3,52.7,-74.5,39.5C-81.7,26.3,-84.7,10.5,-83.1,-4.9C-81.6,-20.3,-75.5,-35.2,-66.3,-47.4C-57.1,-59.6,-44.8,-69.1,-31.6,-76.1C-18.4,-83.1,-4.6,-87.6,8.2,-86.2C21,-84.8,31,-83.1,44.7,-76.4Z" transform="translate(100 100)" />
                        </svg>
                    </div>
                    <div className="relative flex items-center gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#036bd3]/15 dark:bg-white/10 border border-[#036bd3]/20 dark:border-white/10 shadow-inner">
                            <MapPin className="h-6 w-6 text-[#036bd3] dark:text-blue-300" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-[#001f3f] dark:text-white">
                                Branches Management
                            </h1>
                            <p className="text-sm text-[#1e3a5f]/60 dark:text-blue-200/60">
                                Manage all branches and locations for your company
                            </p>
                        </div>
                    </div>
                </div>

                <CentersManager />
            </div>
        </AppLayout>
    );
}
