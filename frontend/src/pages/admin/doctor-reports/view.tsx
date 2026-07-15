import axios from '@/lib/axios';
import { FileText, ArrowLeft, Download, Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { handleApiError } from '@/lib/toast';
import { useAuth } from '@/contexts/AuthContext';

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
    updated_at: string;
    employee_name: string | null;
    doctor_name: string | null;
}

export default function DoctorReportsView() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { hasPermission } = useAuth();
    const [report, setReport] = useState<DoctorReport | null>(null);
    const [loading, setLoading] = useState(true);
    const canEdit = hasPermission('edit-doctor-reports');

    useEffect(() => {
        void loadReport();
    }, [id]);

    const loadReport = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/admin/doctor-reports/${id}`);
            setReport(res.data.data);
        } catch (error) {
            handleApiError(error);
            navigate('/admin/doctor-reports');
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = async () => {
        if (!report?.prescription_path) return;
        try {
            const res = await axios.get(`/admin/files/${report.prescription_path}`, { responseType: 'blob' });
            const blob = new Blob([res.data]);
            const url = URL.createObjectURL(blob);
            const win = window.open(url, '_blank', 'noopener,noreferrer');
            if (!win) {
                URL.revokeObjectURL(url);
                throw new Error('Pop-up blocked. Please allow pop-ups for this site.');
            }
            win.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
        } catch (error) {
            handleApiError(error);
        }
    };

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

    if (loading) {
        return (
            <AppLayout breadcrumbs={[{ title: 'Doctor Reports', href: '/admin/doctor-reports' }, { title: 'View', href: '#' }]}>
                <div className="flex items-center justify-center py-20">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
            </AppLayout>
        );
    }

    if (!report) return null;

    return (
        <AppLayout
            breadcrumbs={[
                { title: 'Doctor Reports', href: '/admin/doctor-reports' },
                { title: `Report #${report.id}`, href: '#' },
            ]}
        >
            <div className="space-y-6 max-w-4xl">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <FileText className="h-8 w-8 text-primary" />
                        <div>
                            <h1 className="text-2xl font-bold">SOAP Report</h1>
                            <p className="text-muted-foreground text-sm">
                                {report.employee_name || `Employee #${report.employee_user_id}`} — {report.consultation_date}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => navigate('/admin/doctor-reports')}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back
                        </Button>
                        {canEdit && (
                            <Button size="sm" asChild>
                                <Link to={`/admin/doctor-reports/${report.id}/edit`}>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit
                                </Link>
                            </Button>
                        )}
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle>Consultation Details</CardTitle>
                            {statusBadge(report.status)}
                        </div>
                    </CardHeader>
                    <CardContent>
                        <dl className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                            <div>
                                <dt className="text-muted-foreground">Employee</dt>
                                <dd className="font-medium">{report.employee_name || `User #${report.employee_user_id}`}</dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground">Doctor</dt>
                                <dd className="font-medium">{report.doctor_name || `User #${report.doctor_user_id}`}</dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground">Consultation Date</dt>
                                <dd className="font-medium">{report.consultation_date}</dd>
                            </div>
                        </dl>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>SOAP Notes</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div>
                            <h3 className="text-sm font-semibold text-primary mb-1">Subjective</h3>
                            <p className="text-sm whitespace-pre-wrap rounded-md bg-muted/50 p-3 min-h-[40px]">
                                {report.subjective || <span className="text-muted-foreground italic">No notes</span>}
                            </p>
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-primary mb-1">Objective</h3>
                            <p className="text-sm whitespace-pre-wrap rounded-md bg-muted/50 p-3 min-h-[40px]">
                                {report.objective || <span className="text-muted-foreground italic">No notes</span>}
                            </p>
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-primary mb-1">Assessment</h3>
                            <p className="text-sm whitespace-pre-wrap rounded-md bg-muted/50 p-3 min-h-[40px]">
                                {report.assessment || <span className="text-muted-foreground italic">No notes</span>}
                            </p>
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-primary mb-1">Plan</h3>
                            <p className="text-sm whitespace-pre-wrap rounded-md bg-muted/50 p-3 min-h-[40px]">
                                {report.plan || <span className="text-muted-foreground italic">No notes</span>}
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {(report.prescription_notes || report.prescription_path) && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Prescription</CardTitle>
                            {report.prescription_notes && (
                                <CardDescription>{report.prescription_notes}</CardDescription>
                            )}
                        </CardHeader>
                        {report.prescription_path && (
                            <CardContent>
                                <Button variant="outline" onClick={() => void handleDownload()}>
                                    <Download className="mr-2 h-4 w-4" />
                                    Download Prescription
                                </Button>
                            </CardContent>
                        )}
                    </Card>
                )}
            </div>
        </AppLayout>
    );
}
