import axios from '@/lib/axios';
import { Mail, MoreVertical, Phone, Pencil, Trash2, User, Search, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

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
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
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

interface Contact {
    id: number;
    first_name: string;
    last_name: string;
    full_name: string;
    email: string;
    phone: string;
    job_title: string;
    company: {
        id: number;
        name: string;
    } | null;
    owner: {
        id: number;
        name: string;
        email: string;
    } | null;
    status: string;
    contact_type: string;
    created_at: string;
}

interface ContactTableProps {
    onEdit: (contact: Contact) => void;
    onRefresh: () => void;
}

export default function ContactTable({ onEdit, onRefresh }: ContactTableProps) {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [perPage, setPerPage] = useState(10);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [from, setFrom] = useState(0);
    const [to, setTo] = useState(0);
    const [sortBy, setSortBy] = useState('created_at');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deletingContact, setDeletingContact] = useState<Contact | null>(
        null,
    );

    const fetchContacts = async () => {
        setLoading(true);
        try {
            const params: any = {
                page: currentPage,
                per_page: perPage,
                sort_by: sortBy,
                sort_order: sortOrder,
            };

            if (search) {
                params.search = search;
            }

            if (statusFilter && statusFilter !== 'all') {
                params.status = statusFilter;
            }

            const response = await axios.get('/admin/contacts/list', { params });

            if (response.data.success) {
                setContacts(response.data.data);
                setCurrentPage(response.data.meta.current_page);
                setTotalPages(response.data.meta.last_page);
                setTotal(response.data.meta.total);
                setFrom(response.data.meta.from || 0);
                setTo(response.data.meta.to || 0);
            }
        } catch (error: any) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setCurrentPage(1);
    }, [search, statusFilter, perPage, sortBy, sortOrder]);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchContacts();
        }, 300);

        return () => clearTimeout(timer);
    }, [search, statusFilter, currentPage, perPage, sortBy, sortOrder]);

    const handleSort = (column: string) => {
        if (sortBy === column) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(column);
            setSortOrder('asc');
        }
    };

    const handleDelete = async () => {
        if (!deletingContact) return;

        try {
            const response = await axios.delete(
                `/admin/contacts/${deletingContact.id}`,
            );

            if (response.data.success) {
                handleApiResponse(response);
                setDeleteDialogOpen(false);
                setDeletingContact(null);
                fetchContacts();
                onRefresh();
            }
        } catch (error: any) {
            handleApiError(error);
        }
    };

    const getStatusBadgeVariant = (status: string) => {
        const variants: Record<string, any> = {
            active: 'default',
            inactive: 'destructive',
            lead: 'secondary',
            customer: 'default',
        };
        return variants[status] || 'outline';
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <CardTitle>All Contacts</CardTitle>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            {/* Search */}
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search contacts..."
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
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="inactive">Inactive</SelectItem>
                                    <SelectItem value="lead">Lead</SelectItem>
                                    <SelectItem value="customer">Customer</SelectItem>
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
                                onClick={fetchContacts}
                                disabled={loading}
                                title="Refresh contacts"
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
                                        className="cursor-pointer select-none hover:bg-muted/50"
                                        onClick={() => handleSort('id')}
                                    >
                                        <div className="flex items-center gap-1">
                                            ID
                                            {sortBy === 'id' && (
                                                <span className="text-xs">
                                                    {sortOrder === 'asc'
                                                        ? '↑'
                                                        : '↓'}
                                                </span>
                                            )}
                                        </div>
                                    </TableHead>
                                    <TableHead
                                        className="cursor-pointer select-none hover:bg-muted/50"
                                        onClick={() => handleSort('first_name')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Name
                                            {sortBy === 'first_name' && (
                                                <span className="text-xs">
                                                    {sortOrder === 'asc'
                                                        ? '↑'
                                                        : '↓'}
                                                </span>
                                            )}
                                        </div>
                                    </TableHead>
                                    <TableHead>Contact Info</TableHead>
                                    <TableHead>Job Title</TableHead>
                                    <TableHead>Company</TableHead>
                                    <TableHead>Owner</TableHead>
                                    <TableHead
                                        className="cursor-pointer select-none hover:bg-muted/50"
                                        onClick={() => handleSort('status')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Status
                                            {sortBy === 'status' && (
                                                <span className="text-xs">
                                                    {sortOrder === 'asc'
                                                        ? '↑'
                                                        : '↓'}
                                                </span>
                                            )}
                                        </div>
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Actions
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {contacts.length === 0 && !loading ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={8}
                                            className="h-24 text-center"
                                        >
                                            No contacts found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    contacts.map((contact) => (
                                        <TableRow key={contact.id}>
                                            <TableCell className="font-medium text-muted-foreground">
                                                {contact.id}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                                        <User className="h-5 w-5 text-primary" />
                                                    </div>
                                                    <div>
                                                        <div className="font-medium">
                                                            {contact.full_name}
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1 text-sm">
                                                    {contact.email && (
                                                        <div className="flex items-center gap-1.5 text-muted-foreground">
                                                            <Mail className="h-3.5 w-3.5" />
                                                            {contact.email}
                                                        </div>
                                                    )}
                                                    {contact.phone && (
                                                        <div className="flex items-center gap-1.5 text-muted-foreground">
                                                            <Phone className="h-3.5 w-3.5" />
                                                            {contact.phone}
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {contact.job_title || '—'}
                                            </TableCell>
                                            <TableCell>
                                                {contact.company?.name || (
                                                    <span className="text-muted-foreground">
                                                        No company
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {contact.owner?.name || (
                                                    <span className="text-muted-foreground">
                                                        Unassigned
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant={getStatusBadgeVariant(
                                                        contact.status,
                                                    )}
                                                >
                                                    {contact.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger
                                                        asChild
                                                    >
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                        >
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>
                                                            Actions
                                                        </DropdownMenuLabel>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            onClick={() =>
                                                                onEdit(contact)
                                                            }
                                                        >
                                                            <Pencil className="mr-2 h-4 w-4" />
                                                            Edit
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => {
                                                                setDeletingContact(
                                                                    contact,
                                                                );
                                                                setDeleteDialogOpen(
                                                                    true,
                                                                );
                                                            }}
                                                            className="text-destructive"
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                            Delete
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
                    {!loading && total > 0 && (
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-4 border-t">
                            {/* Results info */}
                            <div className="text-sm text-muted-foreground">
                                Showing{' '}
                                <span className="font-medium">{from}</span> to{' '}
                                <span className="font-medium">{to}</span> of{' '}
                                <span className="font-medium">{total}</span> results
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
                                    onClick={() => setCurrentPage(currentPage - 1)}
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
                                    onClick={() => setCurrentPage(currentPage + 1)}
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
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete{' '}
                            <span className="font-semibold">
                                {deletingContact?.full_name}
                            </span>
                            . This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
