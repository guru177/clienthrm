import { useNavigate } from 'react-router-dom';
import axios from '@/lib/axios';
import { Edit, MoreVertical, Trash2, Shield, Search, Loader } from 'lucide-react';
import { useState, useEffect } from 'react';

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
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { usePermissions } from '@/hooks/use-permissions';
import { handleApiError, handleApiResponse } from '@/lib/toast';

import RoleForm from './role-form';

interface Role {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    users_count: number;
    permissions_count: number;
    permissions?: Permission[];
    created_at: string;
}

interface Permission {
    id: number;
    name: string;
    slug: string;
    group: string;
}

interface RoleTableProps {
    initialRoles: Role[];
    allPermissions: Permission[];
    onRoleUpdated?: () => void;
}

export default function RoleTable({
    initialRoles,
    allPermissions,
    onRoleUpdated,
}: RoleTableProps) {
    const navigate = useNavigate();
    const { can } = usePermissions();
    const [roles, setRoles] = useState<Role[]>(initialRoles || []);
    const [search, setSearch] = useState('');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [loading, setLoading] = useState(false);
    const [tableLoading, setTableLoading] = useState(true);

    const [sortBy, setSortBy] = useState('created_at');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [currentPage, setCurrentPage] = useState(1);
    const [perPage, setPerPage] = useState(10);

    // Fetch roles if not provided
    const fetchRoles = async () => {
        setTableLoading(true);
        try {
            const response = await axios.get('/admin/roles/list');
            if (response.data.success) {
                const rolesData = response.data.data || [];
                setRoles(Array.isArray(rolesData) ? rolesData : []);
            }
        } catch (error) {
            console.error('Failed to fetch roles:', error);
            setRoles([]);
        } finally {
            setTableLoading(false);
        }
    };

    // Load data on mount or when initialRoles changes
    useEffect(() => {
        if (Array.isArray(initialRoles) && initialRoles.length > 0) {
            setRoles(initialRoles);
            setTableLoading(false);
        } else if (!initialRoles || initialRoles.length === 0) {
            // Fetch if no initial roles provided
            fetchRoles();
        }
    }, [initialRoles]);

    const filteredRoles = Array.isArray(roles)
        ? roles.filter((role) =>
            role.name.toLowerCase().includes(search.toLowerCase())
        )
        : [];

    const handleSort = (column: string) => {
        if (sortBy === column) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(column);
            setSortOrder('asc');
        }
    };

    const sortedRoles = [...filteredRoles].sort((a, b) => {
        let aValue = a[sortBy as keyof Role];
        let bValue = b[sortBy as keyof Role];

        if (typeof aValue === 'string') aValue = aValue.toLowerCase();
        if (typeof bValue === 'string') bValue = bValue.toLowerCase();

        if ((aValue as any) < (bValue as any)) return sortOrder === 'asc' ? -1 : 1;
        if ((aValue as any) > (bValue as any)) return sortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    const paginatedRoles = sortedRoles.slice(
        (currentPage - 1) * perPage,
        currentPage * perPage
    );

    const totalPages = Math.ceil(sortedRoles.length / perPage);

    const handleEdit = (role: Role) => {
        navigate(`/admin/roles/${role.id}/edit`);
    };

    const handleDelete = async (role: Role) => {
        if (role.users_count > 0) {
            handleApiError({
                response: {
                    data: {
                        message: `Cannot delete role "${role.name}" because it is assigned to ${role.users_count} user(s)`,
                    },
                },
            } as any);
            return;
        }

        if (
            !confirm(
                `Are you sure you want to delete the role "${role.name}"? This action cannot be undone.`
            )
        ) {
            return;
        }

        setLoading(true);
        try {
            const response = await axios.delete(`/admin/roles/${role.id}`);
            handleApiResponse(response);
            setRoles(roles.filter((r) => r.id !== role.id));
            onRoleUpdated?.();
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const handleFormSuccess = (role: Role) => {
        if (editingRole) {
            setRoles(roles.map((r) => (r.id === role.id ? role : r)));
        } else {
            setRoles([role, ...roles]);
        }
        setIsFormOpen(false);
        setEditingRole(null);
        onRoleUpdated?.();
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search roles..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <Button onClick={() => setIsFormOpen(true)} size="sm">
                    <Shield className="mr-2 h-4 w-4" />
                    Add Role
                </Button>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead
                                className="hover:bg-muted/50 cursor-pointer select-none w-[80px]"
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
                                    Role Name
                                    {sortBy === 'name' && (
                                        <span className="text-xs">
                                            {sortOrder === 'asc' ? '↑' : '↓'}
                                        </span>
                                    )}
                                </div>
                            </TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-center">Users</TableHead>
                            <TableHead className="text-center">
                                Permissions
                            </TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tableLoading ? (
                            <TableRow>
                                <TableCell
                                    colSpan={6}
                                    className="text-center py-8 text-muted-foreground"
                                >
                                    <div className="flex items-center justify-center gap-2">
                                        <Loader className="h-4 w-4 animate-spin" />
                                        Loading roles...
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : paginatedRoles.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={6}
                                    className="text-center py-8 text-muted-foreground"
                                >
                                    No roles found
                                </TableCell>
                            </TableRow>
                        ) : (
                            paginatedRoles.map((role) => (
                                <TableRow key={role.id}>
                                    <TableCell className="font-medium">
                                        {role.id}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Shield className="h-4 w-4 text-muted-foreground" />
                                            <div>
                                                <div className="font-medium">
                                                    {role.name}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {role.slug}
                                                </div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="max-w-md">
                                        <div className="line-clamp-2 text-sm text-muted-foreground">
                                            {role.description || '—'}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant="secondary">
                                            {role.users_count}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant="outline">
                                            {role.permissions_count}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    disabled={loading}
                                                >
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                {can('edit', 'roles') && (
                                                    <DropdownMenuItem
                                                        onClick={() =>
                                                            handleEdit(role)
                                                        }
                                                    >
                                                        <Edit className="mr-2 h-4 w-4" />
                                                        Edit
                                                    </DropdownMenuItem>
                                                )}
                                                {can('delete', 'roles') && (
                                                    <DropdownMenuItem
                                                        onClick={() =>
                                                            handleDelete(role)
                                                        }
                                                        className="text-destructive"
                                                        disabled={
                                                            role.users_count > 0
                                                        }
                                                    >
                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                        Delete
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

            {totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                        Showing {(currentPage - 1) * perPage + 1} to{' '}
                        {Math.min(currentPage * perPage, sortedRoles.length)} of{' '}
                        {sortedRoles.length} results
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                                setCurrentPage((p) => Math.max(1, p - 1))
                            }
                            disabled={currentPage === 1}
                        >
                            Previous
                        </Button>
                        <div className="text-sm">
                            Page {currentPage} of {totalPages}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                                setCurrentPage((p) => Math.min(totalPages, p + 1))
                            }
                            disabled={currentPage === totalPages}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}

            <RoleForm
                open={isFormOpen}
                onOpenChange={(open) => {
                    setIsFormOpen(open);
                    if (!open) setEditingRole(null);
                }}
                role={editingRole}
                allPermissions={allPermissions}
                onSuccess={handleFormSuccess as (role: any) => void}
            />
        </div>
    );
}
