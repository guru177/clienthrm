// Head removed - use document.title instead
import { Calendar, Check, Edit3, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import axios from '@/lib/axios';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { handleApiError, handleApiResponse } from '@/lib/toast';

interface HolidayForm {
    id?: number;
    name: string;
    date: string;
    is_paid: boolean;
    description?: string;
}

export default function HolidaysPage() {
    const [holidays, setHolidays] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [lastPage, setLastPage] = useState(1);
    const [perPage, setPerPage] = useState(15);
    const [total, setTotal] = useState(0);
    const [from, setFrom] = useState(0);
    const [to, setTo] = useState(0);
    const [search, setSearch] = useState('');
    const [year, setYear] = useState(new Date().getFullYear());
    const [dialogOpen, setDialogOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<HolidayForm>({ name: '', date: '', is_paid: true, description: '' });

    useEffect(() => {
        fetchHolidays();
    }, [currentPage, perPage, search, year]);

    const fetchHolidays = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/admin/holidays/list', {
                params: {
                    page: currentPage,
                    per_page: perPage,
                    search: search || undefined,
                    year,
                },
            });

            if (response.data.success) {
                setHolidays(Array.isArray(response.data.data) ? response.data.data : (response.data.data?.data || []));
                setCurrentPage((Array.isArray(response.data.data) ? 1 : response.data.data?.current_page) || 1);
                setLastPage((Array.isArray(response.data.data) ? 1 : response.data.data?.last_page) || 1);
                setTotal((Array.isArray(response.data.data) ? response.data.data.length : response.data.data?.total) || 0);
                setFrom((Array.isArray(response.data.data) ? 1 : response.data.data?.from) || 0);
                setTo((Array.isArray(response.data.data) ? response.data.data.length : response.data.data?.to) || 0);
            }
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const openCreate = () => {
        setForm({ name: '', date: '', is_paid: true, description: '' });
        setDialogOpen(true);
    };

    const openEdit = (holiday: any) => {
        setForm({
            id: holiday.id,
            name: holiday.name,
            date: holiday.date,
            is_paid: holiday.is_paid,
            description: holiday.description || '',
        });
        setDialogOpen(true);
    };

    const saveHoliday = async () => {
        setSaving(true);
        try {
            if (form.id) {
                const response = await axios.put(`/admin/holidays/${form.id}`, form);
                handleApiResponse(response);
            } else {
                const response = await axios.post('/admin/holidays', form);
                handleApiResponse(response);
            }
            setDialogOpen(false);
            fetchHolidays();
        } catch (error) {
            handleApiError(error);
        } finally {
            setSaving(false);
        }
    };

    const deleteHoliday = async (id: number) => {
        if (!confirm('Delete this holiday?')) return;
        try {
            const response = await axios.delete(`/admin/holidays/${id}`);
            handleApiResponse(response);
            fetchHolidays();
        } catch (error) {
            handleApiError(error);
        }
    };

    const breadcrumbs = [
        { label: 'Dashboard', href: '#' },
        { label: 'Holidays' },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            

            <div className="space-y-6">
                {/* Hero Header */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#e8f2fd] via-[#d0e4f8] to-[#c4d8f0] dark:from-[#0d1e33] dark:via-[#0a1828] dark:to-[#071220] px-6 py-5 shadow-sm border border-white/60 dark:border-white/10">
                    {/* decorative blob */}
                    <div className="pointer-events-none absolute -top-10 -right-10 w-48 h-48 opacity-20">
                        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                            <path fill="#071b3a" d="M44.7,-76.4C58.4,-69.7,70.3,-58.6,77.9,-44.9C85.5,-31.2,88.7,-15.6,87.4,-0.8C86,14,80,28,72.1,40.5C64.2,53,54.2,64,42.1,71.3C30,78.6,15,82.3,0.1,82.1C-14.8,81.9,-29.6,77.8,-42.7,70.5C-55.8,63.2,-67.3,52.7,-74.5,39.5C-81.7,26.3,-84.7,10.5,-83.1,-4.9C-81.6,-20.3,-75.5,-35.2,-66.3,-47.4C-57.1,-59.6,-44.8,-69.1,-31.6,-76.1C-18.4,-83.1,-4.6,-87.6,8.2,-86.2C21,-84.8,31,-83.1,44.7,-76.4Z" transform="translate(100 100)" />
                        </svg>
                    </div>
                    <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#071b3a]/15 dark:bg-white/10 border border-[#071b3a]/20 dark:border-white/10 shadow-inner">
                                <Calendar className="h-6 w-6 text-[#071b3a] dark:text-blue-300" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight text-[#001f3f] dark:text-white">
                                    Holidays
                                </h1>
                                <p className="text-sm text-[#1e3a5f]/60 dark:text-blue-200/60">
                                    Manage company holidays and non-working days
                                </p>
                            </div>
                        </div>
                        <Button
                            onClick={openCreate}
                            className="shrink-0 bg-gradient-to-r from-[#071b3a] to-[#0d4a8a] hover:from-[#040f22] hover:to-[#0a3272] text-white shadow-md shadow-blue-500/25 dark:shadow-blue-900/40 rounded-xl gap-2 z-10"
                        >
                            <Plus className="mr-2 h-4 w-4" />
                            Add Holiday
                        </Button>
                    </div>
                </div>

                <Card>
                    <CardHeader className="py-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end">
                            <div className="flex flex-wrap gap-2 items-center">
                                <Select value={year.toString()} onValueChange={(v) => { setYear(parseInt(v)); setCurrentPage(1); }}>
                                    <SelectTrigger className="w-[120px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Array.from({ length: 5 }, (_, i) => {
                                            const y = new Date().getFullYear() - i;
                                            return (
                                                <SelectItem key={y} value={y.toString()}>
                                                    {y}
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>

                                <div className="relative">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search holiday"
                                        className="pl-8 w-56"
                                        value={search}
                                        onChange={(e) => {
                                            setSearch(e.target.value);
                                            setCurrentPage(1);
                                        }}
                                    />
                                </div>

                                <Select value={perPage.toString()} onValueChange={(v) => { setPerPage(parseInt(v)); setCurrentPage(1); }}>
                                    <SelectTrigger className="w-[100px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="10">10</SelectItem>
                                        <SelectItem value="15">15</SelectItem>
                                        <SelectItem value="25">25</SelectItem>
                                        <SelectItem value="50">50</SelectItem>
                                    </SelectContent>
                                </Select>

                                <Button variant="outline" size="icon" onClick={fetchHolidays} disabled={loading}>
                                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                                </Button>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent>
                        <div className="rounded-md border overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>ID</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead className="w-[180px]">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-8">
                                                <div className="flex items-center justify-center">
                                                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : holidays.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                                No holidays found
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        holidays.map((holiday) => (
                                            <TableRow key={holiday.id}>
                                                <TableCell className="font-mono text-sm">#{holiday.id}</TableCell>
                                                <TableCell className="font-medium">{holiday.name}</TableCell>
                                                <TableCell className="flex items-center gap-2">
                                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                                    {new Date(holiday.date).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell>
                                                    {holiday.is_paid ? (
                                                        <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200" variant="outline">
                                                            Paid
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline">Unpaid</Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="flex gap-2">
                                                    <Button variant="outline" size="icon" onClick={() => openEdit(holiday)}>
                                                        <Edit3 className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="text-red-600" onClick={() => deleteHoliday(holiday.id)}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        {!loading && holidays.length > 0 && (
                            <div className="flex items-center justify-between mt-4">
                                <div className="text-sm text-muted-foreground">
                                    Showing {from} to {to} of {total} results
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage(1)}
                                        disabled={currentPage === 1}
                                    >
                                        First
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage(currentPage - 1)}
                                        disabled={currentPage === 1}
                                    >
                                        Previous
                                    </Button>
                                    <span className="text-sm">
                                        Page {currentPage} of {lastPage}
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage(currentPage + 1)}
                                        disabled={currentPage === lastPage}
                                    >
                                        Next
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage(lastPage)}
                                        disabled={currentPage === lastPage}
                                    >
                                        Last
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{form.id ? 'Edit Holiday' : 'Add Holiday'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Name</label>
                            <Input
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                placeholder="Holiday name"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Date</label>
                            <Input
                                type="date"
                                value={form.date}
                                onChange={(e) => setForm({ ...form, date: e.target.value })}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Type</label>
                            <div className="flex gap-2">
                                <Button
                                    variant={form.is_paid ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setForm({ ...form, is_paid: true })}
                                >
                                    <Check className="mr-2 h-4 w-4" /> Paid
                                </Button>
                                <Button
                                    variant={!form.is_paid ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setForm({ ...form, is_paid: false })}
                                >
                                    <X className="mr-2 h-4 w-4" /> Unpaid
                                </Button>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Notes (optional)</label>
                            <Input
                                value={form.description}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                                placeholder="Optional description"
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-2 sm:gap-4">
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={saveHoliday} disabled={saving || !form.name || !form.date}>
                            {saving ? 'Saving...' : 'Save'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
