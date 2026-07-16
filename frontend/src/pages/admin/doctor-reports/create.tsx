import axios from '@/lib/axios';
import { FileText, Save, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import { handleApiError } from '@/lib/toast';
import toast from 'react-hot-toast';

interface UserOption {
    id: number;
    name: string;
    email: string;
}

export default function DoctorReportsCreate() {
    const navigate = useNavigate();
    const [users, setUsers] = useState<UserOption[]>([]);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [form, setForm] = useState({
        employee_user_id: '',
        consultation_date: new Date().toISOString().split('T')[0],
        subjective: '',
        objective: '',
        assessment: '',
        plan: '',
        prescription_notes: '',
        status: 'draft' as 'draft' | 'published',
    });
    const [prescriptionFile, setPrescriptionFile] = useState<File | null>(null);

    useEffect(() => {
        void loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            const res = await axios.get('/admin/users/list');
            setUsers(res.data.data || []);
        } catch (error) {
            handleApiError(error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.employee_user_id) {
            toast.error('Please select an employee');
            return;
        }
        setSaving(true);
        try {
            const res = await axios.post('/admin/doctor-reports', {
                employee_user_id: Number(form.employee_user_id),
                consultation_date: form.consultation_date,
                subjective: form.subjective || null,
                objective: form.objective || null,
                assessment: form.assessment || null,
                plan: form.plan || null,
                prescription_notes: form.prescription_notes || null,
                status: form.status,
            });
            const newId = res.data.data?.id;

            // Upload prescription if selected
            if (prescriptionFile && newId) {
                setUploading(true);
                const fd = new FormData();
                fd.append('file', prescriptionFile);
                await axios.post(`/admin/doctor-reports/${newId}/prescription`, fd, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
            }

            toast.success('Report created');
            navigate('/admin/doctor-reports');
        } catch (error) {
            handleApiError(error);
        } finally {
            setSaving(false);
            setUploading(false);
        }
    };

    return (
        <AppLayout
            breadcrumbs={[
                { title: 'Doctor Reports', href: '/admin/doctor-reports' },
                { title: 'New Report', href: '/admin/doctor-reports/create' },
            ]}
        >
            <div className="space-y-6 max-w-4xl">
                <div className="flex items-center gap-3">
                    <FileText className="h-8 w-8 text-primary" />
                    <div>
                        <h1 className="text-2xl font-bold">New SOAP Report</h1>
                        <p className="text-muted-foreground text-sm">Create a medical consultation report</p>
                    </div>
                </div>

                <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Consultation Details</CardTitle>
                            <CardDescription>Select the employee and consultation date</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="employee">Employee *</Label>
                                    <select
                                        id="employee"
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                                        value={form.employee_user_id}
                                        onChange={(e) => setForm({ ...form, employee_user_id: e.target.value })}
                                        required
                                    >
                                        <option value="">Select employee...</option>
                                        {users.map((u) => (
                                            <option key={u.id} value={u.id}>
                                                {u.name} ({u.email})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="date">Consultation Date *</Label>
                                    <Input
                                        id="date"
                                        type="date"
                                        value={form.consultation_date}
                                        onChange={(e) => setForm({ ...form, consultation_date: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="status">Status</Label>
                                <select
                                    id="status"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                                    value={form.status}
                                    onChange={(e) => setForm({ ...form, status: e.target.value as 'draft' | 'published' })}
                                >
                                    <option value="draft">Draft</option>
                                    <option value="published">Published (visible to employee)</option>
                                </select>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>SOAP Notes</CardTitle>
                            <CardDescription>Subjective, Objective, Assessment, Plan</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="subjective">Subjective</Label>
                                <Textarea
                                    id="subjective"
                                    placeholder="Patient's reported symptoms, concerns, and history..."
                                    rows={3}
                                    value={form.subjective}
                                    onChange={(e) => setForm({ ...form, subjective: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="objective">Objective</Label>
                                <Textarea
                                    id="objective"
                                    placeholder="Clinical observations, vitals, examination findings..."
                                    rows={3}
                                    value={form.objective}
                                    onChange={(e) => setForm({ ...form, objective: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="assessment">Assessment</Label>
                                <Textarea
                                    id="assessment"
                                    placeholder="Diagnosis, clinical impression..."
                                    rows={3}
                                    value={form.assessment}
                                    onChange={(e) => setForm({ ...form, assessment: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="plan">Plan</Label>
                                <Textarea
                                    id="plan"
                                    placeholder="Treatment plan, follow-up instructions..."
                                    rows={3}
                                    value={form.plan}
                                    onChange={(e) => setForm({ ...form, plan: e.target.value })}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Prescription</CardTitle>
                            <CardDescription>Upload prescription document and add notes</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="prescription_notes">Prescription Notes</Label>
                                <Textarea
                                    id="prescription_notes"
                                    placeholder="Optional notes about medications, dosage..."
                                    rows={2}
                                    value={form.prescription_notes}
                                    onChange={(e) => setForm({ ...form, prescription_notes: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="prescription_file">Prescription File (PDF, JPG, PNG — max 10MB)</Label>
                                <div className="flex items-center gap-3">
                                    <Input
                                        id="prescription_file"
                                        type="file"
                                        accept=".pdf,.jpg,.jpeg,.png"
                                        onChange={(e) => setPrescriptionFile(e.target.files?.[0] || null)}
                                    />
                                    {prescriptionFile && (
                                        <span className="text-sm text-muted-foreground">{prescriptionFile.name}</span>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex items-center gap-3">
                        <Button type="submit" disabled={saving || uploading}>
                            {uploading ? (
                                <>
                                    <Upload className="mr-2 h-4 w-4 animate-spin" />
                                    Uploading...
                                </>
                            ) : saving ? (
                                'Saving...'
                            ) : (
                                <>
                                    <Save className="mr-2 h-4 w-4" />
                                    Create Report
                                </>
                            )}
                        </Button>
                        <Button type="button" variant="outline" onClick={() => navigate('/admin/doctor-reports')}>
                            Cancel
                        </Button>
                    </div>
                </form>
            </div>
        </AppLayout>
    );
}
