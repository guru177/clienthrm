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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Plus,
    Search,
    MoreVertical,
    Pencil,
    Trash2,
    Eye,
    LayoutList,
    LayoutGrid,
    Calendar,
    User,
    Briefcase,
    ListTodo,
    RefreshCw,
} from 'lucide-react';
import { handleApiError, handleApiResponse } from '@/lib/toast';
import axios from '@/lib/axios';

interface Task {
    id: number;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    type: string;
    due_date: string | null;
    due_time: string | null;
    assigned_to: {
        id: number;
        name: string;
    } | null;
    created_by?: {
        id: number;
        name: string;
    };
    project?: {
        id: number;
        name: string;
    } | null;
    is_overdue: boolean;
    created_at: string;
}

const statusLabels: Record<string, string> = {
    todo: 'To Do',
    in_progress: 'In Progress',
    completed: 'Completed',
    on_hold: 'On Hold',
};

const priorityColors: Record<string, string> = {
    low: 'secondary',
    medium: 'default',
    high: 'destructive',
    urgent: 'destructive',
};

const typeLabels: Record<string, string> = {
    call: 'Call',
    email: 'Email',
    meeting: 'Meeting',
    follow_up: 'Follow Up',
    development: 'Development',
    other: 'Other',
};

export default function Index() {
    const navigate = useNavigate();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentView, setCurrentView] = useState<'list' | 'kanban'>('list');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [sortBy, setSortBy] = useState('created_at');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [perPage, setPerPage] = useState(15);
    const [total, setTotal] = useState(0);
    const [from, setFrom] = useState(0);
    const [to, setTo] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [lastPage, setLastPage] = useState(1);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [draggedTask, setDraggedTask] = useState<Task | null>(null);

    const breadcrumbs = [{ title: 'Tasks & Activities', href: '/admin/tasks' }];

    useEffect(() => {
        fetchTasks();
    }, [search, statusFilter, priorityFilter, sortBy, sortOrder, currentPage, perPage]);

    const fetchTasks = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/admin/tasks/list', {
                params: {
                    search: search || undefined,
                    status: statusFilter !== 'all' ? statusFilter : undefined,
                    priority: priorityFilter !== 'all' ? priorityFilter : undefined,
                    sort_by: sortBy,
                    sort_order: sortOrder,
                    page: currentPage,
                    per_page: perPage,
                },
            });
            if (response.data.success) {
                const resData = response.data.data;
                if (Array.isArray(resData)) {
                    setTasks(resData);
                    setTotal(resData.length);
                    setFrom(resData.length > 0 ? 1 : 0);
                    setTo(resData.length);
                    setLastPage(1);
                } else {
                    setTasks(resData.data || []);
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

    const handleDelete = async (task: Task) => {
        if (!confirm(`Are you sure you want to delete "${task.title}"? This action cannot be undone.`)) return;
        setDeletingId(task.id);
        try {
            const response = await axios.delete(`/admin/tasks/${task.id}`);
            handleApiResponse(response);
            fetchTasks();
        } catch (error) {
            handleApiError(error);
        } finally {
            setDeletingId(null);
        }
    };

    const handleStatusChange = async (taskId: number, newStatus: string) => {
        try {
            const response = await axios.post(`/admin/tasks/${taskId}/status`, { status: newStatus });
            handleApiResponse(response);
            fetchTasks();
        } catch (error) {
            handleApiError(error);
        }
    };

    const handleDrop = async (newStatus: string) => {
        if (!draggedTask || draggedTask.status === newStatus) {
            setDraggedTask(null);
            return;
        }
        await handleStatusChange(draggedTask.id, newStatus);
        setDraggedTask(null);
    };

    // Group tasks by status for kanban view
    const tasksByStatus = {
        todo: tasks.filter(t => t.status === 'todo'),
        in_progress: tasks.filter(t => t.status === 'in_progress'),
        completed: tasks.filter(t => t.status === 'completed'),
        on_hold: tasks.filter(t => t.status === 'on_hold'),
    };

    const renderKanbanView = () => {
        const columns = [
            { key: 'todo', label: 'To Do', color: 'bg-slate-50 dark:bg-slate-900' },
            { key: 'in_progress', label: 'In Progress', color: 'bg-blue-50 dark:bg-blue-950' },
            { key: 'completed', label: 'Completed', color: 'bg-green-50 dark:bg-green-950' },
            { key: 'on_hold', label: 'On Hold', color: 'bg-orange-50 dark:bg-orange-950' },
        ];

        return (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {columns.map((column) => (
                    <div
                        key={column.key}
                        className="flex flex-col"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop(column.key)}
                    >
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="font-semibold">{column.label}</h3>
                            <Badge variant="outline">
                                {(tasksByStatus as any)[column.key]?.length || 0}
                            </Badge>
                        </div>
                        <div className="space-y-3 rounded-lg border-2 border-dashed p-4 min-h-[500px]">
                            {((tasksByStatus as any)[column.key] || []).map((task: Task) => (
                                <Card
                                    key={task.id}
                                    draggable
                                    onDragStart={() => setDraggedTask(task)}
                                    className="cursor-move hover:shadow-md transition-shadow"
                                >
                                    <CardHeader className="pb-3">
                                        <div className="flex items-start justify-between">
                                            <CardTitle className="text-sm font-medium line-clamp-2">
                                                {task.title}
                                            </CardTitle>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => navigate(`/admin/tasks/${task.id}`)}>
                                                        <Eye className="mr-2 h-4 w-4" />View
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => navigate(`/admin/tasks/${task.id}/edit`)}>
                                                        <Pencil className="mr-2 h-4 w-4" />Edit
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => handleDelete(task)} className="text-destructive">
                                                        <Trash2 className="mr-2 h-4 w-4" />Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <Badge variant={(priorityColors[task.priority] || 'secondary') as any} className="text-xs">
                                                {task.priority}
                                            </Badge>
                                            <Badge variant="outline" className="text-xs">
                                                {typeLabels[task.type] || task.type}
                                            </Badge>
                                        </div>
                                        {task.assigned_to && (
                                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                <User className="h-3 w-3" />
                                                {task.assigned_to.name}
                                            </div>
                                        )}
                                        {task.project && (
                                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                <Briefcase className="h-3 w-3" />
                                                {task.project.name}
                                            </div>
                                        )}
                                        {task.due_date && (
                                            <div className={`flex items-center gap-1 text-xs ${task.is_overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                                                <Calendar className="h-3 w-3" />
                                                {new Date(task.due_date).toLocaleDateString()}
                                                {task.is_overdue && ' (Overdue)'}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderListView = () => (
        <>
            <div className="rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-12">#</TableHead>
                            <TableHead>Title</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Priority</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Assigned To</TableHead>
                            <TableHead>Project</TableHead>
                            <TableHead>Due Date</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={9} className="h-24 text-center">
                                    <div className="flex items-center justify-center">
                                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : tasks.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                                    No tasks found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            tasks.map((task) => (
                                <TableRow key={task.id}>
                                    <TableCell className="font-medium">#{task.id}</TableCell>
                                    <TableCell>
                                        <div>
                                            <div className="font-medium">{task.title}</div>
                                            {task.description && (
                                                <div className="text-sm text-muted-foreground line-clamp-1">
                                                    {task.description}
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{statusLabels[task.status] || task.status}</Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={(priorityColors[task.priority] || 'secondary') as any}>
                                            {task.priority}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{typeLabels[task.type] || task.type}</TableCell>
                                    <TableCell>{task.assigned_to?.name || 'Unassigned'}</TableCell>
                                    <TableCell>{task.project?.name || '-'}</TableCell>
                                    <TableCell>
                                        {task.due_date ? (
                                            <span className={task.is_overdue ? 'text-destructive' : ''}>
                                                {new Date(task.due_date).toLocaleDateString()}
                                                {task.is_overdue && ' (Overdue)'}
                                            </span>
                                        ) : '-'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="sm" disabled={deletingId === task.id}>
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => navigate(`/admin/tasks/${task.id}`)}>
                                                    <Eye className="mr-2 h-4 w-4" />View
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => navigate(`/admin/tasks/${task.id}/edit`)}>
                                                    <Pencil className="mr-2 h-4 w-4" />Edit
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onClick={() => handleDelete(task)} className="text-destructive">
                                                    <Trash2 className="mr-2 h-4 w-4" />Delete
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
                <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                        Showing {from} to {to} of {total} results
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}>
                            Previous
                        </Button>
                        <span className="text-sm px-2">Page {currentPage} of {lastPage}</span>
                        <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(lastPage, p + 1))} disabled={currentPage >= lastPage}>
                            Next
                        </Button>
                    </div>
                </div>
            )}
        </>
    );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>

            <div className="space-y-6">
                {/* Hero Header */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#e8f2fd] via-[#d0e4f8] to-[#c4d8f0] dark:from-[#0d1e33] dark:via-[#0a1828] dark:to-[#071220] px-6 py-5 shadow-sm border border-white/60 dark:border-white/10">
                    <div className="pointer-events-none absolute -top-10 -right-10 w-48 h-48 opacity-20">
                        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                            <path fill="#071b3a" d="M44.7,-76.4C58.4,-69.7,70.3,-58.6,77.9,-44.9C85.5,-31.2,88.7,-15.6,87.4,-0.8C86,14,80,28,72.1,40.5C64.2,53,54.2,64,42.1,71.3C30,78.6,15,82.3,0.1,82.1C-14.8,81.9,-29.6,77.8,-42.7,70.5C-55.8,63.2,-67.3,52.7,-74.5,39.5C-81.7,26.3,-84.7,10.5,-83.1,-4.9C-81.6,-20.3,-75.5,-35.2,-66.3,-47.4C-57.1,-59.6,-44.8,-69.1,-31.6,-76.1C-18.4,-83.1,-4.6,-87.6,8.2,-86.2C21,-84.8,31,-83.1,44.7,-76.4Z" transform="translate(100 100)" />
                        </svg>
                    </div>
                    <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#071b3a]/15 dark:bg-white/10 border border-[#071b3a]/20 dark:border-white/10 shadow-inner">
                                <ListTodo className="h-6 w-6 text-[#071b3a] dark:text-blue-300" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight text-[#001f3f] dark:text-white">
                                    Tasks & Activities
                                </h1>
                                <p className="text-sm text-[#1e3a5f]/60 dark:text-blue-200/60">
                                    Manage your tasks and track activities
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2 z-10 flex-wrap justify-end">
                            <Button
                                variant={currentView === 'list' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setCurrentView('list')}
                            >
                                <LayoutList className="mr-2 h-4 w-4" />List
                            </Button>
                            <Button
                                variant={currentView === 'kanban' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setCurrentView('kanban')}
                            >
                                <LayoutGrid className="mr-2 h-4 w-4" />Board
                            </Button>
                            <Link to="/admin/tasks/create">
                                <Button className="shrink-0 bg-gradient-to-r from-[#071b3a] to-[#0d4a8a] hover:from-[#040f22] hover:to-[#0a3272] text-white shadow-md shadow-blue-500/25 dark:shadow-blue-900/40 rounded-xl gap-2 h-9">
                                    <Plus className="h-4 w-4" />Create Task
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-col gap-4 md:flex-row md:items-center">
                    <div className="flex-1">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Search tasks..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    </div>
                    {currentView === 'list' && (
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-[150px]">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                {Object.entries(statusLabels).map(([value, label]) => (
                                    <SelectItem key={value} value={value}>{label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                        <SelectTrigger className="w-[150px]">
                            <SelectValue placeholder="Priority" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Priority</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="outline" size="icon" onClick={fetchTasks} title="Refresh">
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>

                {/* Content */}
                {currentView === 'kanban' ? renderKanbanView() : renderListView()}
            </div>
        </AppLayout>
    );
}
