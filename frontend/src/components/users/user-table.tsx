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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CardHeader, CardTitle } from '@/components/ui/card';
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
    status: string;
    created_at: string;
    updated_at: string;
}

interface UserTableProps {
    onRefresh?: () => void;
}

export default function UserTable({ onRefresh }: UserTableProps) {
    const { can } = usePermissions();
    const navigate = useNavigate();
    const [users, setUsers] = useState<User[]>([]);
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
        fetchUsers();
    }, [search, statusFilter, currentPage, perPage, sortBy, sortOrder]);


    const fetchUsers = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/admin/users/list', {
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
                const resData = response.data.data;
                // Handle both paginated (Laravel) and flat array (Rust) responses
                if (Array.isArray(resData)) {
                    setUsers(resData);
                    setTotal(resData.length);
                    setFrom(resData.length > 0 ? 1 : 0);
                    setTo(resData.length);
                    setLastPage(1);
                    setCurrentPage(1);
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

    return (
        <>
            <div
                className="relative overflow-hidden rounded-2xl bg-white/70 dark:bg-white/5 backdrop-blur-md border border-white/80 dark:border-white/10 shadow-[0_8px_32px_rgba(3,107,211,0.07)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
            >
                {/* Top shimmer line */}
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/50 to-transparent dark:via-blue-500/20" />
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-6 pt-5 pb-4">
                    <h2 className="text-base font-semibold text-foreground">All Users</h2>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            {/* Search */}
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search users..."
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                    className="pl-8"
                                />
                            </div>

                            {/* Status Filter */}
                            <Select
                                value={statusFilter}
                                onValueChange={(value) => {
                                    setStatusFilter(value);
                                    setCurrentPage(1);
                                }}
                            >
                                <SelectTrigger className="w-full sm:w-[140px]">
                                    <SelectValue placeholder="All All Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="inactive">Inactive</SelectItem>
                                    <SelectItem value="suspended">Suspended</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Per Page Selector */}
                            <Select
                                value={perPage.toString()}
                                onValueChange={(value) => {
                                    setPerPage(parseInt(value));
                                    setCurrentPage(1);
                                }}
                            >
                                <SelectTrigger className="w-full sm:w-[100px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10">10</SelectItem>
                                    <SelectItem value="25">25</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                    <SelectItem value="100">100</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Refresh Button */}
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
                <div className="px-6 pb-6">
                    <div className="rounded-xl border border-blue-100/60 dark:border-white/8 overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-gradient-to-r from-[#f0f7ff] to-[#e8f2fd] dark:from-[#0d1e33] dark:to-[#0a1828] border-b border-blue-100/60 dark:border-white/8 hover:bg-transparent dark:hover:bg-transparent">
                                    <TableHead
                                        className="hover:bg-muted/50 cursor-pointer select-none"
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
                                    <TableHead>Phone</TableHead>
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
                                    <TableHead
                                        className="hover:bg-muted/50 cursor-pointer select-none"
                                        onClick={() => handleSort('created_at')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Created
                                            {sortBy === 'created_at' && (
                                                <span className="text-xs">
                                                    {sortOrder === 'asc' ? '↑' : '↓'}
                                                </span>
                                            )}
                                        </div>
                                    </TableHead>
                                    <TableHead className="w-[70px]">Actions</TableHead>
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
                                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                            No users found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    users.map((user, index) => (
                                            <TableRow
                                                key={user.id}
                                                className="hover:bg-blue-50/60 dark:hover:bg-blue-900/10 transition-colors duration-150 border-b border-blue-50 dark:border-white/5">

                                                <TableCell className="font-medium">
                                                    {(currentPage - 1) * perPage + index + 1}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-3">
                                                        <UserRowAvatar photo={user.photo} name={user.name} />
                                                        <span className="font-medium">{user.name}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>{user.email}</TableCell>
                                                <TableCell>{user.phone || '-'}</TableCell>
                                                <TableCell>{user.department?.name || '-'}</TableCell>
                                                <TableCell>{getStatusBadge(user.status)}</TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    {new Date(user.created_at).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell onClick={(e) => e.stopPropagation()}>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="sm">
                                                                •••
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem
                                                                onClick={() =>
                                                                    navigate(`/admin/users/${user.id}`)
                                                                }
                                                            >
                                                                <Eye className="mr-2 h-4 w-4" />
                                                                View User
                                                            </DropdownMenuItem>
                                                            {can('edit', 'users') && (
                                                                <DropdownMenuItem
                                                                    onClick={() =>
                                                                        navigate(`/admin/users/${user.id}/edit`)
                                                                    }
                                                                >
                                                                    <Edit className="mr-2 h-4 w-4" />
                                                                    Edit User
                                                                </DropdownMenuItem>
                                                            )}
                                                            {can('delete', 'users') && (
                                                                <DropdownMenuItem
                                                                    onClick={() => setDeleteId(user.id)}
                                                                    className="text-red-600"
                                                                >
                                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                                    Delete User
                                                                </DropdownMenuItem>
                                                            )}
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
                                    onClick={() => setCurrentPage(currentPage - 1)}
                                    disabled={currentPage === 1}
                                    className="rounded-lg border-blue-100 dark:border-white/10 hover:bg-blue-50 dark:hover:bg-blue-900/20 h-8 px-3"
                                >
                                    <ChevronLeft className="h-3.5 w-3.5" />
                                </Button>
                                <span className="text-sm px-3 py-1 rounded-lg bg-[#036bd3]/10 dark:bg-blue-900/30 text-[#036bd3] dark:text-blue-300 font-medium">
                                    {currentPage} / {lastPage}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(currentPage + 1)}
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

            {/* Delete Confirmation Dialog */}
            <AlertDialog
                open={deleteId !== null}
                onOpenChange={(open) => !open && setDeleteId(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete User</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this user? This action cannot be undone.
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
