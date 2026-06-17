import axios from '@/lib/axios';

export interface LeaveTypeOption {
    value: string;
    label: string;
}

export async function fetchLeaveTypeOptions(): Promise<LeaveTypeOption[]> {
    const res = await axios.get('/admin/leave-types');
    if (!res.data.success) {
        return [];
    }
    return (res.data.data || []).map(
        (t: { slug: string; name: string; payment_type_label?: string }) => ({
            value: t.slug,
            label: t.payment_type_label ? `${t.name} (${t.payment_type_label})` : t.name,
        }),
    );
}

export function labelForLeaveType(options: LeaveTypeOption[], slug: string): string {
    return options.find((o) => o.value === slug)?.label ?? slug;
}
