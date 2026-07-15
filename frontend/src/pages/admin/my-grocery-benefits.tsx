import { useEffect, useState } from 'react';
import {
    Check, Gift, ShoppingCart, Send, Clock,
} from 'lucide-react';
import axios from '@/lib/axios';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { handleApiError, handleApiResponse } from '@/lib/toast';

interface BenefitStatus {
    benefit: {
        id: number;
        start_date: string;
        subsidy_percentage: number;
        monthly_allowance: number;
        status: string;
    } | null;
    is_free_month: boolean;
    effective_subsidy_percentage: number;
    used_this_month: number;
    remaining_allowance: number;
    current_month: number;
    current_year: number;
    claims: Array<{
        id: number;
        claim_month: number;
        claim_year: number;
        amount: number;
        company_share: number;
        employee_share: number;
        is_free_month: number;
        description?: string;
        status: string;
        review_notes?: string;
        reviewer_name?: string;
        created_at: string;
    }>;
}

export default function MyGroceryBenefitsPage() {
    const [data, setData] = useState<BenefitStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [claimDialogOpen, setClaimDialogOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [claimAmount, setClaimAmount] = useState('');
    const [claimDescription, setClaimDescription] = useState('');

    useEffect(() => {
        document.title = 'My Grocery Benefits';
        fetchStatus();
    }, []);

    const fetchStatus = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/admin/grocery-benefits/my-status');
            if (res.data.success) setData(res.data.data);
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const handleClaim = async () => {
        const amount = parseFloat(claimAmount);
        if (!amount || amount <= 0) return;
        setSaving(true);
        try {
            const res = await axios.post('/admin/grocery-claims', {
                amount,
                description: claimDescription || undefined,
            });
            handleApiResponse(res.data);
            setClaimDialogOpen(false);
            setClaimAmount('');
            setClaimDescription('');
            fetchStatus();
        } catch (error) {
            handleApiError(error);
        } finally {
            setSaving(false);
        }
    };

    const statusBadgeVariant = (status: string) => {
        switch (status) {
            case 'approved': return 'default' as const;
            case 'pending': return 'secondary' as const;
            case 'rejected': return 'destructive' as const;
            default: return 'outline' as const;
        }
    };

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        );
    }

    if (!data?.benefit) {
        return (
            <div className="space-y-6">
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <ShoppingCart className="h-6 w-6" />
                    My Grocery Benefits
                </h1>
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <ShoppingCart className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold">No Grocery Benefit Enrolled</h3>
                        <p className="text-muted-foreground mt-1">
                            You are not currently enrolled in the grocery benefit program.<br />
                            Please contact HR to get enrolled.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <ShoppingCart className="h-6 w-6" />
                        My Grocery Benefits
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        View your grocery benefit status and submit claims
                    </p>
                </div>
                <Button onClick={() => setClaimDialogOpen(true)} disabled={!data.benefit}>
                    <Send className="h-4 w-4 mr-1" /> Submit Claim
                </Button>
            </div>

            {/* Status Banner */}
            {data.is_free_month ? (
                <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800">
                    <CardContent className="flex items-center gap-4 py-5">
                        <div className="rounded-full bg-emerald-100 dark:bg-emerald-900 p-3">
                            <Gift className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-emerald-800 dark:text-emerald-300 text-lg">
                                🎉 100% Free Groceries This Month!
                            </h3>
                            <p className="text-emerald-600 dark:text-emerald-400 text-sm">
                                Welcome! As a new employee, your groceries are fully covered by the company this month.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
                    <CardContent className="flex items-center gap-4 py-5">
                        <div className="rounded-full bg-blue-100 dark:bg-blue-900 p-3">
                            <ShoppingCart className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-blue-800 dark:text-blue-300 text-lg">
                                {data.effective_subsidy_percentage}% Grocery Subsidy Active
                            </h3>
                            <p className="text-blue-600 dark:text-blue-400 text-sm">
                                The company covers {data.effective_subsidy_percentage}% of your grocery expenses. You pay the remaining {100 - data.effective_subsidy_percentage}%.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Allowance Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Allowance</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">₹{data.benefit.monthly_allowance.toLocaleString('en-IN')}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Used This Month</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-600">₹{data.used_this_month.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Remaining</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">₹{data.remaining_allowance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                        <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                                className="h-full bg-green-500 rounded-full transition-all"
                                style={{ width: `${Math.min(100, (data.remaining_allowance / data.benefit.monthly_allowance) * 100)}%` }}
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Claims History */}
            <Card>
                <CardHeader>
                    <CardTitle>Claims History</CardTitle>
                    <CardDescription>Your past grocery benefit claims and their status</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Period</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Company Pays</TableHead>
                                <TableHead>You Pay</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Description</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.claims.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                        No claims submitted yet. Click "Submit Claim" to get started.
                                    </TableCell>
                                </TableRow>
                            ) : data.claims.map(c => (
                                <TableRow key={c.id}>
                                    <TableCell>{monthNames[c.claim_month - 1]} {c.claim_year}</TableCell>
                                    <TableCell className="font-medium">₹{c.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell className="text-green-600">₹{c.company_share.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell>₹{c.employee_share.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell>
                                        {c.is_free_month ? (
                                            <Badge variant="default" className="bg-emerald-500">Free</Badge>
                                        ) : (
                                            <Badge variant="outline">Subsidized</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={statusBadgeVariant(c.status)}>{c.status}</Badge>
                                        {c.review_notes && (
                                            <p className="text-xs text-muted-foreground mt-1">{c.review_notes}</p>
                                        )}
                                    </TableCell>
                                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                                        {c.description || '—'}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Submit Claim Dialog */}
            <Dialog open={claimDialogOpen} onOpenChange={setClaimDialogOpen}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Send className="h-5 w-5" /> Submit Grocery Claim
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label>Grocery Bill Amount (₹)</Label>
                            <Input
                                type="number"
                                min={0}
                                step={0.01}
                                value={claimAmount}
                                onChange={e => setClaimAmount(e.target.value)}
                                placeholder="Enter amount"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>Description (optional)</Label>
                            <Textarea
                                value={claimDescription}
                                onChange={e => setClaimDescription(e.target.value)}
                                placeholder="e.g., Weekly grocery purchase from Big Bazaar"
                            />
                        </div>
                        {claimAmount && parseFloat(claimAmount) > 0 && (
                            <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
                                <div className="flex justify-between">
                                    <span>Total Amount:</span>
                                    <span className="font-medium">₹{parseFloat(claimAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between text-green-600">
                                    <span>Company Pays ({data.effective_subsidy_percentage}%):</span>
                                    <span className="font-medium">₹{(parseFloat(claimAmount) * data.effective_subsidy_percentage / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>You Pay ({100 - data.effective_subsidy_percentage}%):</span>
                                    <span className="font-medium">₹{(parseFloat(claimAmount) * (100 - data.effective_subsidy_percentage) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <hr className="my-1 border-border" />
                                <div className="flex justify-between text-muted-foreground text-xs">
                                    <span>Remaining after this claim:</span>
                                    <span>₹{Math.max(0, data.remaining_allowance - parseFloat(claimAmount)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setClaimDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleClaim} disabled={saving || !claimAmount || parseFloat(claimAmount) <= 0}>
                            {saving ? 'Submitting...' : 'Submit Claim'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
