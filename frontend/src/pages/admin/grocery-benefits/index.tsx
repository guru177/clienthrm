import { useEffect, useState } from 'react';
import {
    Check, Edit3, Plus, RefreshCw, Search, ShoppingCart, Trash2, X, UserPlus, Eye,
} from 'lucide-react';
import axios from '@/lib/axios';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
    Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { handleApiError, handleApiResponse } from '@/lib/toast';
import { useConfirm } from '@/lib/confirm';

interface GroceryBenefit {
    id: number;
    organization_id: number;
    user_id: number;
    start_date: string;
    subsidy_percentage: number;
    monthly_allowance: number;
    status: string;
    created_at: string;
    updated_at: string;
    user_name?: string;
}

interface GroceryClaim {
    id: number;
    organization_id: number;
    user_id: number;
    benefit_id: number;
    claim_month: number;
    claim_year: number;
    amount: number;
    company_share: number;
    employee_share: number;
    is_free_month: number;
    description?: string;
    receipt_url?: string;
    status: string;
    reviewed_by?: number;
    reviewed_at?: string;
    review_notes?: string;
    created_at: string;
    updated_at: string;
    user_name?: string;
    reviewer_name?: string;
}

interface Employee {
    id: number;
    name: string;
    email: string;
    date_of_joining?: string;
}

interface BenefitForm {
    user_id: number | '';
    start_date: string;
    subsidy_percentage: number;
    monthly_allowance: number;
}

interface EditForm {
    id: number;
    subsidy_percentage: number;
    monthly_allowance: number;
    status: string;
}

interface ReviewForm {
    id: number;
    status: string;
    review_notes: string;
}

export default function GroceryBenefitsPage() {
    const confirm = useConfirm();
    const [benefits, setBenefits] = useState<GroceryBenefit[]>([]);
    const [claims, setClaims] = useState<GroceryClaim[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [claimsLoading, setClaimsLoading] = useState(true);
    const [tab, setTab] = useState('benefits');
    const [statusFilter, setStatusFilter] = useState('all');
    const [claimStatusFilter, setClaimStatusFilter] = useState('all');

    // Dialogs
    const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    const [enrollForm, setEnrollForm] = useState<BenefitForm>({
        user_id: '', start_date: '', subsidy_percentage: 50, monthly_allowance: 5000,
    });
    const [editForm, setEditForm] = useState<EditForm>({
        id: 0, subsidy_percentage: 50, monthly_allowance: 5000, status: 'active',
    });
    const [reviewForm, setReviewForm] = useState<ReviewForm>({
        id: 0, status: 'approved', review_notes: '',
    });

    useEffect(() => {
        document.title = 'Grocery Benefits | Admin';
        fetchBenefits();
        fetchClaims();
        fetchEmployees();
    }, []);

    const fetchBenefits = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/admin/grocery-benefits');
            if (res.data.success) setBenefits(res.data.data || []);
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const fetchClaims = async () => {
        setClaimsLoading(true);
        try {
            const res = await axios.get('/admin/grocery-claims');
            if (res.data.success) setClaims(res.data.data || []);
        } catch (error) {
            handleApiError(error);
        } finally {
            setClaimsLoading(false);
        }
    };

    const fetchEmployees = async () => {
        try {
            const res = await axios.get('/admin/users/list', { params: { per_page: 500 } });
            if (res.data.success) {
                const data = res.data.data;
                setEmployees(Array.isArray(data) ? data : data?.data || []);
            }
        } catch { /* ignore */ }
    };

    const handleEnroll = async () => {
        if (!enrollForm.user_id || !enrollForm.start_date) return;
        setSaving(true);
        try {
            const res = await axios.post('/admin/grocery-benefits', {
                user_id: enrollForm.user_id,
                start_date: enrollForm.start_date,
                subsidy_percentage: enrollForm.subsidy_percentage,
                monthly_allowance: enrollForm.monthly_allowance,
            });
            handleApiResponse(res);
            setEnrollDialogOpen(false);
            fetchBenefits();
        } catch (error) {
            handleApiError(error);
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = async () => {
        setSaving(true);
        try {
            const res = await axios.put(`/admin/grocery-benefits/${editForm.id}`, {
                subsidy_percentage: editForm.subsidy_percentage,
                monthly_allowance: editForm.monthly_allowance,
                status: editForm.status,
            });
            handleApiResponse(res);
            setEditDialogOpen(false);
            fetchBenefits();
        } catch (error) {
            handleApiError(error);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!(await confirm({ title: 'Remove Grocery Benefit', description: 'Remove this employee from grocery benefits?' }))) return;
        try {
            const res = await axios.delete(`/admin/grocery-benefits/${id}`);
            handleApiResponse(res);
            fetchBenefits();
        } catch (error) {
            handleApiError(error);
        }
    };

    const handleReview = async () => {
        setSaving(true);
        try {
            const res = await axios.post(`/admin/grocery-claims/${reviewForm.id}/review`, {
                status: reviewForm.status,
                review_notes: reviewForm.review_notes || undefined,
            });
            handleApiResponse(res);
            setReviewDialogOpen(false);
            fetchClaims();
        } catch (error) {
            handleApiError(error);
        } finally {
            setSaving(false);
        }
    };

    const openEdit = (b: GroceryBenefit) => {
        setEditForm({
            id: b.id,
            subsidy_percentage: b.subsidy_percentage,
            monthly_allowance: b.monthly_allowance,
            status: b.status,
        });
        setEditDialogOpen(true);
    };

    const openReview = (c: GroceryClaim) => {
        setReviewForm({ id: c.id, status: 'approved', review_notes: '' });
        setReviewDialogOpen(true);
    };

    // Stats
    const totalEnrolled = benefits.length;
    const activeBenefits = benefits.filter(b => b.status === 'active').length;
    const pendingClaims = claims.filter(c => c.status === 'pending').length;
    const totalCompanyShare = claims
        .filter(c => c.status === 'approved')
        .reduce((sum, c) => sum + c.company_share, 0);

    const filteredBenefits = statusFilter === 'all'
        ? benefits
        : benefits.filter(b => b.status === statusFilter);
    const filteredClaims = claimStatusFilter === 'all'
        ? claims
        : claims.filter(c => c.status === claimStatusFilter);

    const statusBadgeVariant = (status: string) => {
        switch (status) {
            case 'active': case 'approved': return 'default';
            case 'pending': return 'secondary';
            case 'inactive': case 'rejected': return 'destructive';
            default: return 'outline';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <ShoppingCart className="h-6 w-6" />
                        Grocery Benefits
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Manage employee grocery benefit enrollments and review claims
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => { fetchBenefits(); fetchClaims(); }}>
                        <RefreshCw className="h-4 w-4 mr-1" /> Refresh
                    </Button>
                    <Button size="sm" onClick={() => {
                        setEnrollForm({ user_id: '', start_date: '', subsidy_percentage: 50, monthly_allowance: 5000 });
                        setEnrollDialogOpen(true);
                    }}>
                        <UserPlus className="h-4 w-4 mr-1" /> Enroll Employee
                    </Button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Enrolled</CardTitle>
                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent><div className="text-2xl font-bold">{totalEnrolled}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Benefits</CardTitle>
                        <Check className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent><div className="text-2xl font-bold text-green-600">{activeBenefits}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pending Claims</CardTitle>
                        <Eye className="h-4 w-4 text-yellow-500" />
                    </CardHeader>
                    <CardContent><div className="text-2xl font-bold text-yellow-600">{pendingClaims}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Company Spend</CardTitle>
                        <ShoppingCart className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent><div className="text-2xl font-bold text-blue-600">₹{totalCompanyShare.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div></CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                    <TabsTrigger value="benefits">Benefits ({benefits.length})</TabsTrigger>
                    <TabsTrigger value="claims">
                        Claims ({claims.length})
                        {pendingClaims > 0 && (
                            <Badge variant="destructive" className="ml-2 text-xs px-1.5">{pendingClaims}</Badge>
                        )}
                    </TabsTrigger>
                </TabsList>

                {/* Benefits Tab */}
                <TabsContent value="benefits">
                    <Card>
                        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <CardTitle>Enrolled Employees</CardTitle>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="inactive">Inactive</SelectItem>
                                </SelectContent>
                            </Select>
                        </CardHeader>
                        <CardContent className="min-w-0">
                            <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Employee</TableHead>
                                        <TableHead>Start Date</TableHead>
                                        <TableHead>Subsidy %</TableHead>
                                        <TableHead>Monthly Allowance</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                                    ) : filteredBenefits.length === 0 ? (
                                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No employees enrolled yet</TableCell></TableRow>
                                    ) : filteredBenefits.map(b => (
                                        <TableRow key={b.id}>
                                            <TableCell className="font-medium">{b.user_name || `User #${b.user_id}`}</TableCell>
                                            <TableCell>{b.start_date}</TableCell>
                                            <TableCell>
                                                <span className="font-semibold">{b.subsidy_percentage}%</span>
                                                <span className="text-xs text-muted-foreground ml-1">(after free month)</span>
                                            </TableCell>
                                            <TableCell>₹{b.monthly_allowance.toLocaleString('en-IN')}</TableCell>
                                            <TableCell><Badge variant={statusBadgeVariant(b.status)}>{b.status}</Badge></TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1">
                                                    <Button variant="ghost" size="icon" onClick={() => openEdit(b)} title="Edit">
                                                        <Edit3 className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(b.id)} title="Remove">
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Claims Tab */}
                <TabsContent value="claims">
                    <Card>
                        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <CardTitle>Grocery Claims</CardTitle>
                            <Select value={claimStatusFilter} onValueChange={setClaimStatusFilter}>
                                <SelectTrigger className="w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="approved">Approved</SelectItem>
                                    <SelectItem value="rejected">Rejected</SelectItem>
                                </SelectContent>
                            </Select>
                        </CardHeader>
                        <CardContent className="min-w-0">
                            <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Employee</TableHead>
                                        <TableHead>Period</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead>Company Share</TableHead>
                                        <TableHead>Employee Share</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {claimsLoading ? (
                                        <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                                    ) : filteredClaims.length === 0 ? (
                                        <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No claims found</TableCell></TableRow>
                                    ) : filteredClaims.map(c => (
                                        <TableRow key={c.id}>
                                            <TableCell className="font-medium">{c.user_name || `User #${c.user_id}`}</TableCell>
                                            <TableCell>{`${String(c.claim_month).padStart(2, '0')}/${c.claim_year}`}</TableCell>
                                            <TableCell>₹{c.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-green-600 font-medium">₹{c.company_share.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell>₹{c.employee_share.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell>
                                                {c.is_free_month ? (
                                                    <Badge variant="default" className="bg-emerald-500">Free Month</Badge>
                                                ) : (
                                                    <Badge variant="outline">Subsidized</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell><Badge variant={statusBadgeVariant(c.status)}>{c.status}</Badge></TableCell>
                                            <TableCell className="text-right">
                                                {c.status === 'pending' && (
                                                    <Button variant="outline" size="sm" onClick={() => openReview(c)}>
                                                        Review
                                                    </Button>
                                                )}
                                                {c.status !== 'pending' && c.reviewer_name && (
                                                    <span className="text-xs text-muted-foreground">by {c.reviewer_name}</span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Enroll Dialog */}
            <Dialog open={enrollDialogOpen} onOpenChange={setEnrollDialogOpen}>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <UserPlus className="h-5 w-5" /> Enroll Employee in Grocery Benefit
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label>Employee</Label>
                            <Select
                                value={String(enrollForm.user_id)}
                                onValueChange={v => {
                                    const emp = employees.find(e => e.id === Number(v));
                                    setEnrollForm(f => ({
                                        ...f,
                                        user_id: Number(v),
                                        start_date: emp?.date_of_joining || f.start_date,
                                    }));
                                }}
                            >
                                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                                <SelectContent>
                                    {employees.map(e => (
                                        <SelectItem key={e.id} value={String(e.id)}>{e.name} ({e.email})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label>Start Date (Free month starts from this date)</Label>
                            <Input
                                type="date"
                                value={enrollForm.start_date}
                                onChange={e => setEnrollForm(f => ({ ...f, start_date: e.target.value }))}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label>Subsidy % (after free month)</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={enrollForm.subsidy_percentage}
                                    onChange={e => setEnrollForm(f => ({ ...f, subsidy_percentage: Number(e.target.value) }))}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label>Monthly Allowance (₹)</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    value={enrollForm.monthly_allowance}
                                    onChange={e => setEnrollForm(f => ({ ...f, monthly_allowance: Number(e.target.value) }))}
                                />
                            </div>
                        </div>
                        <div className="rounded-lg bg-muted p-3 text-sm">
                            <p className="font-medium mb-1">How it works:</p>
                            <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                                <li><strong>Month 1</strong>: Employee gets groceries <strong>100% free</strong> (company pays full amount)</li>
                                <li><strong>Month 2 onwards</strong>: Company pays <strong>{enrollForm.subsidy_percentage}%</strong>, employee pays <strong>{100 - enrollForm.subsidy_percentage}%</strong></li>
                                <li>Maximum monthly claim: <strong>₹{enrollForm.monthly_allowance.toLocaleString('en-IN')}</strong></li>
                            </ul>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEnrollDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleEnroll} disabled={saving || !enrollForm.user_id || !enrollForm.start_date}>
                            {saving ? 'Enrolling...' : 'Enroll Employee'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle>Edit Grocery Benefit</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label>Subsidy % (after free month)</Label>
                            <Input
                                type="number"
                                min={0}
                                max={100}
                                value={editForm.subsidy_percentage}
                                onChange={e => setEditForm(f => ({ ...f, subsidy_percentage: Number(e.target.value) }))}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>Monthly Allowance (₹)</Label>
                            <Input
                                type="number"
                                min={0}
                                value={editForm.monthly_allowance}
                                onChange={e => setEditForm(f => ({ ...f, monthly_allowance: Number(e.target.value) }))}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>Status</Label>
                            <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="inactive">Inactive</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleEdit} disabled={saving}>
                            {saving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Review Dialog */}
            <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle>Review Grocery Claim</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label>Decision</Label>
                            <Select value={reviewForm.status} onValueChange={v => setReviewForm(f => ({ ...f, status: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="approved">✅ Approve</SelectItem>
                                    <SelectItem value="rejected">❌ Reject</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label>Notes (optional)</Label>
                            <Textarea
                                value={reviewForm.review_notes}
                                onChange={e => setReviewForm(f => ({ ...f, review_notes: e.target.value }))}
                                placeholder="Add review notes..."
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>Cancel</Button>
                        <Button
                            onClick={handleReview}
                            disabled={saving}
                            variant={reviewForm.status === 'rejected' ? 'destructive' : 'default'}
                        >
                            {saving ? 'Submitting...' : reviewForm.status === 'approved' ? 'Approve Claim' : 'Reject Claim'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
