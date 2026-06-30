import axios from '@/lib/axios';
// Inertia removed
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
    ToggleLeft,
    ToggleRight,
    Eye,
    Users,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

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

interface Career {
    id: number;
    title: string;
    slug: string;
    location: string;
    job_type: string;
    experience_required: string | null;
    description: string;
    requirements: string[] | null;
    responsibilities: string[] | null;
    salary_range: string | null;
    is_active: boolean;
    posted_at: string | null;
    applications_count?: number;
    created_at: string;
    updated_at: string;
}

interface CareerTableProps {
    onEdit: (career: Career) => void;
    onRefresh?: () => void;
    reloadTrigger?: number;
}

export default function CareerTable({ onEdit, onRefresh, reloadTrigger = 0 }: CareerTableProps) {
    const [careers, setCareers] = useState<Career[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [jobTypeFilter, setJobTypeFilter] = useState('all');
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
    const [toggleStatusId, setToggleStatusId] = useState<number | null>(null);

    useEffect(() => {
        fetchCareers();
    }, [search, jobTypeFilter, statusFilter, currentPage, perPage, sortBy, sortOrder, reloadTrigger]);

    const fetchCareers = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/admin/careers/list', {
                params: {
                    search,
                    job_type: jobTypeFilter !== 'all' ? jobTypeFilter : undefined,
                    is_active: statusFilter !== 'all' ? statusFilter : undefined,
                    page: currentPage,
                    per_page: perPage,
                    sort_by: sortBy,
                    sort_order: sortOrder,
                },
            });

            if (response.data.success) {
                const resData = response.data.data;
                if (Array.isArray(resData)) {
                    setCareers(resData);
                    setTotal(resData.length);
                    setFrom(resData.length > 0 ? 1 : 0);
                    setTo(resData.length);
                    setLastPage(1);
                    setCurrentPage(1);
                } else {
                    setCareers(resData.data || []);
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
            const response = await axios.delete(`/admin/careers/${deleteId}`);
            handleApiResponse(response);
            setDeleteId(null);
            await fetchCareers();
            onRefresh?.();
        } catch (error) {
            handleApiError(error);
        } finally {
            setDeleting(false);
        }
    };

    const handleToggleStatus = async (careerId: number) => {
        setToggleStatusId(careerId);
        try {
            const response = await axios.post(`/admin/careers/${careerId}/toggle-status`);
            handleApiResponse(response);
            await fetchCareers();
            onRefresh?.();
        } catch (error) {
            handleApiError(error);
        } finally {
            setToggleStatusId(null);
        }
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <CardTitle>Job Postings</CardTitle>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            {/* Search */}
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search careers..."
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                    className="pl-8"
                                />
                            </div>

                            {/* Job Type Filter */}
                            <Select
                                value={jobTypeFilter}
                                onValueChange={(value) => {
                                    setJobTypeFilter(value);
                                    setCurrentPage(1);
                                }}
                            >
                                <SelectTrigger className="w-full sm:w-40">
                                    <SelectValue placeholder="Job Type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Types</SelectItem>
                                    <SelectItem value="Full-time">Full-time</SelectItem>
                                    <SelectItem value="Part-time">Part-time</SelectItem>
                                    <SelectItem value="Contract">Contract</SelectItem>
                                    <SelectItem value="Freelance">Freelance</SelectItem>
                                    <SelectItem value="Internship">Internship</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Status Filter */}
                            <Select
                                value={statusFilter}
                                onValueChange={(value) => {
                                    setStatusFilter(value);
                                    setCurrentPage(1);
                                }}
                            >
                                <SelectTrigger className="w-full sm:w-32">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="1">Active</SelectItem>
                                    <SelectItem value="0">Inactive</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Refresh Button */}
                            <Button variant="outline" size="icon" onClick={fetchCareers}>
                                <RefreshCw
                                    className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
                                />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
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
                                        onClick={() => handleSort('title')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Title
                                            {sortBy === 'title' && (
                                                <span className="text-xs">
                                                    {sortOrder === 'asc' ? '↑' : '↓'}
                                                </span>
                                            )}
                                        </div>
                                    </TableHead>
                                    <TableHead>Location</TableHead>
                                    <TableHead>Job Type</TableHead>
                                    <TableHead>Experience</TableHead>
                                    <TableHead>Applications</TableHead>
                                    <TableHead
                                        className="hover:bg-muted/50 cursor-pointer select-none"
                                        onClick={() => handleSort('is_active')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Status
                                            {sortBy === 'is_active' && (
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
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="text-center">
                                            Loading...
                                        </TableCell>
                                    </TableRow>
                                ) : careers.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="text-center">
                                            No job postings found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    careers.map((career) => (
                                        <TableRow key={career.id}>
                                            <TableCell className="font-medium">
                                                {career.id}
                                            </TableCell>
                                            <TableCell>
                                                <div className="max-w-[300px]">
                                                    <div className="font-medium">
                                                        {career.title}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>{career.location}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline">
                                                    {career.job_type}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {career.experience_required || 'N/A'}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary">
                                                    {career.applications_count || 0}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant={
                                                        career.is_active
                                                            ? 'default'
                                                            : 'secondary'
                                                    }
                                                >
                                                    {career.is_active ? 'Active' : 'Inactive'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {new Date(
                                                    career.created_at,
                                                ).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            className="h-8 w-8 p-0"
                                                        >
                                                            <span className="sr-only">
                                                                Open menu
                                                            </span>
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>
                                                            Actions
                                                        </DropdownMenuLabel>
                                                        <DropdownMenuItem
                                                            onClick={() => onEdit(career)}
                                                        >
                                                            <Pencil className="mr-2 h-4 w-4" />
                                                            Edit
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem asChild>
                                                            <Link
                                                                to={`/admin/job-applications?career_id=${career.id}`}
                                                                className="flex items-center"
                                                            >
                                                                <Users className="mr-2 h-4 w-4" />
                                                                View Applications ({career.applications_count || 0})
                                                            </Link>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            onClick={() =>
                                                                handleToggleStatus(career.id)
                                                            }
                                                            disabled={
                                                                toggleStatusId === career.id
                                                            }
                                                        >
                                                            {career.is_active ? (
                                                                <>
                                                                    <ToggleLeft className="mr-2 h-4 w-4" />
                                                                    Deactivate
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <ToggleRight className="mr-2 h-4 w-4" />
                                                                    Activate
                                                                </>
                                                            )}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            onClick={() => setDeleteId(career.id)}
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
                    <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                            <p className="text-sm text-muted-foreground">
                                Showing {from} to {to} of {total} results
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <Select
                                value={perPage.toString()}
                                onValueChange={(value) => {
                                    setPerPage(Number(value));
                                    setCurrentPage(1);
                                }}
                            >
                                <SelectTrigger className="w-32">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10">10 per page</SelectItem>
                                    <SelectItem value="25">25 per page</SelectItem>
                                    <SelectItem value="50">50 per page</SelectItem>
                                    <SelectItem value="100">100 per page</SelectItem>
                                </SelectContent>
                            </Select>

                            <div className="flex items-center gap-1">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setCurrentPage(1)}
                                    disabled={currentPage === 1}
                                >
                                    <ChevronsLeft className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <span className="px-4 text-sm">
                                    Page {currentPage} of {lastPage}
                                </span>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() =>
                                        setCurrentPage((prev) => Math.min(lastPage, prev + 1))
                                    }
                                    disabled={currentPage === lastPage}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setCurrentPage(lastPage)}
                                    disabled={currentPage === lastPage}
                                >
                                    <ChevronsRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the job
                            posting and all its applications.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={deleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleting ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
