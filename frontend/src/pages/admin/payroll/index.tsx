// Head removed - use document.title instead
import {
    Banknote,
    Users, CalendarCheck, Calendar, Star,
    ChevronDown, ChevronRight, Check, Plus, Trash2,
    Building2, MapPin, LayoutGrid, Loader2, X, Download, Mail
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import axios from '@/lib/axios';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { bulkSendPayslipEmails, downloadBulkPayslipsZip, openPayslipPdf } from '@/lib/payslip-pdf';
import { handleApiError, handleApiResponse } from '@/lib/toast';
import { useConfirm } from '@/lib/confirm';
import { usePermissions } from '@/hooks/use-permissions';

// ─── Types ───────────────────────────────────────────────────────────────────
interface SalaryComponent {
    name: string;
    type: 'earning' | 'deduction' | 'reimbursement';
    amount: number;
}

interface SalaryStructure {
    components: SalaryComponent[];
    gross_salary: number;
    gross_after_lop?: number;
    total_deductions: number;
    lop_deduction: number;
    lop_breakdown?: {
        days: number;
        lines?: { component_id?: number; name: string; amount: number }[];
        basic: number;
        hra: number;
        conveyance: number;
        special: number;
        total: number;
    };
    pf_deduction?: number;
    esi_deduction?: number;
    prof_tax?: number;
    advance_deduction?: number;
    suggested_shift_penalty?: number;
    net_salary: number;
}

interface Employee {
    id: number;
    name: string;
    email: string;
    photo?: string;
    department_id?: number;
    department_name?: string;
    work_location?: string;
    present_days: number;
    leave_days: number;
    working_days: number;
    paid_holidays: number;
    lop_days?: number;
    absent_days?: number;
    shift_penalty?: number;
    suggested_shift_penalty?: number;
    penalty_days?: number;
    ot_hours?: number;
    ot_amount?: number;
    variable_pay?: number;
    reimbursement_amount?: number;
    arrears_amount?: number;
    payroll_hold?: boolean;
    has_salary_structure: boolean;
    salary_structure?: SalaryStructure;
    gross_salary?: number;
    net_salary?: number;
    active_advances?: ActiveAdvance[];
    payslip_id?: number;
    payslip_status?: string;
}

interface Adjustment {
    type: 'addition' | 'deduction';
    label: string;
    amount: number;
}

interface ActiveAdvance {
    id: number;
    amount: number;
    balance: number;
    monthly_emi: number;
    description?: string | null;
}

interface AdvanceAllocation {
    advance_id: number;
    amount: number;
}

function defaultAdvanceAmount(adv: ActiveAdvance): number {
    return Math.round(Math.min(adv.monthly_emi, adv.balance) * 100) / 100;
}

function defaultAdvanceAllocations(advances: ActiveAdvance[]): AdvanceAllocation[] {
    return advances
        .map((a) => ({ advance_id: a.id, amount: defaultAdvanceAmount(a) }))
        .filter((a) => a.amount > 0);
}

function sumAdvanceAllocations(allocs: AdvanceAllocation[]): number {
    return Math.round(allocs.reduce((s, a) => s + (a.amount || 0), 0) * 100) / 100;
}

interface CommonAdjustment {
    type: 'addition' | 'deduction';
    label: string;
    valueType: 'flat' | 'percentage';
    value: number;
}

interface Department { id: number; name: string; }
interface Center { id: string; name: string; city?: string; }

type FilterMode = 'all' | 'departments' | 'centers';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n?: number | null) =>
    n != null && Number.isFinite(n) ? '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—';

const monthNames = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
];

// ─── Salary Popup ─────────────────────────────────────────────────────────────
function SalaryPopup({
    employee,
    adjustments,
    advanceAllocations,
    onSave,
    onClose,
}: {
    employee: Employee;
    adjustments: Adjustment[];
    advanceAllocations: AdvanceAllocation[];
    onSave: (adj: Adjustment[], advances: AdvanceAllocation[]) => void;
    onClose: () => void;
}) {
    const [adjs, setAdjs] = useState<Adjustment[]>(adjustments);
    const activeAdvances = employee.active_advances ?? [];
    const [advanceRows, setAdvanceRows] = useState<AdvanceAllocation[]>(() => {
        if (advanceAllocations.length > 0) {
            return advanceAllocations;
        }
        return activeAdvances.map((a) => ({
            advance_id: a.id,
            amount: defaultAdvanceAmount(a),
        }));
    });

    const addRow = () =>
        setAdjs([...adjs, { type: 'addition', label: '', amount: 0 }]);

    const suggestedPenalty =
        employee.suggested_shift_penalty ??
        employee.salary_structure?.suggested_shift_penalty ??
        0;
    const penaltyDays = employee.penalty_days ?? 0;

    const addPenaltyDeduction = () => {
        setAdjs([
            ...adjs,
            {
                type: 'deduction',
                label: 'Late/Early Penalty',
                amount: suggestedPenalty > 0 ? Math.round(suggestedPenalty * 100) / 100 : 0,
            },
        ]);
    };

    const removeRow = (i: number) =>
        setAdjs(adjs.filter((_, idx) => idx !== i));

    const updateRow = (i: number, patch: Partial<Adjustment>) =>
        setAdjs(adjs.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));

    const ss = employee.salary_structure;
    const defaultAdvance = ss?.advance_deduction ?? 0;
    const customAdvance = sumAdvanceAllocations(advanceRows);
    const advanceDelta = customAdvance - defaultAdvance;
    const totalAdditions = adjs.filter(a => a.type === 'addition').reduce((s, a) => s + (a.amount || 0), 0);
    const totalDeductions = adjs.filter(a => a.type === 'deduction').reduce((s, a) => s + (a.amount || 0), 0);
    // total_deductions from backend includes LOP and statutory (not auto shift penalties)
    const adjustedNet = ss
        ? Math.max(
              0,
              (ss.gross_salary || 0) +
                  totalAdditions -
                  (ss.total_deductions || 0) -
                  totalDeductions -
                  advanceDelta,
          )
        : null;

    const updateAdvanceAmount = (advanceId: number, amount: number) => {
        setAdvanceRows((prev) =>
            prev.map((r) => (r.advance_id === advanceId ? { ...r, amount } : r)),
        );
    };

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                            {employee.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div>{employee.name}</div>
                            <div className="text-xs font-normal text-muted-foreground">{employee.email}</div>
                        </div>
                    </DialogTitle>
                </DialogHeader>

                {ss ? (
                    <div className="space-y-5">
                        {employee.payslip_status === 'generated' && (
                            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
                                This payslip was already finalized. The figures below are recalculated from current attendance.
                                Unlock the payslip, then preview and generate again to update the PDF.
                            </div>
                        )}
                        {/* Salary Structure */}
                        <div className="grid grid-cols-2 gap-3">
                            {/* Earnings */}
                            <div className="rounded-lg border bg-green-50 dark:bg-green-950/20 p-3 space-y-2">
                                <div className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide">Earnings</div>
                                {ss.components.filter(c => c.type === 'earning').map(c => (
                                    <div key={c.name} className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">{c.name}</span>
                                        <span className="font-medium">{fmt(c.amount)}</span>
                                    </div>
                                ))}
                                <div className="border-t pt-2 flex justify-between text-sm font-semibold text-green-700 dark:text-green-400">
                                    <span>Gross</span><span>{fmt(ss.gross_salary)}</span>
                                </div>
                            </div>
                            {/* Deductions */}
                            <div className="rounded-lg border bg-red-50 dark:bg-red-950/20 p-3 space-y-2">
                                <div className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide">Deductions</div>
                                {ss.components.filter(c => c.type === 'deduction').map((c, i) => (
                                    <div key={`${c.name}-${i}`} className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">{c.name}</span>
                                        <span className="font-medium">{fmt(c.amount)}</span>
                                    </div>
                                ))}
                                {ss.advance_deduction != null && ss.advance_deduction > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Advance recovery (default)</span>
                                        <span className="font-medium">{fmt(ss.advance_deduction)}</span>
                                    </div>
                                )}
                                <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                                    <span className="text-muted-foreground">Attendance</span>
                                    <span>{employee.present_days}/{employee.working_days} days</span>
                                </div>
                                {(employee.lop_days ?? employee.absent_days ?? 0) > 0 && (
                                    <div className="flex justify-between text-xs text-red-600">
                                        <span>LOP days</span>
                                        <span>{employee.lop_days ?? employee.absent_days} days</span>
                                    </div>
                                )}
                                {penaltyDays > 0 && (
                                    <div className="flex justify-between text-xs text-amber-700 dark:text-amber-400">
                                        <span>Late/early days (info)</span>
                                        <span>{penaltyDays} day{penaltyDays !== 1 ? 's' : ''}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {penaltyDays > 0 && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-3 py-2.5 text-sm space-y-2">
                                <p className="text-amber-900 dark:text-amber-100">
                                    <strong>{penaltyDays}</strong> late/early attendance mark{penaltyDays !== 1 ? 's' : ''} this month.
                                    Penalties are <strong>not deducted automatically</strong> — add a deduction below if there is no valid excuse.
                                </p>
                                {suggestedPenalty > 0 && (
                                    <p className="text-xs text-muted-foreground">
                                        Suggested reference amount: {fmt(suggestedPenalty)} (half-day wage × penalty days).
                                    </p>
                                )}
                                <Button size="sm" variant="outline" type="button" onClick={addPenaltyDeduction}>
                                    Add penalty deduction
                                </Button>
                            </div>
                        )}

                        {/* Net Salary Summary */}
                        <div className="flex items-center justify-between rounded-lg bg-primary/5 border border-primary/20 p-4">
                            <span className="font-semibold">Net Salary</span>
                            <div className="text-right">
                                <div className="text-xl font-bold text-primary">{fmt(adjustedNet)}</div>
                                <div className="text-xs text-muted-foreground">
                                    Gross: {fmt(ss.gross_salary)}
                                    {ss.total_deductions > 0 && <span className="text-red-600"> −Ded {fmt(ss.total_deductions)}</span>}
                                    {advanceDelta !== 0 && (
                                        <span className="text-red-600">
                                            {' '}
                                            {advanceDelta > 0 ? '−' : '+'}
                                            {fmt(Math.abs(advanceDelta))} advance
                                        </span>
                                    )}
                                    {totalAdditions > 0 && <span className="text-green-600"> +{fmt(totalAdditions)}</span>}
                                    {totalDeductions > 0 && <span className="text-red-600"> −{fmt(totalDeductions)}</span>}
                                </div>
                            </div>
                        </div>

                        {activeAdvances.length > 0 && (
                            <div>
                                <h4 className="font-semibold text-sm mb-3">Advance recovery</h4>
                                <div className="rounded-md border overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Description</TableHead>
                                                <TableHead>Balance</TableHead>
                                                <TableHead>Monthly EMI</TableHead>
                                                <TableHead>Recover this month</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {activeAdvances.map((adv) => {
                                                const rowAmount =
                                                    advanceRows.find((r) => r.advance_id === adv.id)?.amount ?? 0;
                                                return (
                                                    <TableRow key={adv.id}>
                                                        <TableCell>{adv.description || `Advance #${adv.id}`}</TableCell>
                                                        <TableCell>{fmt(adv.balance)}</TableCell>
                                                        <TableCell>{fmt(adv.monthly_emi)}</TableCell>
                                                        <TableCell>
                                                            <Input
                                                                type="number"
                                                                min={0}
                                                                max={adv.balance}
                                                                step="0.01"
                                                                value={rowAmount || ''}
                                                                onChange={(e) =>
                                                                    updateAdvanceAmount(
                                                                        adv.id,
                                                                        parseFloat(e.target.value) || 0,
                                                                    )
                                                                }
                                                                className="w-32"
                                                            />
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">
                                    Total advance recovery this month: {fmt(customAdvance)}
                                </p>
                            </div>
                        )}

                        {/* Adjustments */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="font-semibold text-sm">Additional Adjustments</h4>
                                <Button size="sm" variant="outline" onClick={addRow} type="button">
                                    <Plus className="h-4 w-4 mr-1" /> Add Row
                                </Button>
                            </div>
                            {adjs.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-3 border rounded-lg">
                                    No adjustments. Click "Add Row" to add.
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {adjs.map((adj, i) => (
                                        <div key={i} className="flex gap-2 items-center">
                                            <Select
                                                value={adj.type}
                                                onValueChange={v => updateRow(i, { type: v as 'addition' | 'deduction' })}
                                            >
                                                <SelectTrigger className="w-32">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="addition">Addition</SelectItem>
                                                    <SelectItem value="deduction">Deduction</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <Input
                                                placeholder="Label (e.g. Bonus)"
                                                value={adj.label}
                                                onChange={e => updateRow(i, { label: e.target.value })}
                                                className="flex-1"
                                            />
                                            <Input
                                                type="number"
                                                placeholder="Amount"
                                                value={adj.amount || ''}
                                                onChange={e => updateRow(i, { amount: parseFloat(e.target.value) || 0 })}
                                                className="w-28"
                                            />
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={() => removeRow(i)}
                                                className="text-destructive hover:text-destructive"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Save */}
                        <div className="flex justify-end gap-2 pt-2 border-t">
                            <Button variant="outline" onClick={onClose}>Cancel</Button>
                            <Button onClick={() => { onSave(adjs, advanceRows); onClose(); }}>Save Adjustments</Button>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-8 text-muted-foreground">
                        <p>No salary structure configured for this employee.</p>
                        <p className="text-sm mt-1">Please set up a salary structure in the employee profile.</p>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

// ─── Preview Popup ────────────────────────────────────────────────────────────
function PreviewPopup({
    previews,
    month,
    year,
    onGenerate,
    onClose,
    canManagePayroll,
}: {
    previews: any[];
    month: number;
    year: number;
    onGenerate: () => void;
    onClose: () => void;
    canManagePayroll: boolean;
}) {
    const confirm = useConfirm();
    const [generating, setGenerating] = useState(false);
    const [sendEmails, setSendEmails] = useState(true);
    const [commonAdjs, setCommonAdjs] = useState<CommonAdjustment[]>([]);
    const [adjOpen, setAdjOpen] = useState(false);

    const addRow = () =>
        setCommonAdjs(prev => [...prev, { type: 'addition', label: '', valueType: 'flat', value: 0 }]);
    const removeRow = (i: number) =>
        setCommonAdjs(prev => prev.filter((_, idx) => idx !== i));
    const updateRow = (i: number, patch: Partial<CommonAdjustment>) =>
        setCommonAdjs(prev => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));

    const ready = previews.filter(p => !p.skipped);
    const skipped = previews.filter(p => p.skipped);

    const calcAdjustedNet = (p: any): number => {
        let net = Number(p.net_salary);
        if (!Number.isFinite(net)) net = 0;
        const gross = Number(p.gross_salary);
        const grossBase = Number.isFinite(gross) ? gross : 0;
        for (const adj of commonAdjs) {
            if (!adj.value) continue;
            const amt = adj.valueType === 'percentage'
                ? Math.round(grossBase * adj.value / 100 * 100) / 100
                : adj.value;
            if (adj.type === 'addition') net += amt;
            else net = Math.max(0, net - amt);
        }
        return net;
    };

    const hasActiveAdjs = commonAdjs.some(a => a.value > 0);
    const total = ready.reduce((sum, p) => sum + calcAdjustedNet(p), 0);

    const handleGenerate = async () => {
        const emailNote = sendEmails
            ? ' Payslip emails will be sent to employees.'
            : '';
        if (
            !(await confirm({
                title: 'Generate payroll',
                description: `Generate payroll for ${ready.length} employee(s) for ${month}/${year}?${emailNote} This cannot be easily undone.`,
                confirmText: 'Generate',
            }))
        ) {
            return;
        }
        setGenerating(true);
        try {
            const validAdjs = commonAdjs
                .filter(a => a.value > 0 && a.label.trim())
                .map(a => ({ type: a.type, label: a.label, value_type: a.valueType, value: a.value }));

            const response = await axios.post('/admin/payroll/generate', {
                month,
                year,
                payslip_ids: ready.filter(p => p.id).map(p => p.id),
                common_adjustments: validAdjs,
                send_emails: sendEmails,
            });
            handleApiResponse(response);
            if (response.data.success) {
                const email = response.data.data?.email;
                if (email && sendEmails) {
                    if (email.queued) {
                        handleApiResponse({
                            data: {
                                success: true,
                                message: `Payslip emails queued for ${email.count ?? 0} employee(s)`,
                            },
                        });
                    } else {
                        const sent = email.sent ?? 0;
                        const skipped = email.skipped ?? 0;
                        if (sent > 0) {
                            handleApiResponse({
                                data: {
                                    success: true,
                                    message: `Payslip emails sent to ${sent} employee(s)${skipped > 0 ? ` (${skipped} skipped)` : ''}`,
                                },
                            });
                        }
                    }
                }
                onGenerate();
                onClose();
            }
        } catch (error) {
            handleApiError(error);
        } finally {
            setGenerating(false);
        }
    };

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="w-[760px] max-w-[95vw] sm:max-w-[760px] max-h-[90vh] flex flex-col gap-3">
                <DialogHeader>
                    <DialogTitle>
                        Payroll Preview — {monthNames[month - 1]} {year}
                    </DialogTitle>
                    <p className="text-sm text-muted-foreground">
                        {ready.length} employee(s) ready for payroll generation
                        {skipped.length > 0 && (
                            <> · {skipped.length} skipped</>
                        )}
                    </p>
                </DialogHeader>

                {/* Common Adjustments */}
                <div className="border rounded-lg overflow-hidden shrink-0">
                    <button
                        type="button"
                        className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors text-sm font-semibold"
                        onClick={() => setAdjOpen(o => !o)}
                    >
                        <span className="flex items-center gap-2">
                            <Plus className="h-4 w-4" />
                            Common Adjustments
                            {commonAdjs.length > 0 && (
                                <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full font-medium">
                                    {commonAdjs.length}
                                </span>
                            )}
                        </span>
                        {adjOpen
                            ? <X className="h-4 w-4 text-muted-foreground" />
                            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </button>

                    {adjOpen && (
                        <div className="p-3 border-t space-y-3 bg-background">
                            <p className="text-xs text-muted-foreground">
                                Applies to <strong>all employees</strong>. Percentage is calculated on each employee's gross salary.
                            </p>

                            {commonAdjs.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-2">No adjustments yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    {commonAdjs.map((adj, i) => (
                                        <div key={i} className="grid gap-2 items-center" style={{ gridTemplateColumns: '9rem 1fr 10rem 12rem 2.5rem', minWidth: '38rem' }}>
                                            <Select
                                                value={adj.type}
                                                onValueChange={v => updateRow(i, { type: v as 'addition' | 'deduction' })}
                                            >
                                                <SelectTrigger className="w-full">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="addition">Addition</SelectItem>
                                                    <SelectItem value="deduction">Deduction</SelectItem>
                                                </SelectContent>
                                            </Select>

                                            <Input
                                                placeholder="Label (e.g. Festival Bonus)"
                                                value={adj.label}
                                                onChange={e => updateRow(i, { label: e.target.value })}
                                                className="w-full"
                                            />

                                            <Select
                                                value={adj.valueType}
                                                onValueChange={v => updateRow(i, { valueType: v as 'flat' | 'percentage' })}
                                            >
                                                <SelectTrigger className="w-full">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="flat">Flat (₹)</SelectItem>
                                                    <SelectItem value="percentage">% of Gross</SelectItem>
                                                </SelectContent>
                                            </Select>

                                            <Input
                                                type="number"
                                                min="0"
                                                placeholder={adj.valueType === 'percentage' ? 'e.g. 5' : 'Amount'}
                                                value={adj.value || ''}
                                                onChange={e => updateRow(i, { value: parseFloat(e.target.value) || 0 })}
                                                className="w-full"
                                            />

                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={() => removeRow(i)}
                                                className="text-destructive hover:text-destructive"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <Button size="sm" variant="outline" onClick={addRow} type="button">
                                <Plus className="h-4 w-4 mr-1" /> Add Row
                            </Button>
                        </div>
                    )}
                </div>

                {/* Preview Table */}
                <div className="flex-1 overflow-y-auto border rounded-lg">
                    {skipped.length > 0 && (
                        <div className="px-3 py-2 text-xs text-amber-800 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-200 border-b">
                            {skipped.length} employee(s) cannot be included: missing salary structure, or payslip already generated (unlock first).
                        </div>
                    )}
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 sticky top-0">
                            <tr>
                                <th className="text-left p-3 font-semibold">Employee</th>
                                <th className="text-right p-3 font-semibold">Working Days</th>
                                <th className="text-right p-3 font-semibold">Present</th>
                                <th className="text-right p-3 font-semibold">LOP Days</th>
                                <th className="text-right p-3 font-semibold">Late/Early</th>
                                <th className="text-right p-3 font-semibold">Gross</th>
                                <th className="text-right p-3 font-semibold">Deductions</th>
                                <th className="text-right p-3 font-semibold text-primary">Net Salary</th>
                            </tr>
                        </thead>
                        <tbody>
                            {skipped.map((p, i) => (
                                <tr key={`skip-${p.user_id ?? i}`} className="bg-amber-50/50 dark:bg-amber-950/10">
                                    <td className="p-3">
                                        <div className="font-medium">{p.user_name || `Employee #${p.user_id}`}</div>
                                        <div className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">{p.reason || 'Skipped'}</div>
                                    </td>
                                    <td className="p-3 text-right text-muted-foreground" colSpan={6}>—</td>
                                </tr>
                            ))}
                            {ready.map((p, i) => {
                                const adjNet = calcAdjustedNet(p);
                                const baseNet = Number(p.net_salary);
                                const safeBase = Number.isFinite(baseNet) ? baseNet : 0;
                                const changed = hasActiveAdjs && Math.abs(adjNet - safeBase) > 0.01;
                                const gross = Number(p.gross_salary);
                                const deductions = Number(p.total_deductions);
                                return (
                                    <tr key={p.id} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                                        <td className="p-3 font-medium">{p.user_name || `Employee #${p.user_id}`}</td>
                                        <td className="p-3 text-right text-muted-foreground">{p.working_days ?? '—'}</td>
                                        <td className="p-3 text-right text-muted-foreground">{p.present_days ?? '—'}</td>
                                        <td className="p-3 text-right text-muted-foreground">{p.absent_days ?? 0}</td>
                                        <td className="p-3 text-right text-muted-foreground">
                                            {(p.penalty_days ?? 0) > 0 ? (
                                                <span>
                                                    {p.penalty_days}d
                                                    {(p.suggested_shift_penalty ?? 0) > 0 && (
                                                        <span className="block text-xs text-amber-700 dark:text-amber-400">
                                                            sugg. {fmt(p.suggested_shift_penalty)}
                                                        </span>
                                                    )}
                                                </span>
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                        <td className="p-3 text-right">{fmt(Number.isFinite(gross) ? gross : null)}</td>
                                        <td className="p-3 text-right text-red-600">{fmt(Number.isFinite(deductions) ? deductions : null)}</td>
                                        <td className="p-3 text-right font-bold text-primary">
                                            {fmt(adjNet)}
                                            {changed && (
                                                <div className="text-xs font-normal text-muted-foreground line-through">
                                                    {fmt(safeBase)}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {ready.length === 0 && skipped.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="p-6 text-center text-muted-foreground">No preview data.</td>
                                </tr>
                            )}
                        </tbody>
                        {ready.length > 0 && (
                        <tfoot className="bg-muted/50 border-t">
                            <tr>
                                <td className="p-3 font-bold" colSpan={7}>Total Payroll</td>
                                <td className="p-3 text-right font-bold text-xl text-primary">{fmt(total)}</td>
                            </tr>
                        </tfoot>
                        )}
                    </table>
                </div>

                <div className="flex justify-between items-center pt-2 border-t gap-4">
                    <div className="flex items-center gap-4">
                        <Button variant="outline" onClick={onClose}>Cancel</Button>
                        {canManagePayroll && ready.length > 0 && (
                            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                                <Checkbox
                                    checked={sendEmails}
                                    onCheckedChange={(v) => setSendEmails(v === true)}
                                />
                                <span>Email payslip to employees after generate</span>
                            </label>
                        )}
                    </div>
                    <Button onClick={handleGenerate} disabled={generating || !canManagePayroll || ready.length === 0} size="lg">
                        {generating ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</>
                        ) : canManagePayroll ? (
                            ready.length > 0
                                ? <>Generate Payroll ({ready.length} employees)</>
                                : <>No employees ready</>
                        ) : (
                            <>Generate Payroll (permission required)</>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ─── Employee List Panel ───────────────────────────────────────────────────────
function EmployeeListPanel({
    employees,
    loading,
    checkedIds,
    adjustments,
    onToggle,
    onToggleAll,
    onOpenSalary,
    onDownloadPayslip,
    downloadingPayslipId,
}: {
    employees: Employee[];
    loading: boolean;
    checkedIds: Set<number>;
    adjustments: Record<number, Adjustment[]>;
    onToggle: (id: number) => void;
    onToggleAll: (checked: boolean) => void;
    onOpenSalary: (emp: Employee) => void;
    onDownloadPayslip: (payslipId: number) => void;
    downloadingPayslipId: number | null;
}) {
    const allChecked = employees.length > 0 && employees.every(e => checkedIds.has(e.id));
    const someUnchecked = employees.some(e => !checkedIds.has(e.id));

    const [uncheckedOpen, setUncheckedOpen] = useState(true);
    const [checkedOpen, setCheckedOpen] = useState(true);

    const unchecked = employees.filter(e => !checkedIds.has(e.id));
    const checked = employees.filter(e => checkedIds.has(e.id));

    const EmployeeRow = ({ emp }: { emp: Employee }) => {
        const adjList = adjustments[emp.id] ?? [];
        const additions = adjList.filter(a => a.type === 'addition').reduce((s, a) => s + a.amount, 0);
        const deductions = adjList.filter(a => a.type === 'deduction').reduce((s, a) => s + a.amount, 0);
        // Compute from gross so a zero-capped base net doesn't absorb adjustment amounts
        const ss = emp.salary_structure;
        const net = ss != null
            ? Math.max(0, (ss.gross_salary || 0) + additions - (ss.total_deductions || 0) - deductions)
            : null;

        return (
            <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/50 transition-colors border-b last:border-0">
                <Checkbox
                    id={`emp-${emp.id}`}
                    checked={checkedIds.has(emp.id)}
                    onCheckedChange={() => onToggle(emp.id)}
                />
                <button
                    className="flex-1 flex items-center gap-3 text-left min-w-0"
                    onClick={() => onOpenSalary(emp)}
                >
                    <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {emp.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{emp.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                            {emp.department_name || 'No Dept'}
                            {emp.has_salary_structure && (
                                <> · {emp.present_days}/{emp.working_days}d
                                {(emp.lop_days ?? emp.absent_days ?? 0) > 0 && (
                                    <> · {emp.lop_days ?? emp.absent_days} LOP</>
                                )}
                                {(emp.penalty_days ?? 0) > 0 && (
                                    <> · {emp.penalty_days} late/early</>
                                )}
                                </>
                            )}
                        </div>
                    </div>
                </button>
                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    {net != null ? (
                        <>
                            <div className="text-sm font-semibold text-primary">{fmt(net)}</div>
                            {adjList.length > 0 && (
                                <div className="text-xs text-muted-foreground">
                                    {adjList.length} adj
                                </div>
                            )}
                        </>
                    ) : (
                        <span className="text-xs text-muted-foreground">No structure</span>
                    )}
                    {emp.payslip_status === 'generated' && emp.payslip_id && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            disabled={downloadingPayslipId === emp.payslip_id}
                            onClick={(e) => {
                                e.stopPropagation();
                                onDownloadPayslip(emp.payslip_id!);
                            }}
                        >
                            <Download className="h-3 w-3" />
                            {downloadingPayslipId === emp.payslip_id ? '…' : 'PDF'}
                        </Button>
                    )}
                </div>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (employees.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2 py-16">
                <Users className="h-12 w-12 opacity-30" />
                <p>No employees found</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Check-all header */}
            <div className="flex items-center gap-3 px-3 py-2.5 border-b bg-muted/30 shrink-0">
                <Checkbox
                    id="check-all"
                    checked={allChecked}
                    onCheckedChange={(v) => onToggleAll(!!v)}
                />
                <Label htmlFor="check-all" className="text-sm font-medium cursor-pointer flex-1">
                    Select All ({employees.length})
                </Label>
                <span className="text-xs text-muted-foreground">
                    {checkedIds.size} selected
                </span>
            </div>

            <div className="flex-1 overflow-y-auto">
                {someUnchecked ? (
                    <>
                        {/* Unchecked section */}
                        {unchecked.length > 0 && (
                            <div>
                                <button
                                    onClick={() => setUncheckedOpen(!uncheckedOpen)}
                                    className="w-full flex items-center gap-2 px-3 py-2 bg-orange-50 dark:bg-orange-950/20 border-b text-sm font-medium text-orange-700 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-950/30 transition-colors"
                                >
                                    {uncheckedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                    Unchecked ({unchecked.length})
                                </button>
                                {uncheckedOpen && unchecked.map(emp => (
                                    <EmployeeRow key={emp.id} emp={emp} />
                                ))}
                            </div>
                        )}

                        {/* Checked section */}
                        {checked.length > 0 && (
                            <div>
                                <button
                                    onClick={() => setCheckedOpen(!checkedOpen)}
                                    className="w-full flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-950/20 border-b text-sm font-medium text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-950/30 transition-colors"
                                >
                                    {checkedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                    <Check className="h-4 w-4" />
                                    Selected ({checked.length})
                                </button>
                                {checkedOpen && checked.map(emp => (
                                    <EmployeeRow key={emp.id} emp={emp} />
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    employees.map(emp => <EmployeeRow key={emp.id} emp={emp} />)
                )}
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PayrollPage() {
    const { hasPermission } = usePermissions();
    const canManagePayroll = hasPermission('manage-payroll');
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [year, setYear] = useState(new Date().getFullYear());

    // Stats
    const [stats, setStats] = useState<any>(null);
    const [paidHolidays, setPaidHolidays] = useState(0);

    // Panel state
    const [filterMode, setFilterMode] = useState<FilterMode>('all');
    const [departments, setDepartments] = useState<Department[]>([]);
    const [centers, setCenters] = useState<Center[]>([]);
    const [selectedDept, setSelectedDept] = useState<Department | null>(null);
    const [selectedCenter, setSelectedCenter] = useState<Center | null>(null);

    // Employee data
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loadingEmployees, setLoadingEmployees] = useState(false);

    // Selection & adjustments
    const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
    const [adjustments, setAdjustments] = useState<Record<number, Adjustment[]>>({});
    const [advanceAllocations, setAdvanceAllocations] = useState<Record<number, AdvanceAllocation[]>>({});

    // Popups
    const [salaryEmployee, setSalaryEmployee] = useState<Employee | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [proceeding, setProceeding] = useState(false);
    const [downloadingPayslipId, setDownloadingPayslipId] = useState<number | null>(null);
    const [bulkDownloading, setBulkDownloading] = useState(false);
    const [bulkEmailing, setBulkEmailing] = useState(false);

    // Fetch stats
    const fetchStats = useCallback(async () => {
        try {
            const r = await axios.get('/admin/payroll/stats', { params: { month, year } });
            if (r.data.success) {
                setStats(r.data.data);
                setPaidHolidays(r.data.data.paid_holidays ?? 0);
            }
        } catch (e) { handleApiError(e); }
    }, [month, year]);

    // Fetch departments. Log — don't toast — because payroll page renders before
    // filters are chosen, and a startup 403 would surface as a distracting error.
    const fetchDepartments = useCallback(async (centerId?: string | number) => {
        try {
            const params = centerId ? { center_id: centerId } : undefined;
            const r = await axios.get('/admin/departments/list', { params });
            setDepartments(r.data?.data?.data ?? r.data?.data ?? []);
        } catch (e) {
            console.warn('[payroll] fetchDepartments failed', e);
            setDepartments([]);
        }
    }, []);

    // Fetch centers — same rationale as fetchDepartments.
    const fetchCenters = useCallback(async () => {
        try {
            const r = await axios.get('/admin/settings/centers');
            if (r.data.success) setCenters(r.data.data ?? []);
        } catch (e) {
            console.warn('[payroll] fetchCenters failed', e);
            setCenters([]);
        }
    }, []);

    // Fetch employees
    const fetchEmployees = useCallback(async () => {
        setLoadingEmployees(true);
        try {
            const params: any = { month, year };
            if (filterMode === 'departments' && selectedDept) params.department_id = selectedDept.id;
            if (filterMode === 'centers' && selectedCenter) params.center_id = selectedCenter.id;

            const r = await axios.get('/admin/payroll/employees', { params });
            if (r.data.success) {
                const emps: Employee[] = r.data.data;
                setEmployees(emps);
                // Auto-check all newly loaded employees
                setCheckedIds(new Set(emps.map((e) => e.id)));
            }
        } catch (e) { handleApiError(e); }
        finally { setLoadingEmployees(false); }
    }, [month, year, filterMode, selectedDept, selectedCenter]);

    useEffect(() => { fetchStats(); }, [fetchStats]);
    useEffect(() => { fetchDepartments(); fetchCenters(); }, []);

    useEffect(() => {
        if (filterMode === 'centers' && selectedCenter) {
            fetchDepartments(selectedCenter.id);
        } else {
            fetchDepartments();
        }
    }, [filterMode, selectedCenter, fetchDepartments]);

    // Load employees when filter / period changes
    useEffect(() => {
        if (filterMode === 'all') {
            fetchEmployees();
        } else if (filterMode === 'departments' && selectedDept) {
            fetchEmployees();
        } else if (filterMode === 'centers' && selectedCenter) {
            fetchEmployees();
        } else {
            setEmployees([]);
            setCheckedIds(new Set());
        }
    }, [filterMode, selectedDept, selectedCenter, month, year, fetchEmployees]);

    const handleFilterMode = (mode: FilterMode) => {
        setFilterMode(mode);
        setSelectedDept(null);
        setSelectedCenter(null);
        setEmployees([]);
        setCheckedIds(new Set());
    };

    const handleToggle = (id: number) => {
        setCheckedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleToggleAll = (checked: boolean) => {
        setCheckedIds(checked ? new Set(employees.map(e => e.id)) : new Set());
    };

    const handleSaveAdj = (empId: number, adjs: Adjustment[], advances: AdvanceAllocation[]) => {
        setAdjustments((prev) => ({ ...prev, [empId]: adjs }));
        setAdvanceAllocations((prev) => ({ ...prev, [empId]: advances }));
    };

    const generatedPayslipIds = employees
        .filter((e) => e.payslip_status === 'generated' && e.payslip_id)
        .map((e) => e.payslip_id!);

    const handleDownloadPayslip = async (payslipId: number) => {
        setDownloadingPayslipId(payslipId);
        try {
            await openPayslipPdf(payslipId);
        } catch (e) {
            handleApiError(e);
        } finally {
            setDownloadingPayslipId(null);
        }
    };

    const handleBulkDownload = async () => {
        setBulkDownloading(true);
        try {
            await downloadBulkPayslipsZip({
                month,
                year,
                payslipIds: generatedPayslipIds.length > 0 ? generatedPayslipIds : undefined,
            });
        } catch (e) {
            handleApiError(e);
        } finally {
            setBulkDownloading(false);
        }
    };

    const handleBulkEmail = async () => {
        setBulkEmailing(true);
        try {
            const res = await bulkSendPayslipEmails({
                month,
                year,
                payslipIds: generatedPayslipIds.length > 0 ? generatedPayslipIds : undefined,
            });
            handleApiResponse(res);
        } catch (e) {
            handleApiError(e);
        } finally {
            setBulkEmailing(false);
        }
    };

    const handleProceed = async () => {
        if (checkedIds.size === 0) return;
        setProceeding(true);
        try {
            const adjPayload: Record<number, Adjustment[]> = {};
            const advancePayload: Record<number, AdvanceAllocation[]> = {};
            checkedIds.forEach(id => {
                if (adjustments[id]?.length) adjPayload[id] = adjustments[id];
                if (advanceAllocations[id]?.length) advancePayload[id] = advanceAllocations[id];
            });

            const response = await axios.post('/admin/payroll/preview', {
                month,
                year,
                employee_ids: Array.from(checkedIds),
                adjustments: adjPayload,
                advance_allocations: advancePayload,
            });

            if (response.data.success) {
                setPreviewData(response.data.data);
                setShowPreview(true);
            }
        } catch (e) {
            handleApiError(e);
        } finally {
            setProceeding(false);
        }
    };

    const breadcrumbs = [{ label: 'Payroll' }];
    const showMiddlePanel = filterMode !== 'all';

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            

            <div className="flex flex-col h-[calc(100vh-4rem)] gap-4 p-4">

                {/* Hero Header */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#e8f2fd] via-[#d0e4f8] to-[#c4d8f0] dark:from-[#0d1e33] dark:via-[#0a1828] dark:to-[#071220] px-6 py-5 shadow-sm border border-white/60 dark:border-white/10 shrink-0">
                    {/* decorative blob */}
                    <div className="pointer-events-none absolute -top-10 -right-10 w-48 h-48 opacity-20">
                        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                            <path fill="#071b3a" d="M44.7,-76.4C58.4,-69.7,70.3,-58.6,77.9,-44.9C85.5,-31.2,88.7,-15.6,87.4,-0.8C86,14,80,28,72.1,40.5C64.2,53,54.2,64,42.1,71.3C30,78.6,15,82.3,0.1,82.1C-14.8,81.9,-29.6,77.8,-42.7,70.5C-55.8,63.2,-67.3,52.7,-74.5,39.5C-81.7,26.3,-84.7,10.5,-83.1,-4.9C-81.6,-20.3,-75.5,-35.2,-66.3,-47.4C-57.1,-59.6,-44.8,-69.1,-31.6,-76.1C-18.4,-83.1,-4.6,-87.6,8.2,-86.2C21,-84.8,31,-83.1,44.7,-76.4Z" transform="translate(100 100)" />
                        </svg>
                    </div>
                    <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#071b3a]/15 dark:bg-white/10 border border-[#071b3a]/20 dark:border-white/10 shadow-inner">
                                <Banknote className="h-6 w-6 text-[#071b3a] dark:text-blue-300" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight text-[#001f3f] dark:text-white">
                                    Payroll
                                </h1>
                                <p className="text-sm text-[#1e3a5f]/60 dark:text-blue-200/60 mt-0.5">
                                    Manage and generate employee payroll
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <Button asChild variant="outline" className="bg-white/60 border-white/60 z-10">
                                <Link to="/admin/payroll/advanced">Advanced payroll</Link>
                            </Button>
                            {canManagePayroll && (stats?.total ?? 0) > 0 && (
                                <Button
                                    variant="outline"
                                    className="bg-white/60 border-white/60 z-10"
                                    disabled={bulkEmailing}
                                    onClick={() => void handleBulkEmail()}
                                >
                                    <Mail className="h-4 w-4 mr-2" />
                                    {bulkEmailing ? 'Sending emails…' : `Email All Payslips (${stats?.total ?? 0})`}
                                </Button>
                            )}
                            {canManagePayroll && (stats?.total ?? 0) > 0 && (
                                <Button
                                    variant="outline"
                                    className="bg-white/60 border-white/60 z-10"
                                    disabled={bulkDownloading}
                                    onClick={() => void handleBulkDownload()}
                                >
                                    <Download className="h-4 w-4 mr-2" />
                                    {bulkDownloading ? 'Preparing ZIP…' : `Download All PDFs (${stats?.total ?? 0})`}
                                </Button>
                            )}
                            <Select value={month.toString()} onValueChange={v => setMonth(parseInt(v))}>
                                <SelectTrigger className="w-36 bg-white/50 border-white/60 hover:bg-white/80 dark:bg-black/20 dark:border-white/10 dark:hover:bg-black/40 text-[#001f3f] dark:text-white backdrop-blur-sm z-10 transition-colors">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {monthNames.map((m, i) => (
                                        <SelectItem key={i + 1} value={(i + 1).toString()}>{m}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={year.toString()} onValueChange={v => setYear(parseInt(v))}>
                                <SelectTrigger className="w-24 bg-white/50 border-white/60 hover:bg-white/80 dark:bg-black/20 dark:border-white/10 dark:hover:bg-black/40 text-[#001f3f] dark:text-white backdrop-blur-sm z-10 transition-colors">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                                        <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-4 gap-3 shrink-0">
                    {[
                        {
                            label: 'Total Employees', icon: Users,
                            value: stats?.total_employees ?? '—',
                            color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30'
                        },
                        {
                            label: 'Approved Leaves', icon: CalendarCheck,
                            value: stats?.approved_leaves ?? '—',
                            color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30'
                        },
                        {
                            label: 'Total Present Days', icon: Calendar,
                            value: stats?.present_days_total ?? '—',
                            color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950/30'
                        },
                        {
                            label: `Paid Holidays (${monthNames[month - 1]})`, icon: Star,
                            value: paidHolidays,
                            color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950/30'
                        },
                    ].map(({ label, icon: Icon, value, color, bg }) => (
                        <Card key={label} className="border-0 shadow-sm">
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className={`h-12 w-12 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                                    <Icon className={`h-6 w-6 ${color}`} />
                                </div>
                                <div>
                                    <div className="text-2xl font-bold">{value}</div>
                                    <div className="text-xs text-muted-foreground">{label}</div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* 3-Panel Area */}
                <div className="flex gap-3 flex-1 min-h-0">

                    {/* Panel 1: Filter */}
                    <div className="w-44 shrink-0 border rounded-xl bg-card overflow-hidden flex flex-col">
                        <div className="p-3 border-b bg-muted/30">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filter By</h3>
                        </div>
                        <div className="flex flex-col p-2 gap-1 flex-1">
                            {([
                                { mode: 'all', icon: LayoutGrid, label: 'All Employees' },
                                { mode: 'departments', icon: Building2, label: 'Departments' },
                                { mode: 'centers', icon: MapPin, label: 'Branches' },
                            ] as const).map(({ mode, icon: Icon, label }) => (
                                <button
                                    key={mode}
                                    onClick={() => handleFilterMode(mode)}
                                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                                        filterMode === mode
                                            ? 'bg-primary text-primary-foreground shadow-sm'
                                            : 'hover:bg-accent text-foreground'
                                    }`}
                                >
                                    <Icon className="h-4 w-4 shrink-0" />
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Panel 2: Dept/Center List (conditional) */}
                    {showMiddlePanel && (
                        <div className="w-52 shrink-0 border rounded-xl bg-card overflow-hidden flex flex-col">
                            <div className="p-3 border-b bg-muted/30">
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    {filterMode === 'departments' ? 'Departments' : 'Branches'}
                                </h3>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                {filterMode === 'departments' && departments.map(dept => (
                                    <button
                                        key={dept.id}
                                        onClick={() => setSelectedDept(dept)}
                                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-left transition-all ${
                                            selectedDept?.id === dept.id
                                                ? 'bg-primary text-primary-foreground shadow-sm'
                                                : 'hover:bg-accent text-foreground'
                                        }`}
                                    >
                                        <Building2 className="h-4 w-4 shrink-0 opacity-70" />
                                        <span className="truncate">{dept.name}</span>
                                    </button>
                                ))}
                                {filterMode === 'centers' && centers.map(center => (
                                    <button
                                        key={center.id}
                                        onClick={() => setSelectedCenter(center)}
                                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-left transition-all ${
                                            selectedCenter?.id === center.id
                                                ? 'bg-primary text-primary-foreground shadow-sm'
                                                : 'hover:bg-accent text-foreground'
                                        }`}
                                    >
                                        <MapPin className="h-4 w-4 shrink-0 opacity-70" />
                                        <div className="min-w-0">
                                            <div className="truncate font-medium">{center.name}</div>
                                            {center.city && <div className="text-xs opacity-70">{center.city}</div>}
                                        </div>
                                    </button>
                                ))}
                                {filterMode === 'departments' && departments.length === 0 && (
                                    <p className="text-sm text-muted-foreground text-center py-4">No departments</p>
                                )}
                                {filterMode === 'centers' && centers.length === 0 && (
                                    <p className="text-sm text-muted-foreground text-center py-4">No branches</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Panel 3: Employee List */}
                    <div className="flex-1 border rounded-xl bg-card overflow-hidden flex flex-col min-w-0">
                        <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {filterMode === 'all'
                                    ? 'All Employees'
                                    : filterMode === 'departments'
                                    ? selectedDept ? `${selectedDept.name} — Employees` : 'Select a department'
                                    : selectedCenter ? `${selectedCenter.name} — Employees` : 'Select a center'}
                            </h3>
                            {employees.length > 0 && (
                                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                                    {employees.length} employees
                                </span>
                            )}
                        </div>

                        {/* Show placeholder when filter mode requires a selection */}
                        {((filterMode === 'departments' && !selectedDept) ||
                          (filterMode === 'centers' && !selectedCenter)) ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2 py-16">
                                {filterMode === 'departments'
                                    ? <Building2 className="h-12 w-12 opacity-30" />
                                    : <MapPin className="h-12 w-12 opacity-30" />}
                                <p>Select a {filterMode === 'departments' ? 'department' : 'center'} to view employees</p>
                            </div>
                        ) : (
                            <div className="flex-1 overflow-hidden flex flex-col">
                                <EmployeeListPanel
                                    employees={employees}
                                    loading={loadingEmployees}
                                    checkedIds={checkedIds}
                                    adjustments={adjustments}
                                    onToggle={handleToggle}
                                    onToggleAll={handleToggleAll}
                            onOpenSalary={setSalaryEmployee}
                            onDownloadPayslip={(id) => void handleDownloadPayslip(id)}
                            downloadingPayslipId={downloadingPayslipId}
                        />
                            </div>
                        )}
                    </div>
                </div>

                {/* Proceed Button */}
                <div className="shrink-0 flex justify-end items-center gap-4 border-t pt-3">
                    {checkedIds.size > 0 && (
                        <span className="text-sm text-muted-foreground">
                            {checkedIds.size} employee(s) selected
                        </span>
                    )}
                    {canManagePayroll ? (
                        <Button
                            size="lg"
                            disabled={checkedIds.size === 0 || proceeding}
                            onClick={handleProceed}
                            className="px-8"
                        >
                            {proceeding
                                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</>
                                : `Proceed to Preview (${checkedIds.size})`
                            }
                        </Button>
                    ) : (
                        <span className="text-sm text-muted-foreground">
                            You need manage-payroll permission to generate payroll.
                        </span>
                    )}
                </div>
            </div>

            {/* Salary Popup */}
            {salaryEmployee && (
                <SalaryPopup
                    employee={salaryEmployee}
                    adjustments={adjustments[salaryEmployee.id] ?? []}
                    advanceAllocations={advanceAllocations[salaryEmployee.id] ?? []}
                    onSave={(adjs, advances) => handleSaveAdj(salaryEmployee.id, adjs, advances)}
                    onClose={() => setSalaryEmployee(null)}
                />
            )}

            {/* Preview Popup */}
            {showPreview && (
                <PreviewPopup
                    previews={previewData}
                    month={month}
                    year={year}
                    canManagePayroll={canManagePayroll}
                    onGenerate={() => {
                        setCheckedIds(new Set());
                        setAdjustments({});
                        setAdvanceAllocations({});
                        setEmployees([]);
                        fetchStats();
                        fetchEmployees();
                    }}
                    onClose={() => setShowPreview(false)}
                />
            )}
        </AppLayout>
    );
}
