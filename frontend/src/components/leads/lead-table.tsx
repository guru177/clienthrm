import { useNavigate } from 'react-router-dom';
import axios from '@/lib/axios';
import { Pencil, Trash2, Search, RefreshCw, MoreVertical, Eye } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

interface Lead {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    mobile?: string;
    campaign?: {
        id: number;
        name: string;
        status: string;
    };
    status: string;
    created_at: string;
}

interface LeadTableProps {
    onEdit: (lead: Lead) => void;
    onRefresh: () => void;
}

export default function LeadTable({
    onEdit,
    onRefresh,
}: LeadTableProps) {
    const navigate = useNavigate();
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);

    // Filters and pagination
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [sortBy, setSortBy] = useState('created_at');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [currentPage, setCurrentPage] = useState(1);
    const [perPage, setPerPage] = useState(10);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);

    useEffect(() => {
        fetchLeads();
    }, [search, statusFilter, sortBy, sortOrder, currentPage, perPage]);

    const fetchLeads = async () => {
        try {
            setLoading(true);
            const response = await axios.get('/admin/leads/list', {
                params: {
                    search,
                    status: statusFilter || undefined,
                    sort_by: sortBy,
                    sort_order: sortOrder,
                    page: currentPage,
                    per_page: perPage,
                },
            });
            if (response.data.success) {
                setLeads(Array.isArray(response.data.data) ? response.data.data : (response.data.data?.data || []));
                setCurrentPage((Array.isArray(response.data.data) ? 1 : response.data.data?.current_page));
                setTotalPages((Array.isArray(response.data.data) ? 1 : response.data.data?.last_page));
                setTotalRecords((Array.isArray(response.data.data) ? response.data.data.length : response.data.data?.total));
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
            const response = await axios.delete(`/admin/leads/${deleteId}`);
            handleApiResponse(response);
            setDeleteId(null);
            fetchLeads();
            onRefresh();
        } catch (error) {
            handleApiError(error);
        } finally {
            setDeleting(false);
        }
    };

    const getStatusBadge = (status: string) => {
        const variants: Record<
            string,
            {
                variant:
                | 'default'
                | 'secondary'
                | 'destructive'
                | 'outline'
                | 'success'
                | 'warning';
                label: string;
            }
        > = {
            new: { variant: 'default', label: 'New' },
            in_progress: { variant: 'warning', label: 'In Progress' },
            qualified: { variant: 'success', label: 'Qualified' },
            contacted: { variant: 'secondary', label: 'Contacted' },
            converted: { variant: 'success', label: 'Converted' },
            rejected: { variant: 'destructive', label: 'Rejected' },
        };

        const config = variants[status] || variants.new;
        return <Badge variant={config.variant}>{config.label}</Badge>;
    };

    const SortIcon = ({ column }: { column: string }) => {
        if (sortBy !== column) return null;
        return (
            <span className="ml-1 text-xs">
                {sortOrder === 'asc' ? 'â†‘' : 'â†“'}
            </span>
        );
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <CardTitle>All Leads</CardTitle>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            {/* Search */}
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search leads..."
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
                                    <SelectValue placeholder="All Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="new">New</SelectItem>
                                    <SelectItem value="contacted">Contacted</SelectItem>
                                    <SelectItem value="qualified">Qualified</SelectItem>
                                    <SelectItem value="in_progress">In Progress</SelectItem>
                                    <SelectItem value="converted">Converted</SelectItem>
                                    <SelectItem value="rejected">Rejected</SelectItem>
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
                                    <SelectItem value="15">15</SelectItem>
                                    <SelectItem value="25">25</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                    <SelectItem value="100">100</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Refresh Button */}
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={fetchLeads}
                                disabled={loading}
                                title="Refresh leads"
                            >
                                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        {loading && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50">
                                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                            </div>
                        )}
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead
                                        className="hover:bg-muted/50 cursor-pointer select-none w-[80px]"
                                        onClick={() => handleSort('id')}
                                    >
                                        <div className="flex items-center">
                                            ID
                                            <SortIcon column="id" />
                                        </div>
                                    </TableHead>
                                    <TableHead
                                        className="hover:bg-muted/50 cursor-pointer select-none"
                                        onClick={() => handleSort('first_name')}
                                    >
                                        <div className="flex items-center">
                                            Name
                                            <SortIcon column="first_name" />
                                        </div>
                                    </TableHead>
                                    <TableHead
                                        className="hover:bg-muted/50 cursor-pointer select-none"
                                        onClick={() => handleSort('email')}
                                    >
                                        <div className="flex items-center">
                                            Email
                                            <SortIcon column="email" />
                                        </div>
                                    </TableHead>
                                    <TableHead>Phone</TableHead>
                                    <TableHead
                                        className="hover:bg-muted/50 cursor-pointer select-none"
                                        onClick={() => handleSort('campaign_id')}
                                    >
                                        <div className="flex items-center">
                                            Campaign
                                            <SortIcon column="campaign_id" />
                                        </div>
                                    </TableHead>
                                    <TableHead
                                        className="hover:bg-muted/50 cursor-pointer select-none"
                                        onClick={() => handleSort('status')}
                                    >
                                        <div className="flex items-center">
                                            Status
                                            <SortIcon column="status" />
                                        </div>
                                    </TableHead>
                                    <TableHead
                                        className="hover:bg-muted/50 cursor-pointer select-none"
                                        onClick={() => handleSort('created_at')}
                                    >
                                        <div className="flex items-center">
                                            Created
                                            <SortIcon column="created_at" />
                                        </div>
                                    </TableHead>
                                    <TableHead className="text-right w-[100px]">
                                        Actions
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={8}
                                            className="text-center py-8 text-muted-foreground"
                                        >
                                            Loading leads...
                                        </TableCell>
                                    </TableRow>
                                ) : !leads || leads.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={8}
                                            className="text-center py-8 text-muted-foreground"
                                        >
                                            No leads found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    leads.map((lead) => (
                                        <TableRow
                                            key={lead.id}
                                        >
                                            <TableCell className="font-medium">
                                                {lead.id}
                                            </TableCell>
                                            <TableCell>
                                                {lead.first_name} {lead.last_name}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {lead.email}
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {lead.phone}
                                                {lead.mobile && (
                                                    <div className="text-xs text-muted-foreground">
                                                        M: {lead.mobile}
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {lead.campaign ? (
                                                    <div>
                                                        <div className="font-medium text-sm">
                                                            {lead.campaign.name}
                                                        </div>
                                                        <Badge
                                                            variant="outline"
                                                            className="text-xs mt-1"
                                                        >
                                                            {lead.campaign.status}
                                                        </Badge>
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground">
                                                        -
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {getStatusBadge(lead.status)}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {new Date(
                                                    lead.created_at,
                                                ).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                        >
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigate(`/admin/leads/${lead.id}`);
                                                        }}>
                                                            <Eye className="mr-2 h-4 w-4" />
                                                            View Lead
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={(e) => {
                                                            e.stopPropagation();
                                                            onEdit(lead);
                                                        }}>
                                                            <Pencil className="mr-2 h-4 w-4" />
                                                            Edit Lead
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setDeleteId(lead.id);
                                                            }}
                                                            className="text-destructive"
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                            Delete Lead
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
                    {!loading && totalRecords > 0 && (
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-4 border-t">
                            {/* Results info */}
                            <div className="text-sm text-muted-foreground">
                                Showing{' '}
                                <span className="font-medium">
                                    {(currentPage - 1) * perPage + 1}
                                </span>{' '}
                                to{' '}
                                <span className="font-medium">
                                    {Math.min(currentPage * perPage, totalRecords)}
                                </span>{' '}
                                of <span className="font-medium">{totalRecords}</span>{' '}
                                results
                            </div>

                            {/* Page navigation */}
                            <div className="flex items-center gap-1">
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
                                    onClick={() =>
                                        setCurrentPage(currentPage - 1)
                                    }
                                    disabled={currentPage === 1}
                                >
                                    Previous
                                </Button>
                                <span className="text-sm px-3">
                                    Page {currentPage} of {totalPages}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                        setCurrentPage(currentPage + 1)
                                    }
                                    disabled={currentPage === totalPages}
                                >
                                    Next
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(totalPages)}
                                    disabled={currentPage === totalPages}
                                >
                                    Last
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Delete Confirmation Dialog */}
            <AlertDialog
                open={deleteId !== null}
                onOpenChange={(open) => !open && setDeleteId(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Lead</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this lead? This
                            action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={deleting}
                            className="bg-red-500 hover:bg-red-600"
                        >
                            {deleting ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog >
        </>
    );
}
