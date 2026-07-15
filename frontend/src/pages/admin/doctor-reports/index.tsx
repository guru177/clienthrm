import axios from '@/lib/axios';
import { FileText, Plus, Eye, Pencil, Trash2, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import { handleApiError } from '@/lib/toast';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { useConfirm } from '@/lib/confirm';

interface DoctorReport {
    id: number;
    employee_user_id: number;
    doctor_user_id: number;
    consultation_date: string;
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
    prescription_notes: string | null;
    prescription_path: string | null;
    status: string;
    created_at: string;
    employee_name: string | null;
    doctor_name: string | null;
}

export default function DoctorReportsIndex() {
    const { hasPermission } = useAuth();
    const confirm = useConfirm();
    const [reports, setReports] = useState<DoctorReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const canCreate = hasPermission('create-doctor-reports');
    const canEdit = hasPermission('edit-doctor-reports');
    const canDelete = hasPermission('delete-doctor-reports');

    useEffect(() => {
        void loadReports();
    }, []);

    const loadReports = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/admin/doctor-reports');
            setReports(res.data.data || []);
        } catch (error) {
            handleApiError(error);
            setReports([]);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!(await confirm({ title: 'Delete Report', description: 'Are you sure you want to delete this report?' }))) return;
        try {
            await axios.delete(`/admin/doctor-reports/${id}`);
            toast.success('Report deleted');
            void loadReports();
        } catch (error) {
            handleApiError(error);
        }
    };

    const filtered = reports.filter((r) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
            (r.employee_name || '').toLowerCase().includes(q) ||
            (r.doctor_name || '').toLowerCase().includes(q) ||
            r.consultation_date.includes(q) ||
            r.status.toLowerCase().includes(q)
        );
    });

    const statusBadge = (status: string) => {
        const colors = status === 'published'
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
        return (
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${colors}`}>
                {status}
            </span>
        );
    };

    return (
        <AppLayout breadcrumbs={[{ title: 'Doctor Reports', href: '/admin/doctor-reports' }]}>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <FileText className="h-8 w-8 text-primary" />
                        <div>
                            <h1 className="text-2xl font-bold">Doctor Reports</h1>
                            <p className="text-muted-foreground text-sm">SOAP consultations &amp; prescriptions</p>
                        </div>
                    </div>
                    {canCreate && (
                        <Button asChild>
                            <Link to="/admin/doctor-reports/create">
                                <Plus className="mr-2 h-4 w-4" />
                                New Report
                            </Link>
                        </Button>
                    )}
                </div>

                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>All Reports</CardTitle>
                                <CardDescription>{filtered.length} report{filtered.length !== 1 ? 's' : ''}</CardDescription>
                            </div>
                            <div className="relative w-64">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder="Search reports..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Employee</TableHead>
                                    <TableHead>Doctor</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Prescription</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8">
                                            Loading...
                                        </TableCell>
                                    </TableRow>
                                ) : filtered.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                            No reports found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filtered.map((r) => (
                                        <TableRow key={r.id}>
                                            <TableCell className="font-medium">{r.employee_name || `User #${r.employee_user_id}`}</TableCell>
                                            <TableCell>{r.doctor_name || `User #${r.doctor_user_id}`}</TableCell>
                                            <TableCell>{r.consultation_date}</TableCell>
                                            <TableCell>{statusBadge(r.status)}</TableCell>
                                            <TableCell>
                                                {r.prescription_path ? (
                                                    <span className="text-xs text-emerald-600 dark:text-emerald-400">Attached</span>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">None</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button variant="ghost" size="icon" asChild>
                                                        <Link to={`/admin/doctor-reports/${r.id}`}>
                                                            <Eye className="h-4 w-4" />
                                                        </Link>
                                                    </Button>
                                                    {canEdit && (
                                                        <Button variant="ghost" size="icon" asChild>
                                                            <Link to={`/admin/doctor-reports/${r.id}/edit`}>
                                                                <Pencil className="h-4 w-4" />
                                                            </Link>
                                                        </Button>
                                                    )}
                                                    {canDelete && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="text-destructive hover:text-destructive"
                                                            onClick={() => void handleDelete(r.id)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
