import axios from '@/lib/axios';
import { FileText, Eye, Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { handleApiError } from '@/lib/toast';

interface DoctorReport {
    id: number;
    consultation_date: string;
    subjective: string;
    assessment: string;
    prescription_path: string | null;
    doctor_name: string | null;
    doctor_user_id: number;
}

export default function MyDoctorReportsPage() {
    const [reports, setReports] = useState<DoctorReport[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        void loadReports();
    }, []);

    const loadReports = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/admin/me/doctor-reports');
            setReports(res.data.data || []);
        } catch (error) {
            handleApiError(error);
            setReports([]);
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = async (path: string) => {
        try {
            const res = await axios.get(`/admin/files/${path}`, { responseType: 'blob' });
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

    return (
        <AppLayout breadcrumbs={[{ title: 'My Doctor Reports', href: '/admin/my-doctor-reports' }]}>
            <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <FileText className="h-8 w-8 text-primary" />
                    <div>
                        <h1 className="text-2xl font-bold">My Doctor Reports</h1>
                        <p className="text-muted-foreground text-sm">View your medical consultation reports</p>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Consultation History</CardTitle>
                        <CardDescription>Only published reports are shown here</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Doctor</TableHead>
                                    <TableHead>Assessment</TableHead>
                                    <TableHead>Prescription</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8">
                                            Loading...
                                        </TableCell>
                                    </TableRow>
                                ) : reports.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                            No reports yet
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    reports.map((r) => (
                                        <TableRow key={r.id}>
                                            <TableCell className="font-medium">{r.consultation_date}</TableCell>
                                            <TableCell>{r.doctor_name || `Doctor #${r.doctor_user_id}`}</TableCell>
                                            <TableCell className="max-w-xs truncate">
                                                {r.assessment || <span className="text-muted-foreground">—</span>}
                                            </TableCell>
                                            <TableCell>
                                                {r.prescription_path ? (
                                                    <button
                                                        onClick={() => void handleDownload(r.prescription_path!)}
                                                        className="inline-flex items-center text-xs text-primary hover:underline"
                                                    >
                                                        <Download className="mr-1 h-3 w-3" />
                                                        Download
                                                    </button>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">None</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="outline" size="sm" asChild>
                                                    <Link to={`/admin/my-doctor-reports/${r.id}`}>
                                                        <Eye className="mr-1 h-4 w-4" />
                                                        View
                                                    </Link>
                                                </Button>
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
