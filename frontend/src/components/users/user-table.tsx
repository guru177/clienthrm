import { useNavigate } from 'react-router-dom';
import axios from '@/lib/axios';
import { useStorageSrc } from '@/hooks/use-storage-src';
import {
    Search,
    RefreshCw,
    Eye,
    Edit,
    Trash2,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    UserCheck,
    UserX,
    Ban,
    User as UserIcon,
    MoreHorizontal,
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
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
import { usePermissions } from '@/hooks/use-permissions';
import { fetchRolesList, type Role } from '@/lib/roles-api';
import { handleApiResponse, handleApiError } from '@/lib/toast';

function UserRowAvatar({ photo, name }: { photo?: string | null; name: string }) {
    const src = useStorageSrc(photo);
    const initials = name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
    return (
        <Avatar className="h-10 w-10">
            <AvatarImage src={src || undefined} alt={name} />
            <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
    );
}

interface User {
    id: number;
    name: string;
    email: string;
    phone?: string;
    photo?: string;
    department?: {
        id: number;
        name: string;
    };
    designation?: {
        id: number;
        name: string;
    };
    roles?: { id: number; name: string; slug?: string }[];
    work_location?: string | null;
    status: string;
    is_external?: boolean;
    hr_managed?: boolean;
    created_at: string;
    updated_at: string;
}

interface LookupOption {
    id: number;
    name: string;
}

interface UserTableProps {
    onRefresh?: () => void;
    onCreateClick?: () => void;
}

export default function UserTable({ onRefresh, onCreateClick }: UserTableProps) {
    const { can } = usePermissions();
    const navigate = useNavigate();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [hrManagedFilter, setHrManagedFilter] = useState('all');
    const [departmentFilter, setDepartmentFilter] = useState('all');
    const [roleFilter, setRoleFilter] = useState('all');
    const [branchFilter, setBranchFilter] = useState('all');
    const [departments, setDepartments] = useState<LookupOption[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [branches, setBranches] = useState<LookupOption[]>([]);
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
    const fetchSeq = useRef(0);

    const hasActiveFilters =
        Boolean(search.trim()) ||
        statusFilter !== 'all' ||
        hrManagedFilter !== 'all' ||
        departmentFilter !== 'all' ||
        roleFilter !== 'all' ||
        branchFilter !== 'all';

    useEffect(() => {
        let cancelled = false;
        void Promise.all([
            axios.get('/admin/departments/list', { params: { compact: 1 } }),
            fetchRolesList(),
            axios.get('/admin/settings/centers', { params: { compact: 1 } }),
        ])
            .then(([deptsRes, rolesList, centersRes]) => {
                if (cancelled) return;
                const deptData = deptsRes.data?.data;
                setDepartments(
                    (Array.isArray(deptData) ? deptData : deptData?.data || []).map(
                        (d: LookupOption) => ({ id: d.id, name: d.name }),
                    ),
                );
                setRoles(rolesList);
                const centerData = centersRes.data?.data;
                setBranches(
                    (Array.isArray(centerData) ? centerData : []).map((c: LookupOption) => ({
                        id: c.id,
                        name: c.name,
                    })),
                );
            })
            .catch(() => {
                /* filters still work without lookups */
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        fetchUsers();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch on filter/page changes
    }, [
        search,
        statusFilter,
        hrManagedFilter,
        departmentFilter,
        roleFilter,
        branchFilter,
        currentPage,
        perPage,
        sortBy,
        sortOrder,
    ]);

    const fetchUsers = async () => {
        const seq = ++fetchSeq.current;
        setLoading(true);
        try {
            const response = await axios.get('/admin/users', {
                params: {
                    search: search.trim() || undefined,
                    status: statusFilter !== 'all' ? statusFilter : undefined,
                    hr_managed:
                        hrManagedFilter === 'hr'
                            ? 1
                            : hrManagedFilter === 'app'
                              ? 0
                              : undefined,
                    department_id:
                        departmentFilter !== 'all' ? Number(departmentFilter) : undefined,
                    role_id: roleFilter !== 'all' ? Number(roleFilter) : undefined,
                    center_id: branchFilter !== 'all' ? Number(branchFilter) : undefined,
                    page: currentPage,
                    per_page: perPage,
                    sort_by: sortBy,
                    sort_order: sortOrder,
                },
            });

            if (seq !== fetchSeq.current) return;

            if (response.data.success) {
                const resData = response.data.data;
                if (Array.isArray(resData)) {
                    setUsers(resData);
                    const totalCount = response.data.total ?? resData.length;
                    const page = response.data.page ?? 1;
                    const size = response.data.per_page ?? perPage;
                    setTotal(totalCount);
                    setCurrentPage(page);
                    setLastPage(Math.max(1, Math.ceil(totalCount / size)));
                    setFrom(totalCount > 0 ? (page - 1) * size + 1 : 0);
                    setTo(Math.min(page * size, totalCount));
                } else {
                    setUsers(resData.data || []);
                    setCurrentPage(resData.current_page || 1);
                    setLastPage(resData.last_page || 1);
                    setTotal(resData.total || 0);
                    setFrom(resData.from || 0);
                    setTo(resData.to || 0);
                }
            }
        } catch (error) {
            if (seq !== fetchSeq.current) return;
            handleApiError(error);
        } finally {
            if (seq === fetchSeq.current) setLoading(false);
        }
    };

    const resetFilters = () => {
        setSearch('');
        setStatusFilter('all');
        setHrManagedFilter('all');
        setDepartmentFilter('all');
        setRoleFilter('all');
        setBranchFilter('all');
        setCurrentPage(1);
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
            const response = await axios.delete(`/admin/users/${deleteId}`);
            handleApiResponse(response);
            setDeleteId(null);
            fetchUsers();
            onRefresh?.();
        } catch (error) {
            handleApiError(error);
        } finally {
            setDeleting(false);
        }
    };

    const getStatusBadge = (status: string) => {
        const variants: Record<string, any> = {
            active: { variant: 'success', label: 'Active', icon: UserCheck },
            inactive: { variant: 'secondary', label: 'Inactive', icon: UserX },
            suspended: { variant: 'destructive', label: 'Suspended', icon: Ban },
        };
        const config = variants[status] || variants.active;
        const Icon = config.icon;
        return (
            <Badge variant={config.variant} className="gap-1">
                <Icon className="h-3 w-3" />
                {config.label}
            </Badge>
        );
    };

    const branchName = (workLocation?: string | null) => {
        if (!workLocation) return '—';
        const match = branches.find((b) => String(b.id) === String(workLocation));
        return match?.name || workLocation;
    };

    return (
        <>
            <div
                className="relative min-w-0 max-w-full overflow-hidden rounded-2xl bg-white/70 dark:bg-white/5 backdrop-blur-md border border-white/80 dark:border-white/10 shadow-[0_8px_32px_rgba(3,107,211,0.07)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
            >
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/50 to-transparent dark:via-blue-500/20" />
                <div className="flex flex-col gap-4 px-6 pt-5 pb-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <h2 className="text-base font-semibold text-foreground">All Users</h2>
                        <div className="flex items-center gap-2">
                            {hasActiveFilters && (
                                <Button variant="ghost" size="sm" onClick={resetFilters}>
                                    Reset
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={fetchUsers}
                                disabled={loading}
                                title="Refresh users"
                            >
                                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
                        <div className="relative w-full lg:min-w-[220px] lg:flex-1">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search name, email, phone, ID…"
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="pl-8"
                            />
                        </div>

                        <Select
                            value={statusFilter}
                            onValueChange={(value) => {
                                setStatusFilter(value);
                                setCurrentPage(1);
                            }}
                        >
                            <SelectTrigger className="w-full lg:w-[140px]">
                                <SelectValue placeholder="All Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="inactive">Inactive</SelectItem>
                                <SelectItem value="suspended">Suspended</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select
                            value={hrManagedFilter}
                            onValueChange={(value) => {
                                setHrManagedFilter(value);
                                setCurrentPage(1);
                            }}
                        >
                            <SelectTrigger className="w-full lg:w-[160px]">
                                <SelectValue placeholder="Access type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All access types</SelectItem>
                                <SelectItem value="hr">HR-managed</SelectItem>
                                <SelectItem value="app">App users</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select
                            value={branchFilter}
                            onValueChange={(value) => {
                                setBranchFilter(value);
                                setCurrentPage(1);
                            }}
                        >
                            <SelectTrigger className="w-full lg:w-[160px]">
                                <SelectValue placeholder="All Branches" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Branches</SelectItem>
                                {branches.map((b) => (
                                    <SelectItem key={b.id} value={String(b.id)}>
                                        {b.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select
                            value={departmentFilter}
                            onValueChange={(value) => {
                                setDepartmentFilter(value);
                                setCurrentPage(1);
                            }}
                        >
                            <SelectTrigger className="w-full lg:w-[170px]">
                                <SelectValue placeholder="All Departments" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Departments</SelectItem>
                                {departments.map((d) => (
                                    <SelectItem key={d.id} value={String(d.id)}>
                                        {d.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select
                            value={roleFilter}
                            onValueChange={(value) => {
                                setRoleFilter(value);
                                setCurrentPage(1);
                            }}
                        >
                            <SelectTrigger className="w-full lg:w-[150px]">
                                <SelectValue placeholder="All Roles" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Roles</SelectItem>
                                {roles.map((r) => (
                                    <SelectItem key={r.id} value={String(r.id)}>
                                        {r.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select
                            value={perPage.toString()}
                            onValueChange={(value) => {
                                setPerPage(parseInt(value));
                                setCurrentPage(1);
                            }}
                        >
                            <SelectTrigger className="w-full lg:w-[110px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="10">10 / page</SelectItem>
                                <SelectItem value="25">25 / page</SelectItem>
                                <SelectItem value="50">50 / page</SelectItem>
                                <SelectItem value="100">100 / page</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="min-w-0 px-4 pb-6 sm:px-6">
                    <div className="overflow-x-auto rounded-xl border border-blue-100/60 dark:border-white/8">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-gradient-to-r from-[#f0f7ff] to-[#e8f2fd] dark:from-[#0d1e33] dark:to-[#0a1828] border-b border-blue-100/60 dark:border-white/8 hover:bg-transparent dark:hover:bg-transparent">
                                    <TableHead
                                        className="hover:bg-muted/50 cursor-pointer select-none"
                                        onClick={() => handleSort('id')}
                                    >
                                        <div className="flex items-center gap-1">
                                            ID
                                            {sortBy === 'id' && (
                                                <span className="text-xs">
                                                    {sortOrder === 'asc' ? '↑' : '↓'}
                                                </span>
                                            )}
                                        </div>
                                    </TableHead>
                                    <TableHead
                                        className="hover:bg-muted/50 cursor-pointer select-none"
                                        onClick={() => handleSort('name')}
                                    >
                                        <div className="flex items-center gap-1">
                                            User
                                            {sortBy === 'name' && (
                                                <span className="text-xs">
                                                    {sortOrder === 'asc' ? '↑' : '↓'}
                                                </span>
                                            )}
                                        </div>
                                    </TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Branch</TableHead>
                                    <TableHead>Department</TableHead>
                                    <TableHead
                                        className="hover:bg-muted/50 cursor-pointer select-none"
                                        onClick={() => handleSort('status')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Status
                                            {sortBy === 'status' && (
                                                <span className="text-xs">
                                                    {sortOrder === 'asc' ? '↑' : '↓'}
                                                </span>
                                            )}
                                        </div>
                                    </TableHead>
                                    <TableHead className="w-[120px]">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-8">
                                            <div className="flex items-center justify-center">
                                                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : users.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="py-12 text-center">
                                            <div className="flex flex-col items-center gap-3">
                                                <UserIcon className="h-10 w-10 text-muted-foreground/40" />
                                                <div>
                                                    <p className="font-medium text-muted-foreground">No users found</p>
                                                    <p className="mt-1 text-sm text-muted-foreground/70">
                                                        {hasActiveFilters
                                                            ? 'Try adjusting your search or filters.'
                                                            : 'Add your first teammate to get started.'}
                                                    </p>
                                                </div>
                                                {onCreateClick && !hasActiveFilters && can('create', 'users') && (
                                                    <Button onClick={onCreateClick} className="mt-1">
                                                        Add User
                                                    </Button>
                                                )}
                                                {hasActiveFilters && (
                                                    <Button variant="outline" onClick={resetFilters} className="mt-1">
                                                        Clear filters
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    users.map((user, index) => (
                                        <TableRow
                                            key={user.id}
                                            className="hover:bg-blue-50/60 dark:hover:bg-blue-900/10 transition-colors duration-150 border-b border-blue-50 dark:border-white/5"
                                        >
                                            <TableCell className="font-medium">
                                                {(currentPage - 1) * perPage + index + 1}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <UserRowAvatar photo={user.photo} name={user.name} />
                                                    <div className="flex flex-col">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="font-medium">{user.name}</span>
                                                            {user.hr_managed ? (
                                                                <Badge
                                                                    variant="outline"
                                                                    className="border-amber-300 bg-amber-50 text-amber-800 text-xs dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                                                                >
                                                                    HR-managed
                                                                </Badge>
                                                            ) : (
                                                                <Badge variant="secondary" className="text-xs">
                                                                    App user
                                                                </Badge>
                                                            )}
                                                            {user.is_external && (
                                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                                                    External
                                                                </span>
                                                            )}
                                                        </div>
                                                        {user.phone ? (
                                                            <span className="text-xs text-muted-foreground">{user.phone}</span>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span>
                                                    {user.hr_managed &&
                                                    user.email?.endsWith('@hr-managed.local')
                                                        ? '—'
                                                        : user.email}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                {(user.roles || []).length > 0 ? (
                                                    <Badge variant="secondary" className="text-xs">
                                                        {user.roles![0].name}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell>{branchName(user.work_location)}</TableCell>
                                            <TableCell>{user.department?.name || '—'}</TableCell>
                                            <TableCell>{getStatusBadge(user.status)}</TableCell>
                                            <TableCell onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center gap-1">
                                                    {can('edit', 'users') && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8"
                                                            title="Edit user"
                                                            onClick={() =>
                                                                navigate(`/admin/users/${user.id}/edit`)
                                                            }
                                                        >
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem
                                                                onClick={() =>
                                                                    navigate(`/admin/users/${user.id}`)
                                                                }
                                                            >
                                                                <Eye className="mr-2 h-4 w-4" />
                                                                View
                                                            </DropdownMenuItem>
                                                            {can('edit', 'users') && (
                                                                <DropdownMenuItem
                                                                    onClick={() =>
                                                                        navigate(`/admin/users/${user.id}/edit`)
                                                                    }
                                                                >
                                                                    <Edit className="mr-2 h-4 w-4" />
                                                                    Edit
                                                                </DropdownMenuItem>
                                                            )}
                                                            {can('delete', 'users') && (
                                                                <DropdownMenuItem
                                                                    onClick={() => setDeleteId(user.id)}
                                                                    className="text-red-600"
                                                                >
                                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                                    Delete
                                                                </DropdownMenuItem>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {!loading && users.length > 0 && (
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mt-5">
                            <div className="text-sm text-muted-foreground/70">
                                Showing <span className="font-medium text-foreground">{from}</span> to <span className="font-medium text-foreground">{to}</span> of <span className="font-medium text-foreground">{total}</span> results
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(1)}
                                    disabled={currentPage === 1}
                                    className="rounded-lg border-blue-100 dark:border-white/10 hover:bg-blue-50 dark:hover:bg-blue-900/20 h-8 px-3"
                                >
                                    <ChevronsLeft className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="rounded-lg border-blue-100 dark:border-white/10 hover:bg-blue-50 dark:hover:bg-blue-900/20 h-8 px-3"
                                >
                                    <ChevronLeft className="h-3.5 w-3.5" />
                                </Button>
                                <span className="px-2 text-sm text-muted-foreground">
                                    {currentPage} / {lastPage}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage((p) => Math.min(lastPage, p + 1))}
                                    disabled={currentPage === lastPage}
                                    className="rounded-lg border-blue-100 dark:border-white/10 hover:bg-blue-50 dark:hover:bg-blue-900/20 h-8 px-3"
                                >
                                    <ChevronRight className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(lastPage)}
                                    disabled={currentPage === lastPage}
                                    className="rounded-lg border-blue-100 dark:border-white/10 hover:bg-blue-50 dark:hover:bg-blue-900/20 h-8 px-3"
                                >
                                    <ChevronsRight className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete user?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This permanently removes the user account. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void handleDelete()} disabled={deleting}>
                            {deleting ? 'Deleting…' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
