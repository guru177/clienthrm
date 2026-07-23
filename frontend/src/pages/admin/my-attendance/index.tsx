import { CalendarDays } from 'lucide-react';

import AttendanceTable from '@/components/attendance/attendance-table';
import AppLayout from '@/layouts/app-layout';

/** Self-service attendance history — only the logged-in user's records (RBAC: view-my-attendance). */
export default function MyAttendancePage() {
    return (
        <AppLayout breadcrumbs={[{ label: 'My Attendance', href: '/admin/my-attendance' }]}>
            <div className="min-w-0 max-w-full space-y-6">
                <div className="flex min-w-0 items-center gap-3">
                    <CalendarDays className="h-8 w-8 shrink-0 text-primary" />
                    <div className="min-w-0">
                        <h1 className="break-words text-2xl font-bold">My Attendance</h1>
                        <p className="break-words text-sm text-muted-foreground">
                            Your clock-in, clock-out, and attendance history
                        </p>
                    </div>
                </div>

                <AttendanceTable selfOnly />
            </div>
        </AppLayout>
    );
}
