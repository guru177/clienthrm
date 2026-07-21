export interface WorkflowAction {
    type: string;
    config: Record<string, unknown>;
}

export interface TriggerCondition {
    field: string;
    operator: string;
    value: string;
}

export const SUPPORTED_TRIGGERS = [
    { value: 'leave_request_submitted', label: 'Leave Request Submitted' },
    { value: 'leave_request_approved', label: 'Leave Request Approved' },
    { value: 'leave_request_rejected', label: 'Leave Request Rejected' },
    { value: 'attendance_clock_in', label: 'Attendance Clock In' },
    { value: 'attendance_late', label: 'Attendance Late' },
    { value: 'attendance_absent', label: 'Attendance Absent' },
    { value: 'grocery_claim_submitted', label: 'Grocery Claim Submitted' },
    { value: 'asset_expense_submitted', label: 'Asset Expense Submitted' },
    { value: 'doctor_report_published', label: 'Doctor Report Published' },
    { value: 'user_created', label: 'User Created / Joined' },
    { value: 'payslip_generated', label: 'Payslip Generated' },
    { value: 'task_overdue', label: 'Task Overdue' },
] as const;

export const SUPPORTED_ACTIONS = [
    { value: 'create_task', label: 'Create Task' },
    { value: 'send_notification', label: 'Send In-App Notification' },
    { value: 'send_email', label: 'Send Email' },
    { value: 'webhook', label: 'Webhook POST' },
    { value: 'whatsapp', label: 'Send WhatsApp' },
    { value: 'notify_manager', label: 'Notify Manager' },
] as const;

export const CONDITION_FIELDS = [
    { value: 'leave_type', label: 'Leave Type' },
    { value: 'days_count', label: 'Days Count' },
    { value: 'reason', label: 'Reason' },
    { value: 'user_id', label: 'User ID' },
    { value: 'amount', label: 'Amount' },
    { value: 'is_late', label: 'Is Late' },
    { value: 'status', label: 'Status' },
    { value: 'source', label: 'Source' },
] as const;

export const CONDITION_OPERATORS = [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'gte', label: 'Greater or Equal' },
    { value: 'lte', label: 'Less or Equal' },
    { value: 'in', label: 'In List (comma-separated)' },
] as const;

const UI_TYPE_FROM_ENGINE: Record<string, string> = {
    notification: 'send_notification',
    notify: 'send_notification',
    email: 'send_email',
    task: 'create_task',
    webhook_post: 'webhook',
    http_webhook: 'webhook',
    send_whatsapp: 'whatsapp',
    whatsapp_message: 'whatsapp',
    assign_manager_notification: 'notify_manager',
    escalate_to_manager: 'notify_manager',
};

/** Convert API-stored actions into UI { type, config } shape for forms. */
export function actionsFromApi(actions: unknown): WorkflowAction[] {
    if (!Array.isArray(actions)) return [];
    return actions.map((raw) => {
        const action = raw as Record<string, unknown>;
        if (action.config && typeof action.config === 'object') {
            return {
                type: String(action.type ?? ''),
                config: action.config as Record<string, unknown>,
            };
        }
        const type = String(action.type ?? action.action ?? '');
        const uiType = UI_TYPE_FROM_ENGINE[type] ?? type;
        const config: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(action)) {
            if (key === 'type' || key === 'action' || key === 'config') continue;
            config[key] = value;
        }
        return { type: uiType, config };
    });
}

/** Parse trigger_conditions from API into editable rules. */
export function conditionsFromApi(raw: unknown): TriggerCondition[] {
    if (!raw) return [];
    if (Array.isArray(raw)) {
        return raw.map((rule) => {
            const r = rule as Record<string, unknown>;
            const value = r.value;
            let valueStr = '';
            if (Array.isArray(value)) {
                valueStr = value.map(String).join(', ');
            } else if (value !== undefined && value !== null) {
                valueStr = String(value);
            }
            return {
                field: String(r.field ?? r.key ?? ''),
                operator: String(r.operator ?? r.op ?? 'equals'),
                value: valueStr,
            };
        });
    }
    if (typeof raw === 'object' && raw !== null) {
        return Object.entries(raw as Record<string, unknown>).map(([field, value]) => ({
            field,
            operator: 'equals',
            value: value === undefined || value === null ? '' : String(value),
        }));
    }
    return [];
}

/** Build trigger_conditions JSON for API from UI rules. */
export function conditionsToApi(rules: TriggerCondition[]): unknown[] | undefined {
    const active = rules.filter((r) => r.field.trim());
    if (active.length === 0) return undefined;
    return active.map((r) => {
        let value: string | number | string[] | boolean = r.value;
        if (r.operator === 'in') {
            value = r.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
        } else if (r.field === 'days_count' || r.field === 'user_id' || r.field === 'amount') {
            const n = Number(r.value);
            if (!Number.isNaN(n)) value = n;
        } else if (r.field === 'is_late') {
            value = r.value === 'true' || r.value === '1';
        }
        return { field: r.field, operator: r.operator, value };
    });
}

export function triggerLabel(value: string): string {
    return SUPPORTED_TRIGGERS.find((t) => t.value === value)?.label ?? value;
}

export function actionLabel(value: string): string {
    return SUPPORTED_ACTIONS.find((a) => a.value === value)?.label ?? value;
}
