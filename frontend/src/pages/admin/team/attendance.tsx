import { useEffect, useState } from 'react';
import { CalendarCheck, RefreshCw } from 'lucide-react';
import AppLayout from '@/layouts/app-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import axios from '@/lib/axios';
import { handleApiError } from '@/lib/toast';

interface TeamAttendanceRow {
    user_id: number;
    name: string;
    employee_id?: string | null;
    attendance_id?: number | null;
    date?: string | null;
    clock_in?: string | null;
    clock_out?: string | null;
    status?: string | null;
    is_late?: boolean;
    source?: string | null;
}

export default function TeamAttendancePage() {
    const today = new Date().toISOString().slice(0, 10);
    const [date, setDate] = useState(today);
    const [records, setRecords] = useState<TeamAttendanceRow[]>([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/admin/manager/attendance', {
                params: { date, from: date, to: date },
            });
            setRecords(res.data.data?.records ?? []);
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, [date]);

    return (
        <AppLayout breadcrumbs={[{ label: 'Team Attendance' }]}>
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <CalendarCheck className="h-6 w-6" />
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">Team Attendance</h1>
                            <p className="text-sm text-muted-foreground">
                                Direct reports for the selected date
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-auto"
                        />
                        <Button variant="outline" onClick={() => void load()} disabled={loading}>
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </div>

                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Employee</TableHead>
                                <TableHead>Clock In</TableHead>
                                <TableHead>Clock Out</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Source</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {records.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                                        {loading ? 'Loading…' : 'No team members or attendance for this date.'}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                records.map((row, i) => (
                                    <TableRow key={`${row.user_id}-${row.attendance_id ?? i}`}>
                                        <TableCell>
                                            <div className="font-medium">{row.name}</div>
                                            {row.employee_id && (
                                                <div className="text-xs text-muted-foreground">
                                                    {row.employee_id}
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell>{row.clock_in ?? '—'}</TableCell>
                                        <TableCell>{row.clock_out ?? '—'}</TableCell>
                                        <TableCell>
                                            {row.status ? (
                                                <Badge variant={row.is_late ? 'destructive' : 'secondary'}>
                                                    {row.status}
                                                    {row.is_late ? ' · late' : ''}
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline">No punch</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>{row.source ?? '—'}</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </AppLayout>
    );
}
