import axios from '@/lib/axios';
import {
    Search,
    RefreshCw,
    Pencil,
    Trash2,
    MoreVertical,
    ChevronsLeft,
    ChevronLeft,
    ChevronRight,
    ChevronsRight,
    Award,
} from 'lucide-react';
import { useState, useEffect } from 'react';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { handleApiResponse, handleApiError } from '@/lib/toast';

interface Designation {
    id: number;
    name: string;
    slug: string;
    description?: string;
    level?: number;
    is_active: boolean;
    users_count: number;
    created_at: string;
    updated_at: string;
}

interface DesignationTableProps {
    onEdit: (designation: Designation) => void;
    onRefresh?: () => void;
    refreshTrigger?: number;
}

export default function DesignationTable({ onEdit, onRefresh, refreshTrigger = 0 }: DesignationTableProps) {
    const [designations, setDesignations] = useState<Designation[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [lastPage, setLastPage] = useState(1);
    const [perPage, setPerPage] = useState(10);
    const [total, setTotal] = useState(0);
    const [from, setFrom] = useState(0);
    const [to, setTo] = useState(0);
    const [sortBy, setSortBy] = useState('created_at');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        fetchDesignations();
    }, [search, statusFilter, currentPage, perPage, sortBy, sortOrder, refreshTrigger]);

    const fetchDesignations = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/admin/designations/list', {
                params: {
                    search,
                    status: statusFilter !== 'all' ? statusFilter : undefined,
                    page: currentPage,
                    per_page: perPage,
                    sort_by: sortBy,
                    sort_order: sortOrder,
                },
            });

            if (response.data.success) {
                setDesignations(Array.isArray(response.data.data) ? response.data.data : (response.data.data?.data || []));
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

    const handleSort = (column: string) => {
        if (sortBy === column) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(column);
            setSortOrder('asc');
        }
    };

    const handleDelete = async () => {
        if (!deleteId) return;

        setDeleting(true);
        try {
            const response = await axios.delete(`/admin/designations/${deleteId}`);
            handleApiResponse(response);
            setDeleteId(null);
            fetchDesignations();
            onRefresh?.();
        } catch (error) {
            handleApiError(error);
        } finally {
            setDeleting(false);
        }
    };

    const sortIndicator = (col: string) =>
        sortBy === col ? (
            <span className="text-[10px] text-[#071b3a] dark:text-blue-300 font-bold">
                {sortOrder === 'asc' ? '↑' : '↓'}
            </span>
        ) : null;

    return (
        <>
            {/* Glass card wrapper */}
            <div className="relative overflow-hidden rounded-2xl bg-white/70 dark:bg-white/5 backdrop-blur-md border border-white/80 dark:border-white/10 shadow-[0_8px_32px_rgba(7,27,58,0.07)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
                {/* Top shimmer */}
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/50 to-transparent dark:via-blue-500/20" />

                {/* Header */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-6 pt-5 pb-4">
                    <h2 className="text-base font-semibold text-foreground">All Designations</h2>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        {/* Search */}
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/50" />
                            <Input
                                placeholder="Search designations..."
                                value={search}
                                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                                className="pl-8 bg-white/60 dark:bg-white/5 border-blue-100/60 dark:border-white/10 focus:border-[#071b3a]/40 dark:focus:border-blue-500/40 rounded-lg"
                            />
                        </div>

                        {/* Status Filter */}
                        <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setCurrentPage(1); }}>
                            <SelectTrigger className="w-full sm:w-[140px] bg-white/60 dark:bg-white/5 border-blue-100/60 dark:border-white/10 rounded-lg">
                                <SelectValue placeholder="All Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="inactive">Inactive</SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Per Page */}
                        <Select value={perPage.toString()} onValueChange={(value) => { setPerPage(parseInt(value)); setCurrentPage(1); }}>
                            <SelectTrigger className="w-full sm:w-[100px] bg-white/60 dark:bg-white/5 border-blue-100/60 dark:border-white/10 rounded-lg">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="10">10</SelectItem>
                                <SelectItem value="25">25</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                                <SelectItem value="100">100</SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Refresh */}
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={fetchDesignations}
                            disabled={loading}
                            title="Refresh designations"
                            className="border-blue-100/60 dark:border-white/10 hover:bg-blue-50 dark:hover:bg-white/5 rounded-lg"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </div>

                {/* Table */}
                <div className="px-6 pb-6">
                    <div className="rounded-xl border border-blue-100/60 dark:border-white/8 overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-gradient-to-r from-[#f0f7ff] to-[#e8f2fd] dark:from-[#0d1e33] dark:to-[#0a1828] border-b border-blue-100/60 dark:border-white/8 hover:bg-transparent dark:hover:bg-transparent">
                                    <TableHead
                                        className="cursor-pointer select-none w-[80px] text-[#1e3a5f]/70 dark:text-blue-200/60 font-semibold text-xs uppercase tracking-wide hover:text-[#071b3a] dark:hover:text-blue-300 transition-colors"
                                        onClick={() => handleSort('id')}
                                    >
                                        <div className="flex items-center gap-1">ID {sortIndicator('id')}</div>
                                    </TableHead>
                                    <TableHead
                                        className="cursor-pointer select-none text-[#1e3a5f]/70 dark:text-blue-200/60 font-semibold text-xs uppercase tracking-wide hover:text-[#071b3a] dark:hover:text-blue-300 transition-colors"
                                        onClick={() => handleSort('name')}
                                    >
                                        <div className="flex items-center gap-1">Name {sortIndicator('name')}</div>
                                    </TableHead>
                                    <TableHead className="text-[#1e3a5f]/70 dark:text-blue-200/60 font-semibold text-xs uppercase tracking-wide">
                                        Description
                                    </TableHead>
                                    <TableHead
                                        className="cursor-pointer select-none text-center text-[#1e3a5f]/70 dark:text-blue-200/60 font-semibold text-xs uppercase tracking-wide hover:text-[#071b3a] dark:hover:text-blue-300 transition-colors"
                                        onClick={() => handleSort('level')}
                                    >
                                        <div className="flex items-center justify-center gap-1">Level {sortIndicator('level')}</div>
                                    </TableHead>
                                    <TableHead className="text-center text-[#1e3a5f]/70 dark:text-blue-200/60 font-semibold text-xs uppercase tracking-wide">
                                        Users
                                    </TableHead>
                                    <TableHead
                                        className="cursor-pointer select-none text-[#1e3a5f]/70 dark:text-blue-200/60 font-semibold text-xs uppercase tracking-wide hover:text-[#071b3a] dark:hover:text-blue-300 transition-colors"
                                        onClick={() => handleSort('is_active')}
                                    >
                                        <div className="flex items-center gap-1">Status {sortIndicator('is_active')}</div>
                                    </TableHead>
                                    <TableHead
                                        className="cursor-pointer select-none text-[#1e3a5f]/70 dark:text-blue-200/60 font-semibold text-xs uppercase tracking-wide hover:text-[#071b3a] dark:hover:text-blue-300 transition-colors"
                                        onClick={() => handleSort('created_at')}
                                    >
                                        <div className="flex items-center gap-1">Created {sortIndicator('created_at')}</div>
                                    </TableHead>
                                    <TableHead className="w-[70px] text-[#1e3a5f]/70 dark:text-blue-200/60 font-semibold text-xs uppercase tracking-wide">
                                        Actions
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-12">
                                            <div className="flex items-center justify-center">
                                                <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#071b3a]/30 border-t-[#071b3a]" />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : designations.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-16">
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#071b3a]/10 dark:bg-blue-900/30 border border-[#071b3a]/15">
                                                    <Award className="h-7 w-7 text-[#071b3a]/50 dark:text-blue-400/50" />
                                                </div>
                                                <p className="text-sm text-muted-foreground/60">No designations found</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    designations.map((designation) => (
                                        <TableRow
                                            key={designation.id}
                                            className="border-b border-blue-50/60 dark:border-white/4 hover:bg-blue-50/40 dark:hover:bg-white/3 transition-colors duration-150"
                                        >
                                            <TableCell className="font-medium text-muted-foreground/70 text-sm">
                                                {designation.id}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2.5">
                                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#071b3a]/10 to-[#0d4a8a]/10 dark:from-blue-900/40 dark:to-blue-800/30 border border-blue-100/60 dark:border-blue-700/30">
                                                        <Award className="h-3.5 w-3.5 text-[#071b3a] dark:text-blue-300" />
                                                    </div>
                                                    <span className="font-semibold text-sm text-foreground">{designation.name}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground/70 max-w-xs truncate">
                                                {designation.description || <span className="text-muted-foreground/40">—</span>}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {designation.level ? (
                                                    <span className="inline-flex items-center justify-center h-6 min-w-[24px] px-1.5 rounded-full bg-violet-500/10 dark:bg-violet-900/30 text-[11px] font-bold text-violet-600 dark:text-violet-300 border border-violet-500/15 dark:border-violet-700/30">
                                                        {designation.level}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground/40">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <span className="inline-flex items-center justify-center h-6 min-w-[24px] px-1.5 rounded-full bg-[#071b3a]/10 dark:bg-blue-900/30 text-[11px] font-bold text-[#071b3a] dark:text-blue-300 border border-[#071b3a]/15 dark:border-blue-700/30">
                                                    {designation.users_count || 0}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={designation.is_active ? 'success' : 'secondary'}>
                                                    {designation.is_active ? 'Active' : 'Inactive'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground/60">
                                                {designation.created_at
                                                    ? new Date(designation.created_at).toLocaleDateString()
                                                    : '—'}
                                            </TableCell>
                                            <TableCell onClick={(e) => e.stopPropagation()}>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 w-8 p-0 hover:bg-blue-50 dark:hover:bg-white/5 rounded-lg"
                                                        >
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem onClick={() => onEdit(designation)}>
                                                            <Pencil className="mr-2 h-4 w-4" />
                                                            Edit Designation
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => setDeleteId(designation.id)}
                                                            className="text-red-600 focus:text-red-600"
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                            Delete Designation
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Pagination */}
                    {!loading && designations.length > 0 && (
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mt-5">
                            <p className="text-xs text-muted-foreground/60">
                                Showing <span className="font-semibold text-foreground/70">{from}</span>–<span className="font-semibold text-foreground/70">{to}</span> of <span className="font-semibold text-foreground/70">{total}</span> results
                            </p>
                            <div className="flex items-center gap-1.5">
                                {[
                                    { icon: ChevronsLeft, action: () => setCurrentPage(1), disabled: currentPage === 1 },
                                    { icon: ChevronLeft, action: () => setCurrentPage(currentPage - 1), disabled: currentPage === 1 },
                                ].map(({ icon: Icon, action, disabled }, i) => (
                                    <Button key={i} variant="outline" size="sm" onClick={action} disabled={disabled}
                                        className="h-8 w-8 p-0 rounded-lg border-blue-100/60 dark:border-white/10 hover:bg-blue-50 dark:hover:bg-white/5">
                                        <Icon className="h-4 w-4" />
                                    </Button>
                                ))}

                                <span className="inline-flex items-center justify-center h-8 px-3 rounded-lg bg-gradient-to-r from-[#071b3a] to-[#0d4a8a] text-white text-xs font-semibold shadow-sm shadow-blue-500/20 min-w-[80px]">
                                    {currentPage} / {lastPage}
                                </span>

                                {[
                                    { icon: ChevronRight, action: () => setCurrentPage(currentPage + 1), disabled: currentPage === lastPage },
                                    { icon: ChevronsRight, action: () => setCurrentPage(lastPage), disabled: currentPage === lastPage },
                                ].map(({ icon: Icon, action, disabled }, i) => (
                                    <Button key={i} variant="outline" size="sm" onClick={action} disabled={disabled}
                                        className="h-8 w-8 p-0 rounded-lg border-blue-100/60 dark:border-white/10 hover:bg-blue-50 dark:hover:bg-white/5">
                                        <Icon className="h-4 w-4" />
                                    </Button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Designation</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this designation? This action cannot be undone.
                            You cannot delete a designation with assigned users.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={deleting}
                            className="bg-red-500 hover:bg-red-600"
                        >
                            {deleting ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
