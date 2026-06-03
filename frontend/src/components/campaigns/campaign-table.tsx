import { useNavigate } from 'react-router-dom';
import axios from '@/lib/axios';
import {
    MoreVertical,
    Pencil,
    Trash2,
    Copy,
    ExternalLink,
    QrCode,
    Search,
    RefreshCw,
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
import { handleApiResponse, handleApiError, showToast } from '@/lib/toast';

interface Campaign {
    id: number;
    name: string;
    description?: string;
    status: string;
    slug: string;
    is_public: boolean;
    leads_count: number;
    creator?: {
        id: number;
        name: string;
    };
    created_at: string;
}

interface CampaignTableProps {
    onRefresh?: () => void;
}

export default function CampaignTable({ onRefresh }: CampaignTableProps) {
    const navigate = useNavigate();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [perPage, setPerPage] = useState(10);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [sortBy, setSortBy] = useState('created_at');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);

    const fetchCampaigns = async () => {
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

            const response = await axios.get('/admin/campaigns/list', { params });

            if (response.data.success) {
                setCampaigns(Array.isArray(response.data.data) ? response.data.data : (response.data.data?.data || []));
                setCurrentPage((Array.isArray(response.data.data) ? 1 : response.data.data?.current_page) || 1);
                setTotalPages((Array.isArray(response.data.data) ? 1 : response.data.data?.last_page) || 1);
                setTotal((Array.isArray(response.data.data) ? response.data.data.length : response.data.data?.total) || 0);
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
            fetchCampaigns();
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

    const getPublicUrl = (slug: string) => {
        return `${window.location.origin}/campaigns/${slug}`;
    };

    const handleCopyPublicUrl = (slug: string) => {
        const url = getPublicUrl(slug);
        navigator.clipboard.writeText(url);
        showToast({
            type: 'success',
            message: 'Public URL copied to clipboard',
        });
    };

    const handleOpenPublicUrl = (slug: string) => {
        const url = getPublicUrl(slug);
        window.open(url, '_blank');
    };

    const handleDownloadQRCode = async (campaign: Campaign) => {
        try {
            const url = getPublicUrl(campaign.slug);
            // Using a simple QR code API service
            const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`;

            // Download the QR code
            const response = await fetch(qrCodeUrl);
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = `${campaign.slug}-qr-code.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(downloadUrl);

            showToast({
                type: 'success',
                message: 'QR Code downloaded successfully',
            });
        } catch (error) {
            showToast({
                type: 'error',
                message: 'Failed to download QR code',
            });
        }
    };

    const handleDelete = async () => {
        if (!deleteId) return;

        setDeleting(true);
        try {
            const response = await axios.delete(`/admin/campaigns/${deleteId}`);
            handleApiResponse(response);
            setDeleteId(null);
            fetchCampaigns();
            onRefresh?.();
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
            draft: { variant: 'secondary', label: 'Draft' },
            active: { variant: 'success', label: 'Active' },
            paused: { variant: 'warning', label: 'Paused' },
            completed: { variant: 'default', label: 'Completed' },
        };

        const config = variants[status] || variants.draft;
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
                        <CardTitle>All Campaigns</CardTitle>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            {/* Search */}
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search campaigns..."
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
                                    <SelectItem value="draft">Draft</SelectItem>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="paused">Paused</SelectItem>
                                    <SelectItem value="completed">Completed</SelectItem>
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
                                onClick={fetchCampaigns}
                                disabled={loading}
                                title="Refresh campaigns"
                            >
                                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="relative rounded-md border">
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
                                        <div className="flex items-center gap-1">
                                            ID
                                            <SortIcon column="id" />
                                        </div>
                                    </TableHead>
                                    <TableHead
                                        className="hover:bg-muted/50 cursor-pointer select-none"
                                        onClick={() => handleSort('name')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Name
                                            <SortIcon column="name" />
                                        </div>
                                    </TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead
                                        className="hover:bg-muted/50 cursor-pointer select-none"
                                        onClick={() => handleSort('status')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Status
                                            <SortIcon column="status" />
                                        </div>
                                    </TableHead>
                                    <TableHead>Visibility</TableHead>
                                    <TableHead
                                        className="hover:bg-muted/50 cursor-pointer select-none"
                                        onClick={() => handleSort('leads_count')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Leads
                                            <SortIcon column="leads_count" />
                                        </div>
                                    </TableHead>
                                    <TableHead
                                        className="hover:bg-muted/50 cursor-pointer select-none"
                                        onClick={() => handleSort('created_at')}
                                    >
                                        <div className="flex items-center gap-1">
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
                                            Loading campaigns...
                                        </TableCell>
                                    </TableRow>
                                ) : campaigns.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={8}
                                            className="text-center py-8 text-muted-foreground"
                                        >
                                            No campaigns found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    campaigns.map((campaign) => (
                                        <TableRow key={campaign.id}>
                                            <TableCell className="font-medium text-muted-foreground">
                                                {campaign.id}
                                            </TableCell>
                                            <TableCell>
                                                <div>
                                                    <div className="font-medium">
                                                        {campaign.name}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {campaign.slug}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                                                {campaign.description || 'â€”'}
                                            </TableCell>
                                            <TableCell>
                                                {getStatusBadge(campaign.status)}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant={
                                                        campaign.is_public
                                                            ? 'default'
                                                            : 'outline'
                                                    }
                                                >
                                                    {campaign.is_public ? 'Public' : 'Private'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {campaign.leads_count}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {new Date(
                                                    campaign.created_at,
                                                ).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
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
                                                        {campaign.is_public && (
                                                            <>
                                                                <DropdownMenuItem
                                                                    onClick={() =>
                                                                        handleCopyPublicUrl(
                                                                            campaign.slug,
                                                                        )
                                                                    }
                                                                >
                                                                    <Copy className="mr-2 h-4 w-4" />
                                                                    Copy Public URL
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    onClick={() =>
                                                                        handleOpenPublicUrl(
                                                                            campaign.slug,
                                                                        )
                                                                    }
                                                                >
                                                                    <ExternalLink className="mr-2 h-4 w-4" />
                                                                    Open Public URL
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    onClick={() =>
                                                                        handleDownloadQRCode(
                                                                            campaign,
                                                                        )
                                                                    }
                                                                >
                                                                    <QrCode className="mr-2 h-4 w-4" />
                                                                    Download QR Code
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                            </>
                                                        )}
                                                        <DropdownMenuItem
                                                            onClick={() =>
                                                                navigate(
                                                                    `/admin/campaigns/${campaign.id}/edit`,
                                                                )
                                                            }
                                                        >
                                                            <Pencil className="mr-2 h-4 w-4" />
                                                            Edit
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() =>
                                                                setDeleteId(campaign.id)
                                                            }
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
                    {!loading && campaigns.length > 0 && (
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-4 border-t">
                            {/* Results info */}
                            <div className="text-sm text-muted-foreground">
                                Showing{' '}
                                <span className="font-medium">
                                    {(currentPage - 1) * perPage + 1}
                                </span>{' '}
                                to{' '}
                                <span className="font-medium">
                                    {Math.min(currentPage * perPage, total || campaigns.length)}
                                </span>{' '}
                                of <span className="font-medium">{total || campaigns.length}</span>{' '}
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
                open={deleteId !== null}
                onOpenChange={(open) => !open && setDeleteId(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this campaign? This
                            action cannot be undone and will fail if the
                            campaign has existing leads.
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
            </AlertDialog>
        </>
    );
}
