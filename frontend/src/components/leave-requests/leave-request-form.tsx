import axios from '@/lib/axios';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { handleApiError, handleApiResponse } from '@/lib/toast';
import { fetchLeaveTypeOptions } from '@/lib/leave-types';

interface LeaveRequestFormProps {
    onSuccess: () => void;
    onCancel: () => void;
}

type LeaveBalance = {
    quota_used?: number;
    quota_pending?: number;
    quota_effective?: number | null;
    quota_year?: number;
    total_leave_days?: number;
};

type LeaveTypeDetail = {
    slug: string;
    name: string;
    quota_days?: number | null;
    counts_toward_quota?: boolean;
    payment_type_label?: string;
};

export default function LeaveRequestForm({ onSuccess, onCancel }: LeaveRequestFormProps) {
    const [formData, setFormData] = useState({
        leave_type: '',
        start_date: '',
        end_date: '',
        reason: '',
    });
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [loading, setLoading] = useState(false);
    const [leaveTypes, setLeaveTypes] = useState<{ value: string; label: string }[]>([]);
    const [typeDetails, setTypeDetails] = useState<LeaveTypeDetail[]>([]);
    const [balance, setBalance] = useState<LeaveBalance | null>(null);

    useEffect(() => {
        fetchLeaveTypeOptions()
            .then(setLeaveTypes)
            .catch(() => setLeaveTypes([]));

        axios
            .get('/admin/leave-types')
            .then((res) => {
                if (res.data.success) setTypeDetails(res.data.data || []);
            })
            .catch(() => setTypeDetails([]));

        axios
            .get('/admin/leave-requests/stats')
            .then((res) => {
                if (res.data.success) setBalance(res.data.data);
            })
            .catch(() => setBalance(null));
    }, []);

    const selectedType = typeDetails.find((t) => t.slug === formData.leave_type);
    const remaining =
        balance?.quota_effective != null && balance.quota_used != null
            ? Math.max(0, balance.quota_effective - balance.quota_used)
            : null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrors({});

        const nextErrors: Record<string, string[]> = {};
        if (!formData.leave_type) nextErrors.leave_type = ['Leave type is required'];
        if (!formData.start_date) nextErrors.start_date = ['Start date is required'];
        if (!formData.end_date) nextErrors.end_date = ['End date is required'];
        if (
            formData.start_date &&
            formData.end_date &&
            formData.end_date < formData.start_date
        ) {
            nextErrors.end_date = ['End date must be on or after the start date'];
        }
        if (!formData.reason.trim()) nextErrors.reason = ['Reason is required'];
        else if (formData.reason.trim().length < 10) {
            nextErrors.reason = ['Reason must be at least 10 characters'];
        }
        if (Object.keys(nextErrors).length > 0) {
            setErrors(nextErrors);
            setLoading(false);
            return;
        }

        try {
            const response = await axios.post('/admin/leave-requests', formData);
            handleApiResponse(response);
            onSuccess();
        } catch (error: any) {
            if (error.response?.data?.errors) {
                setErrors(error.response.data.errors);
            }
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {(balance?.quota_effective != null || selectedType?.quota_days != null) && (
                <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                    {balance?.quota_effective != null ? (
                        <p>
                            Leave balance ({balance.quota_year ?? 'this year'}):{' '}
                            <span className="font-semibold">{remaining ?? '—'}</span> of{' '}
                            <span className="font-semibold">{balance.quota_effective}</span> business
                            days remaining
                            {balance.quota_pending ? (
                                <span className="text-muted-foreground">
                                    {' '}
                                    ({balance.quota_pending} pending)
                                </span>
                            ) : null}
                        </p>
                    ) : null}
                    {selectedType?.counts_toward_quota && selectedType.quota_days != null && (
                        <p className="text-muted-foreground">
                            {selectedType.name} allowance: {selectedType.quota_days} days / year
                        </p>
                    )}
                </div>
            )}

            <div className="space-y-2">
                <Label htmlFor="leave_type">
                    Leave Type <span className="text-destructive">*</span>
                </Label>
                <Select
                    value={formData.leave_type}
                    onValueChange={(value) =>
                        setFormData({ ...formData, leave_type: value })
                    }
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Select leave type" />
                    </SelectTrigger>
                    <SelectContent>
                        {leaveTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                                {type.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {errors.leave_type && (
                    <p className="text-sm text-destructive">{errors.leave_type[0]}</p>
                )}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="start_date">
                        Start Date <span className="text-destructive">*</span>
                    </Label>
                    <Input
                        id="start_date"
                        type="date"
                        value={formData.start_date}
                        onChange={(e) =>
                            setFormData({ ...formData, start_date: e.target.value })
                        }
                    />
                    {errors.start_date && (
                        <p className="text-sm text-destructive">{errors.start_date[0]}</p>
                    )}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="end_date">
                        End Date <span className="text-destructive">*</span>
                    </Label>
                    <Input
                        id="end_date"
                        type="date"
                        value={formData.end_date}
                        min={formData.start_date || undefined}
                        onChange={(e) =>
                            setFormData({ ...formData, end_date: e.target.value })
                        }
                    />
                    {errors.end_date && (
                        <p className="text-sm text-destructive">{errors.end_date[0]}</p>
                    )}
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="reason">
                    Reason <span className="text-destructive">*</span>
                </Label>
                <Textarea
                    id="reason"
                    value={formData.reason}
                    onChange={(e) =>
                        setFormData({ ...formData, reason: e.target.value })
                    }
                    placeholder="Please provide a detailed reason for your leave request"
                    rows={4}
                />
                {errors.reason && (
                    <p className="text-sm text-destructive">{errors.reason[0]}</p>
                )}
                <p className="text-xs text-muted-foreground">
                    Minimum 10 characters required
                </p>
            </div>

            <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
                    Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                    {loading ? 'Submitting...' : 'Submit Request'}
                </Button>
            </div>
        </form>
    );
}
