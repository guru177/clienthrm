import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppLayout from '@/layouts/app-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
    Plus,
    Search,
    MoreVertical,
    Pencil,
    Trash2,
    Eye,
    User,
    Calendar,
    AlertCircle,
    Briefcase,
    RefreshCw,
} from 'lucide-react';
import { handleApiError, handleApiResponse } from '@/lib/toast';
import axios from '@/lib/axios';

interface Project {
    id: number;
    name: string;
    description: string | null;
    status: string;
    priority: string;
    start_date: string | null;
    end_date: string | null;
    budget: string | null;
    actual_cost: string | null;
    progress_percentage: number;
    project_manager: {
        id: number;
        name: string;
    } | null;
    tasks_count: number;
    is_overdue: boolean;
    is_on_track: boolean;
    created_at: string;
}

const statusLabels: Record<string, string> = {
    planning: 'Planning',
    in_progress: 'In Progress',
    on_hold: 'On Hold',
    completed: 'Completed',
    cancelled: 'Cancelled',
};

const statusColors: Record<string, string> = {
    planning: 'secondary',
    in_progress: 'default',
    on_hold: 'outline',
    completed: 'default',
    cancelled: 'destructive',
};

const priorityColors: Record<string, string> = {
    low: 'secondary',
    medium: 'default',
    high: 'destructive',
    urgent: 'destructive',
};

export default function Index() {
    const navigate = useNavigate();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [priority, setPriority] = useState('');
    const [sortBy, setSortBy] = useState('created_at');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [currentPage, setCurrentPage] = useState(1);
    const [lastPage, setLastPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [from, setFrom] = useState(0);
    const [to, setTo] = useState(0);
    const [perPage, setPerPage] = useState(15);

    const breadcrumbs = [{ title: 'Projects', href: '/admin/projects' }];

    useEffect(() => {
        fetchProjects();
    }, [search, status, priority, sortBy, sortOrder, currentPage, perPage]);

    const fetchProjects = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/admin/projects/list', {
                params: {
                    search: search || undefined,
                    status: status || undefined,
                    priority: priority || undefined,
                    sort_by: sortBy,
                    sort_order: sortOrder,
                    page: currentPage,
                    per_page: perPage,
                },
            });
            if (response.data.success) {
                const resData = response.data.data;
                if (Array.isArray(resData)) {
                    setProjects(resData);
                    setTotal(resData.length);
                    setFrom(resData.length > 0 ? 1 : 0);
                    setTo(resData.length);
                    setLastPage(1);
                } else {
                    setProjects(resData.data || []);
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

    const handleDelete = async (project: Project) => {
        if (
            !confirm(
                `Are you sure you want to delete "${project.name}"? This action cannot be undone.`,
            )
        ) {
            return;
        }

        try {
            const response = await axios.delete(`/admin/projects/${project.id}`);
            handleApiResponse(response);
            fetchProjects();
        } catch (error) {
            handleApiError(error);
        }
    };

    const formatCurrency = (amount: string | null) => {
        if (!amount) return 'N/A';
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
        }).format(parseFloat(amount));
    };

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
                                <Briefcase className="h-6 w-6 text-[#071b3a] dark:text-blue-300" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight text-[#001f3f] dark:text-white">
                                    Projects
                                </h1>
                                <p className="text-sm text-[#1e3a5f]/60 dark:text-blue-200/60">
                                    Manage your projects and track progress
                                </p>
                            </div>
                        </div>
                        <Link to="/admin/projects/create">
                            <Button className="shrink-0 bg-gradient-to-r from-[#071b3a] to-[#0d4a8a] hover:from-[#040f22] hover:to-[#0a3272] text-white shadow-md shadow-blue-500/25 dark:shadow-blue-900/40 rounded-xl gap-2 z-10">
                                <Plus className="h-4 w-4" />
                                New Project
                            </Button>
                        </Link>
                    </div>
                </div>

                {/* Filters */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
                            <div className="lg:col-span-2">
                                <div className="relative">
                                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search projects..."
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        className="pl-8"
                                    />
                                </div>
                            </div>
                            <Select value={status || 'all'} onValueChange={(value) => setStatus(value === 'all' ? '' : value)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="All Statuses" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Statuses</SelectItem>
                                    <SelectItem value="planning">Planning</SelectItem>
                                    <SelectItem value="in_progress">In Progress</SelectItem>
                                    <SelectItem value="on_hold">On Hold</SelectItem>
                                    <SelectItem value="completed">Completed</SelectItem>
                                    <SelectItem value="cancelled">Cancelled</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={priority || 'all'} onValueChange={(value) => setPriority(value === 'all' ? '' : value)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="All Priorities" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Priorities</SelectItem>
                                    <SelectItem value="low">Low</SelectItem>
                                    <SelectItem value="medium">Medium</SelectItem>
                                    <SelectItem value="high">High</SelectItem>
                                    <SelectItem value="urgent">Urgent</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button variant="outline" size="icon" onClick={fetchProjects} title="Refresh">
                                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Table */}
                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
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
                                        <TableHead>Status</TableHead>
                                        <TableHead>Priority</TableHead>
                                        <TableHead>Progress</TableHead>
                                        <TableHead>Manager</TableHead>
                                        <TableHead>Tasks</TableHead>
                                        <TableHead>Budget</TableHead>
                                        <TableHead
                                            className="hover:bg-muted/50 cursor-pointer select-none"
                                            onClick={() => handleSort('end_date')}
                                        >
                                            <div className="flex items-center gap-1">
                                                End Date
                                                {sortBy === 'end_date' && (
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
                                            <TableCell colSpan={10} className="h-24 text-center">
                                                <div className="flex items-center justify-center">
                                                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : projects.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                                                No projects found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        projects.map((project) => (
                                            <TableRow key={project.id}>
                                                <TableCell className="font-medium">
                                                    {project.id}
                                                </TableCell>
                                                <TableCell>
                                                    <div>
                                                        <div className="font-medium">
                                                            {project.name}
                                                        </div>
                                                        {project.is_overdue && (
                                                            <Badge variant="destructive" className="mt-1">
                                                                <AlertCircle className="mr-1 h-3 w-3" />
                                                                Overdue
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={(statusColors[project.status] || 'secondary') as any}>
                                                        {statusLabels[project.status] || project.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={(priorityColors[project.priority] || 'secondary') as any}>
                                                        {project.priority}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="w-24">
                                                        <div className="mb-1 flex items-center justify-between text-xs">
                                                            <span>{project.progress_percentage}%</span>
                                                            {!project.is_on_track && (
                                                                <span className="text-destructive">Behind</span>
                                                            )}
                                                        </div>
                                                        <Progress value={project.progress_percentage} className="h-2" />
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    {project.project_manager ? (
                                                        <div className="flex items-center gap-1">
                                                            <User className="h-3 w-3 text-muted-foreground" />
                                                            {project.project_manager.name}
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted-foreground">Unassigned</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">{project.tasks_count} tasks</Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-xs">
                                                        <div>{formatCurrency(project.budget)}</div>
                                                        {project.actual_cost && (
                                                            <div className="text-muted-foreground">
                                                                Spent: {formatCurrency(project.actual_cost)}
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    {project.end_date ? (
                                                        <div className="flex items-center gap-1 text-xs">
                                                            <Calendar className="h-3 w-3 text-muted-foreground" />
                                                            {new Date(project.end_date).toLocaleDateString()}
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted-foreground">N/A</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="sm">
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem onClick={() => navigate(`/admin/projects/${project.id}`)}>
                                                                <Eye className="mr-2 h-4 w-4" />
                                                                View
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => navigate(`/admin/projects/${project.id}/edit`)}>
                                                                <Pencil className="mr-2 h-4 w-4" />
                                                                Edit
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                onClick={() => handleDelete(project)}
                                                                className="text-destructive focus:text-destructive"
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
                        {total > 0 && (
                            <div className="flex items-center justify-between border-t px-6 py-4">
                                <div className="text-sm text-muted-foreground">
                                    Showing {from} to {to} of {total} results
                                </div>
                                <div className="flex items-center gap-2">
                                    <Select
                                        value={perPage.toString()}
                                        onValueChange={(value) => {
                                            setPerPage(parseInt(value));
                                            setCurrentPage(1);
                                        }}
                                    >
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
                                    <div className="flex gap-1">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                            disabled={currentPage === 1}
                                        >
                                            Previous
                                        </Button>
                                        <span className="text-sm px-3 py-1">
                                            Page {currentPage} of {lastPage}
                                        </span>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage((p) => Math.min(lastPage, p + 1))}
                                            disabled={currentPage === lastPage}
                                        >
                                            Next
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
