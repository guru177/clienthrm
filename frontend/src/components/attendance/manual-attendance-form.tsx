import axios from '@/lib/axios';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Textarea } from '@/components/ui/textarea';
import { localTodayISO } from '@/lib/datetime';
import { handleApiError, handleApiResponse } from '@/lib/toast';

export const MANUAL_STATUS_OPTIONS = [
    'present',
    'absent',
    'half_day',
    'leave',
    'on_leave',
    'sick_leave',
    'holiday',
    'extra_work',
] as const;

export interface EmployeeOption {
    id: number;
    name: string;
    email?: string;
    phone?: string | null;
    department_name?: string | null;
}

function formatEmployeeLabel(e: EmployeeOption): string {
    const parts = [e.name];
    if (e.department_name) {
        parts.push(e.department_name);
    }
    let label = parts.join(' — ');
    if (e.phone) {
        label += ` (${e.phone})`;
    }
    return label;
}

export interface ManualEntryForm {
    user_id: string;
    date: string;
    clock_in: string;
    clock_out: string;
    status: string;
    notes: string;
}

const emptyForm = (date?: string): ManualEntryForm => ({
    user_id: '',
    date: date ?? localTodayISO(),
    clock_in: '',
    clock_out: '',
    status: 'present',
    notes: '',
});

interface ManualAttendanceFormProps {
    defaultDate?: string;
    onSuccess?: () => void;
}

export default function ManualAttendanceForm({ defaultDate, onSuccess }: ManualAttendanceFormProps) {
    const [employees, setEmployees] = useState<EmployeeOption[]>([]);
    const [loadingEmployees, setLoadingEmployees] = useState(true);
    const [selectedEmployee, setSelectedEmployee] = useState<EmployeeOption | null>(null);
    const [form, setForm] = useState<ManualEntryForm>(() => emptyForm(defaultDate));
    const [saving, setSaving] = useState(false);
    const searchTimerRef = useRef<number | undefined>(undefined);

    const loadEmployees = useCallback(async (search: string) => {
        setLoadingEmployees(true);
        try {
            const res = await axios.get('/admin/attendance/users', {
                params: { search: search.trim() || undefined },
            });
            setEmployees(res.data.data ?? []);
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoadingEmployees(false);
        }
    }, []);

    const handleQueryChange = useCallback(
        (query: string) => {
            if (searchTimerRef.current) {
                window.clearTimeout(searchTimerRef.current);
            }
            searchTimerRef.current = window.setTimeout(() => {
                void loadEmployees(query);
            }, 300);
        },
        [loadEmployees],
    );

    useEffect(() => {
        void loadEmployees('');
    }, [loadEmployees]);

    useEffect(() => {
        if (defaultDate) {
            setForm((f) => ({ ...f, date: defaultDate }));
        }
    }, [defaultDate]);

    const employeeOptions = useMemo(() => {
        const opts = employees.map((e) => ({
            value: String(e.id),
            label: formatEmployeeLabel(e),
        }));
        if (
            selectedEmployee &&
            form.user_id === String(selectedEmployee.id) &&
            !opts.some((o) => o.value === form.user_id)
        ) {
            opts.unshift({
                value: String(selectedEmployee.id),
                label: formatEmployeeLabel(selectedEmployee),
            });
        }
        return opts;
    }, [employees, form.user_id, selectedEmployee]);

    const submit = async () => {
        if (!form.user_id) {
            handleApiError({ response: { data: { message: 'Select an employee' } } });
            return;
        }
        setSaving(true);
        try {
            const res = await axios.post('/admin/attendance/manual', {
                user_id: Number(form.user_id),
                date: form.date,
                clock_in: form.clock_in || undefined,
                clock_out: form.clock_out || undefined,
                status: form.status,
                notes: form.notes || undefined,
            });
            handleApiResponse(res);
            setForm(emptyForm(form.date));
            setSelectedEmployee(null);
            onSuccess?.();
        } catch (error) {
            handleApiError(error);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Plus className="h-5 w-5 text-primary" />
                    Quick single entry
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                    Add one attendance record for a specific employee and date.
                </p>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="space-y-1">
                    <Label htmlFor="manual_form_employee">Employee</Label>
                    <SearchableSelect
                        value={form.user_id}
                        onValueChange={(v) => {
                            const employee = employees.find((e) => String(e.id) === v);
                            if (employee) {
                                setSelectedEmployee(employee);
                            }
                            setForm((f) => ({ ...f, user_id: v }));
                        }}
                        options={employeeOptions}
                        placeholder="Select employee"
                        searchPlaceholder="Search by name, department, or phone"
                        emptyMessage="No employees match your search"
                        loading={loadingEmployees}
                        filterLocally={false}
                        onQueryChange={handleQueryChange}
                        onOpenChange={(open) => {
                            if (!open) {
                                void loadEmployees('');
                            }
                        }}
                    />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="manual_form_date">Date</Label>
                    <Input
                        id="manual_form_date"
                        type="date"
                        value={form.date}
                        onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                        <Label htmlFor="manual_form_in">Clock in</Label>
                        <Input
                            id="manual_form_in"
                            type="time"
                            value={form.clock_in}
                            onChange={(e) => setForm((f) => ({ ...f, clock_in: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="manual_form_out">Clock out</Label>
                        <Input
                            id="manual_form_out"
                            type="time"
                            value={form.clock_out}
                            onChange={(e) => setForm((f) => ({ ...f, clock_out: e.target.value }))}
                        />
                    </div>
                </div>
                <div className="space-y-1">
                    <Label>Status</Label>
                    <Select
                        value={form.status}
                        onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {MANUAL_STATUS_OPTIONS.map((s) => (
                                <SelectItem key={s} value={s} className="capitalize">
                                    {s.replace('_', ' ')}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1">
                    <Label htmlFor="manual_form_notes">Notes</Label>
                    <Textarea
                        id="manual_form_notes"
                        placeholder="Reason (optional)"
                        value={form.notes}
                        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                </div>
                <Button type="button" onClick={submit} disabled={saving}>
                    {saving ? 'Saving...' : 'Create entry'}
                </Button>
            </CardContent>
        </Card>
    );
}
