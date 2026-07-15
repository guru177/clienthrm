import { useEffect, useState } from 'react';
import axios from '@/lib/axios';
import { handleApiError, handleApiResponse } from '@/lib/toast';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, PenSquare, ArrowLeftRight, Check, X, Trash2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useConfirm } from '@/lib/confirm';

export default function AssetsAdminPage() {
    const [assets, setAssets] = useState<any[]>([]);
    const [allocations, setAllocations] = useState<any[]>([]);
    const [expenses, setExpenses] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const confirm = useConfirm();
    
    // Dialog states
    const [addAssetOpen, setAddAssetOpen] = useState(false);
    const [allocateOpen, setAllocateOpen] = useState(false);
    
    // Forms
    const [assetForm, setAssetForm] = useState({ name: '', asset_type: '', identifier: '', purchase_cost: '' });
    const [allocateForm, setAllocateForm] = useState({ asset_id: '', user_id: '', allocation_condition: '' });
    const [saving, setSaving] = useState(false);
    const [editingAssetId, setEditingAssetId] = useState<number | null>(null);

    useEffect(() => {
        fetchData();
        fetchUsers();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [aRes, alRes, eRes] = await Promise.all([
                axios.get('/admin/assets'),
                axios.get('/admin/asset-allocations'),
                axios.get('/admin/asset-expenses')
            ]);
            setAssets(aRes.data?.data || []);
            setAllocations(alRes.data?.data || []);
            setExpenses(eRes.data?.data || []);
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const fetchUsers = async () => {
        try {
            const res = await axios.get('/admin/users/list', { params: { per_page: 500 } });
            const data = res.data?.data;
            setUsers(Array.isArray(data) ? data : data?.data || []);
        } catch (error) {
            console.error('Failed to fetch users', error);
        }
    };

    const openAddModal = () => {
        setEditingAssetId(null);
        setAssetForm({ name: '', asset_type: 'Vehicle', identifier: '', purchase_cost: '' });
        setAddAssetOpen(true);
    };

    const handleEditAsset = (asset: any) => {
        setEditingAssetId(asset.id);
        setAssetForm({
            name: asset.name,
            asset_type: asset.asset_type,
            identifier: asset.identifier || '',
            purchase_cost: asset.purchase_cost ? asset.purchase_cost.toString() : ''
        });
        setAddAssetOpen(true);
    };

    const handleDeleteAsset = async (id: number) => {
        if (!(await confirm({ title: 'Delete Asset', description: 'Are you sure you want to delete this asset?' }))) return;
        try {
            const res = await axios.delete(`/admin/assets/${id}`);
            handleApiResponse(res.data);
            fetchData();
        } catch (error) {
            handleApiError(error);
        }
    };

    const handleAddAsset = async () => {
        setSaving(true);
        try {
            const payload = {
                ...assetForm,
                purchase_cost: assetForm.purchase_cost ? parseFloat(assetForm.purchase_cost) : undefined
            };
            let res;
            if (editingAssetId) {
                res = await axios.put(`/admin/assets/${editingAssetId}`, payload);
            } else {
                res = await axios.post('/admin/assets', payload);
            }
            handleApiResponse(res.data);
            setAddAssetOpen(false);
            setAssetForm({ name: '', asset_type: 'Vehicle', identifier: '', purchase_cost: '' });
            setEditingAssetId(null);
            fetchData();
        } catch (error) {
            handleApiError(error);
        } finally {
            setSaving(false);
        }
    };

    const handleAllocate = async () => {
        setSaving(true);
        try {
            const res = await axios.post('/admin/asset-allocations', {
                asset_id: parseInt(allocateForm.asset_id),
                user_id: parseInt(allocateForm.user_id),
                allocated_date: new Date().toISOString().split('T')[0],
                allocation_condition: allocateForm.allocation_condition || undefined
            });
            handleApiResponse(res.data);
            setAllocateOpen(false);
            setAllocateForm({ asset_id: '', user_id: '', allocation_condition: '' });
            fetchData();
        } catch (error) {
            handleApiError(error);
        } finally {
            setSaving(false);
        }
    };

    const handleReturn = async (allocationId: number) => {
        if (!(await confirm({ title: 'Return Asset', description: 'Mark this asset as returned?' }))) return;
        try {
            const res = await axios.post(`/admin/asset-allocations/${allocationId}/return`, {
                return_date: new Date().toISOString().split('T')[0],
                return_condition: 'Good'
            });
            handleApiResponse(res.data);
            fetchData();
        } catch (error) {
            handleApiError(error);
        }
    };

    const handleReviewExpense = async (expenseId: number, status: 'approved' | 'rejected') => {
        if (!(await confirm({ title: 'Review Expense', description: `Are you sure you want to ${status} this expense?` }))) return;
        try {
            const res = await axios.post(`/admin/asset-expenses/${expenseId}/review`, { status });
            handleApiResponse(res.data);
            fetchData();
        } catch (error) {
            handleApiError(error);
        }
    };

    if (loading) {
        return <div className="flex h-48 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Assets & Maintenance</h2>
                <p className="text-muted-foreground">Manage company vehicles, equipment, allocations, and expenses.</p>
            </div>

            <Tabs defaultValue="inventory" className="w-full">
                <TabsList>
                    <TabsTrigger value="inventory">Inventory</TabsTrigger>
                    <TabsTrigger value="allocations">Allocations</TabsTrigger>
                    <TabsTrigger value="expenses">Expenses / Maintenance</TabsTrigger>
                </TabsList>

                {/* INVENTORY TAB */}
                <TabsContent value="inventory" className="space-y-4">
                    <div className="flex justify-end">
                        <Dialog open={addAssetOpen} onOpenChange={setAddAssetOpen}>
                            <DialogTrigger asChild>
                                <Button onClick={openAddModal}><Plus className="mr-2 h-4 w-4" /> Add Asset</Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader><DialogTitle>{editingAssetId ? 'Edit Asset' : 'Add New Asset'}</DialogTitle></DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Asset Name</label>
                                        <Input value={assetForm.name} onChange={e => setAssetForm({...assetForm, name: e.target.value})} placeholder="e.g. Honda City V" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Type</label>
                                        <Input value={assetForm.asset_type} onChange={e => setAssetForm({...assetForm, asset_type: e.target.value})} placeholder="e.g. Vehicle, Laptop, Machinery" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Identifier (Reg/Serial No)</label>
                                        <Input value={assetForm.identifier} onChange={e => setAssetForm({...assetForm, identifier: e.target.value})} />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Purchase Cost (Optional)</label>
                                        <Input type="number" value={assetForm.purchase_cost} onChange={e => setAssetForm({...assetForm, purchase_cost: e.target.value})} />
                                    </div>
                                    <Button className="w-full" onClick={handleAddAsset} disabled={saving || !assetForm.name}>
                                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} {editingAssetId ? 'Update Asset' : 'Save Asset'}
                                    </Button>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>

                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Asset Name</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Identifier</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {assets.map(asset => (
                                    <TableRow key={asset.id}>
                                        <TableCell className="font-medium">{asset.name}</TableCell>
                                        <TableCell className="capitalize">{asset.asset_type}</TableCell>
                                        <TableCell>{asset.identifier || '-'}</TableCell>
                                        <TableCell>
                                            <Badge variant={asset.status === 'available' ? 'default' : 'secondary'}>{asset.status}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end space-x-2">
                                                <Button size="icon" variant="ghost" onClick={() => handleEditAsset(asset)}>
                                                    <PenSquare className="h-4 w-4 text-muted-foreground" />
                                                </Button>
                                                <Button size="icon" variant="ghost" onClick={() => handleDeleteAsset(asset.id)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {assets.length === 0 && (
                                    <TableRow><TableCell colSpan={5} className="text-center">No assets found</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>

                {/* ALLOCATIONS TAB */}
                <TabsContent value="allocations" className="space-y-4">
                    <div className="flex justify-end">
                        <Dialog open={allocateOpen} onOpenChange={setAllocateOpen}>
                            <DialogTrigger asChild>
                                <Button variant="secondary"><ArrowLeftRight className="mr-2 h-4 w-4" /> Allocate Asset</Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader><DialogTitle>Allocate Asset to Employee</DialogTitle></DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Select Available Asset</label>
                                        <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={allocateForm.asset_id} onChange={e => setAllocateForm({...allocateForm, asset_id: e.target.value})}>
                                            <option value="">-- Select Asset --</option>
                                            {assets.filter(a => a.status === 'available').map(a => (
                                                <option key={a.id} value={a.id}>{a.name} ({a.identifier})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Select Employee</label>
                                        <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={allocateForm.user_id} onChange={e => setAllocateForm({...allocateForm, user_id: e.target.value})}>
                                            <option value="">-- Select Employee --</option>
                                            {users.map(u => (
                                                <option key={u.id} value={u.id}>{u.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Condition (Optional)</label>
                                        <Input value={allocateForm.allocation_condition} onChange={e => setAllocateForm({...allocateForm, allocation_condition: e.target.value})} placeholder="e.g. Scratches on left door" />
                                    </div>
                                    <Button className="w-full" onClick={handleAllocate} disabled={saving || !allocateForm.asset_id || !allocateForm.user_id}>
                                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Allocate
                                    </Button>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>

                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Asset</TableHead>
                                    <TableHead>Assigned To</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {allocations.map(alloc => (
                                    <TableRow key={alloc.id}>
                                        <TableCell className="font-medium">{alloc.asset_name}</TableCell>
                                        <TableCell>{alloc.user_name}</TableCell>
                                        <TableCell>{alloc.allocated_date}</TableCell>
                                        <TableCell>
                                            <Badge variant={alloc.status === 'active' ? 'default' : 'outline'}>{alloc.status}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            {alloc.status === 'active' && (
                                                <Button size="sm" variant="outline" onClick={() => handleReturn(alloc.id)}>Process Return</Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {allocations.length === 0 && (
                                    <TableRow><TableCell colSpan={5} className="text-center">No allocations found</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>

                {/* EXPENSES TAB */}
                <TabsContent value="expenses" className="space-y-4">
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Asset</TableHead>
                                    <TableHead>Reported By</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Amount</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {expenses.map(exp => (
                                    <TableRow key={exp.id}>
                                        <TableCell>{exp.expense_date}</TableCell>
                                        <TableCell>{exp.asset_name}</TableCell>
                                        <TableCell>{exp.user_name || 'Admin'}</TableCell>
                                        <TableCell className="capitalize">{exp.expense_type}</TableCell>
                                        <TableCell>₹{exp.amount.toLocaleString()}</TableCell>
                                        <TableCell>
                                            <Badge variant={exp.status === 'approved' ? 'default' : exp.status === 'rejected' ? 'destructive' : 'secondary'}>
                                                {exp.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {exp.status === 'pending' && (
                                                <div className="flex space-x-2">
                                                    <Button size="icon" variant="outline" className="text-green-600" onClick={() => handleReviewExpense(exp.id, 'approved')}><Check className="h-4 w-4" /></Button>
                                                    <Button size="icon" variant="outline" className="text-red-600" onClick={() => handleReviewExpense(exp.id, 'rejected')}><X className="h-4 w-4" /></Button>
                                                </div>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {expenses.length === 0 && (
                                    <TableRow><TableCell colSpan={7} className="text-center">No expenses logged</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
