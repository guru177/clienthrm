import { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';

import AttendanceStats from '@/components/attendance/attendance-stats';
import ManualAttendanceForm from '@/components/attendance/manual-attendance-form';
import ManualAttendanceGrid from '@/components/attendance/manual-attendance-grid';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AppLayout from '@/layouts/app-layout';
import { useAttendanceStats } from '@/hooks/use-attendance-stats';
import { usePermissions } from '@/hooks/use-permissions';

export default function ManualAttendancePage() {
    const [gridKey, setGridKey] = useState(0);
    const { hasPermission } = usePermissions();
    const canManage = hasPermission('manage-attendance');
    const { stats, loading, reload } = useAttendanceStats('manual');

    const breadcrumbs = [
        { label: 'Manual Attendance', href: '/admin/manual-attendance' },
    ];

    const refreshGrid = async () => {
        setGridKey((k) => k + 1);
        await reload();
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <div className="space-y-6">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                        <ClipboardCheck className="h-7 w-7 text-primary" />
                        Manual Attendance
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Mark employee attendance when your deployment uses manual capture instead of app face
                        recognition or biometric devices.
                    </p>
                </div>

                <Tabs defaultValue="statistics" className="w-full">
                    <TabsList className="grid w-full grid-cols-3 h-auto">
                        <TabsTrigger value="statistics">Statistics</TabsTrigger>
                        <TabsTrigger value="daily">Daily grid</TabsTrigger>
                        <TabsTrigger value="entry">Single entry</TabsTrigger>
                    </TabsList>

                    <TabsContent value="statistics" className="space-y-4">
                        <AttendanceStats
                            stats={stats}
                            loading={loading}
                            title="Manual attendance statistics"
                        />
                        {!canManage && (
                            <p className="text-sm text-muted-foreground">
                                Statistics show only your manually recorded sessions. Managers with{' '}
                                <code className="rounded bg-muted px-1">manage-attendance</code> see all
                                employees.
                            </p>
                        )}
                    </TabsContent>

                    <TabsContent value="daily" className="space-y-4">
                        <ManualAttendanceGrid key={gridKey} onSaved={refreshGrid} />
                    </TabsContent>

                    <TabsContent value="entry" className="space-y-4">
                        <ManualAttendanceForm onSuccess={refreshGrid} />
                    </TabsContent>
                </Tabs>
            </div>
        </AppLayout>
    );
}
