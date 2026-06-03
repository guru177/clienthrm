import axios from '@/lib/axios';
import {
    Mail,
    MoreVertical,
    Trash2,
    Search,
    RefreshCw,
    Eye,
    CheckCircle,
    Filter,
} from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Textarea } from '@/components/ui/textarea';
import { handleApiResponse, handleApiError } from '@/lib/toast';

interface ContactForm {
    id: number;
    name: string;
    email: string;
    subject: string;
    message: string;
    status: string;
    ip_address: string | null;
    replied_at: string | null;
    replied_by: {
        id: number;
        name: string;
    } | null;
    reply_message: string | null;
    created_at: string;
}

interface ContactFormTableProps {
    onRefresh: () => void;
}

export default function ContactFormTable({ onRefresh }: ContactFormTableProps) {
    const [contactForms, setContactForms] = useState<ContactForm[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [perPage, setPerPage] = useState(10);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [from, setFrom] = useState(0);
    const [to, setTo] = useState(0);
    const [sortBy, setSortBy] = useState('created_at');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deletingContactForm, setDeletingContactForm] = useState<ContactForm | null>(null);
    const [viewDialogOpen, setViewDialogOpen] = useState(false);
    const [viewingContactForm, setViewingContactForm] = useState<ContactForm | null>(null);
    const [replyMessage, setReplyMessage] = useState('');
    const [selectedStatus, setSelectedStatus] = useState<string>('');

    const fetchContactForms = async () => {
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

            if (statusFilter && statusFilter.length > 0) {
                params.status = statusFilter.join(',');
            }

            const response = await axios.get('/admin/contact-forms/list', { params });

            if (response.data.success) {
                setContactForms(response.data.data);
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
            fetchContactForms();
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

    const handleView = async (contactForm: ContactForm) => {
        setViewingContactForm(contactForm);
        setReplyMessage(contactForm.reply_message || '');
        setSelectedStatus(contactForm.status);
        setViewDialogOpen(true);

        // Mark as read if new
        if (contactForm.status === 'new') {
            try {
                await axios.put(`/admin/contact-forms/${contactForm.id}`, {
                    status: 'read',
                });
                setSelectedStatus('read');
                fetchContactForms();
                onRefresh();
            } catch (error: any) {
                // Silently fail
            }
        }
    };

    const handleStatusChange = async (newStatus: string) => {
        if (!viewingContactForm) return;

        try {
            const payload: any = { status: newStatus };

            // Include reply message if changing to replied status
            if (newStatus === 'replied' && replyMessage) {
                payload.reply_message = replyMessage;
            }

            const response = await axios.put(`/admin/contact-forms/${viewingContactForm.id}`, payload);

            if (response.data.success) {
                handleApiResponse(response);
                setSelectedStatus(newStatus);
                setViewingContactForm({ ...viewingContactForm, status: newStatus });
                fetchContactForms();
                onRefresh();
            }
        } catch (error: any) {
            handleApiError(error);
        }
    };

    const handleSaveReply = async () => {
        if (!viewingContactForm) return;

        try {
            const response = await axios.put(`/admin/contact-forms/${viewingContactForm.id}`, {
                status: 'replied',
                reply_message: replyMessage,
            });

            if (response.data.success) {
                handleApiResponse(response);
                setViewDialogOpen(false);
                setViewingContactForm(null);
                setReplyMessage('');
                setSelectedStatus('');
                fetchContactForms();
                onRefresh();
            }
        } catch (error: any) {
            handleApiError(error);
        }
    };

    const handleDelete = async () => {
        if (!deletingContactForm) return;

        try {
            const response = await axios.delete(
                `/admin/contact-forms/${deletingContactForm.id}`,
            );

            if (response.data.success) {
                handleApiResponse(response);
                setDeleteDialogOpen(false);
                setDeletingContactForm(null);
                fetchContactForms();
                onRefresh();
            }
        } catch (error: any) {
            handleApiError(error);
        }
    };

    const getStatusBadgeVariant = (status: string) => {
        const variants: Record<string, any> = {
            new: 'default',
            read: 'secondary',
            replied: 'outline',
            archived: 'destructive',
        };
        return variants[status] || 'outline';
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <CardTitle>All Submissions</CardTitle>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            {/* Search */}
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search submissions..."
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                    className="pl-8"
                                />
                            </div>

                            {/* Status Filter - Multi-select */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="w-full sm:w-[180px]">
                                        <Filter className="mr-2 h-4 w-4" />
                                        Status
                                        {statusFilter.length > 0 && (
                                            <Badge variant="secondary" className="ml-2">
                                                {statusFilter.length}
                                            </Badge>
                                        )}
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-[200px]">
                                    <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    {['new', 'read', 'replied', 'archived'].map((status) => (
                                        <DropdownMenuItem
                                            key={status}
                                            className="cursor-pointer"
                                            onSelect={(e) => e.preventDefault()}
                                        >
                                            <div className="flex items-center gap-2 w-full">
                                                <Checkbox
                                                    checked={statusFilter.includes(status)}
                                                    onCheckedChange={(checked) => {
                                                        if (checked) {
                                                            setStatusFilter([...statusFilter, status]);
                                                        } else {
                                                            setStatusFilter(
                                                                statusFilter.filter(
                                                                    (s) => s !== status,
                                                                ),
                                                            );
                                                        }
                                                        setCurrentPage(1);
                                                    }}
                                                />
                                                <span className="capitalize">{status}</span>
                                            </div>
                                        </DropdownMenuItem>
                                    ))}
                                    {statusFilter.length > 0 && (
                                        <>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                className="cursor-pointer text-destructive focus:text-destructive"
                                                onSelect={() => {
                                                    setStatusFilter([]);
                                                    setCurrentPage(1);
                                                }}
                                            >
                                                Clear filters
                                            </DropdownMenuItem>
                                        </>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>

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
                                onClick={() => fetchContactForms()}
                                disabled={loading}
                            >
                                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading && contactForms.length === 0 ? (
                        <div className="flex h-[400px] items-center justify-center">
                            <div className="text-center">
                                <RefreshCw className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
                                <p className="mt-2 text-sm text-muted-foreground">
                                    Loading contact forms...
                                </p>
                            </div>
                        </div>
                    ) : contactForms.length === 0 ? (
                        <div className="flex h-[400px] items-center justify-center">
                            <div className="text-center">
                                <Mail className="mx-auto h-12 w-12 text-muted-foreground" />
                                <h3 className="mt-4 text-lg font-semibold">
                                    No contact forms found
                                </h3>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    {search || statusFilter.length > 0
                                        ? 'Try adjusting your filters'
                                        : 'No submissions yet'}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
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
                                                    Name
                                                    {sortBy === 'name' && (
                                                        <span className="text-xs">
                                                            {sortOrder === 'asc' ? '↑' : '↓'}
                                                        </span>
                                                    )}
                                                </div>
                                            </TableHead>
                                            <TableHead>Email</TableHead>
                                            <TableHead>Subject</TableHead>
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
                                                    Submitted
                                                    {sortBy === 'created_at' && (
                                                        <span className="text-xs">
                                                            {sortOrder === 'asc' ? '↑' : '↓'}
                                                        </span>
                                                    )}
                                                </div>
                                            </TableHead>
                                            <TableHead className="w-[80px]">
                                                Actions
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {contactForms.map((contactForm) => (
                                            <TableRow key={contactForm.id}>
                                                <TableCell className="font-mono text-xs">
                                                    #{contactForm.id}
                                                </TableCell>
                                                <TableCell className="font-medium">
                                                    {contactForm.name}
                                                </TableCell>
                                                <TableCell>
                                                    <a
                                                        href={`mailto:${contactForm.email}`}
                                                        className="text-blue-600 hover:text-blue-700 hover:underline"
                                                    >
                                                        {contactForm.email}
                                                    </a>
                                                </TableCell>
                                                <TableCell className="max-w-xs truncate">
                                                    {contactForm.subject}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant={getStatusBadgeVariant(
                                                            contactForm.status,
                                                        )}
                                                    >
                                                        {contactForm.status.charAt(0).toUpperCase() +
                                                            contactForm.status.slice(1)}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    {new Date(
                                                        contactForm.created_at,
                                                    ).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8"
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
                                                                    handleView(contactForm)
                                                                }
                                                            >
                                                                <Eye className="mr-2 h-4 w-4" />
                                                                View Details
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                onClick={() => {
                                                                    setDeletingContactForm(
                                                                        contactForm,
                                                                    );
                                                                    setDeleteDialogOpen(true);
                                                                }}
                                                                className="text-destructive focus:text-destructive"
                                                            >
                                                                <Trash2 className="mr-2 h-4 w-4" />
                                                                Delete
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* Pagination */}
                            <div className="mt-4 flex items-center justify-between border-t pt-4">
                                <div className="text-sm text-muted-foreground">
                                    Showing {from} to {to} of {total} results
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            setCurrentPage((prev) => Math.max(prev - 1, 1))
                                        }
                                        disabled={currentPage === 1 || loading}
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
                                            setCurrentPage((prev) =>
                                                Math.min(prev + 1, totalPages),
                                            )
                                        }
                                        disabled={currentPage === totalPages || loading}
                                    >
                                        Next
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* View Dialog */}
            <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Contact Form Details</DialogTitle>
                        <DialogDescription>
                            View and manage this contact form submission
                        </DialogDescription>
                    </DialogHeader>
                    {viewingContactForm && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-xs font-semibold text-muted-foreground">
                                        Name
                                    </Label>
                                    <p className="text-sm font-medium">
                                        {viewingContactForm.name}
                                    </p>
                                </div>
                                <div>
                                    <Label className="text-xs font-semibold text-muted-foreground">
                                        Email
                                    </Label>
                                    <p className="text-sm">
                                        <a
                                            href={`mailto:${viewingContactForm.email}`}
                                            className="text-blue-600 hover:underline"
                                        >
                                            {viewingContactForm.email}
                                        </a>
                                    </p>
                                </div>
                            </div>
                            <div>
                                <Label className="text-xs font-semibold text-muted-foreground">
                                    Subject
                                </Label>
                                <p className="text-sm font-medium">
                                    {viewingContactForm.subject}
                                </p>
                            </div>
                            <div>
                                <Label className="text-xs font-semibold text-muted-foreground">
                                    Message
                                </Label>
                                <p className="text-sm whitespace-pre-wrap mt-2 p-4 bg-muted rounded-md">
                                    {viewingContactForm.message}
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor="status" className="text-xs font-semibold text-muted-foreground">
                                        Status
                                    </Label>
                                    <Select
                                        value={selectedStatus}
                                        onValueChange={handleStatusChange}
                                    >
                                        <SelectTrigger id="status" className="mt-1">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="new">
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="default" className="text-xs">New</Badge>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="read">
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="secondary" className="text-xs">Read</Badge>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="replied">
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="outline" className="text-xs">Replied</Badge>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="archived">
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="destructive" className="text-xs">Archived</Badge>
                                                </div>
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-xs font-semibold text-muted-foreground">
                                        Submitted
                                    </Label>
                                    <p className="text-sm">
                                        {new Date(
                                            viewingContactForm.created_at,
                                        ).toLocaleString()}
                                    </p>
                                </div>
                            </div>
                            {viewingContactForm.replied_at && (
                                <div>
                                    <Label className="text-xs font-semibold text-muted-foreground">
                                        Replied At
                                    </Label>
                                    <p className="text-sm">
                                        {new Date(
                                            viewingContactForm.replied_at,
                                        ).toLocaleString()}{' '}
                                        {viewingContactForm.replied_by && (
                                            <span className="text-muted-foreground">
                                                by {viewingContactForm.replied_by.name}
                                            </span>
                                        )}
                                    </p>
                                </div>
                            )}
                            <div>
                                <Label htmlFor="reply_message">Reply Message (Optional)</Label>
                                <Textarea
                                    id="reply_message"
                                    value={replyMessage}
                                    onChange={(e) => setReplyMessage(e.target.value)}
                                    placeholder="Add a reply note (for internal tracking)"
                                    rows={4}
                                    className="mt-2"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Add notes about your response for internal records
                                </p>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setViewDialogOpen(false);
                                setViewingContactForm(null);
                                setReplyMessage('');
                                setSelectedStatus('');
                            }}
                        >
                            Close
                        </Button>
                        {viewingContactForm && replyMessage && viewingContactForm.reply_message !== replyMessage && (
                            <Button onClick={handleSaveReply}>
                                <CheckCircle className="mr-2 h-4 w-4" />
                                {selectedStatus === 'replied' ? 'Save Reply Note' : 'Save Note & Mark Replied'}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete this contact form submission. This
                            action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
