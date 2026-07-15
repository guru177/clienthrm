import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppLayout from '@/layouts/app-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    ArrowLeft,
    Pencil,
    Trash2,
    Calendar,
    User,
    IndianRupee,
    AlertCircle,
    CheckCircle2,
    Users,
    ListTodo,
    Briefcase,
} from 'lucide-react';
import { handleApiError, handleApiResponse } from '@/lib/toast';
import axios from '@/lib/axios';
import { useConfirm } from '@/lib/confirm';

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
    created_by: {
        id: number;
        name: string;
    } | null;
    team_members: Array<{
        id: number;
        name: string;
        role: string;
    }>;
    tasks_count: number;
    is_overdue: boolean;
    is_on_track: boolean;
    created_at: string;
    updated_at: string;
}

interface Props {
    project?: Project;
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

export default function View({ project = {} as Project }: Props) {
    const confirm = useConfirm();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);

    const breadcrumbs = [
        { label: 'Projects', href: '/admin/projects' },
        { label: 'Project Details' },
    ];

    const handleDelete = async () => {
        if (
            !confirm(
                `Are you sure you want to delete "${project.name}"? This action cannot be undone.`,
            )
        ) {
            return;
        }

        setLoading(true);
        try {
            const response = await axios.delete(`/admin/projects/${project.id}`);
            handleApiResponse(response);
            navigate('/admin/projects');
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount: string | null) => {
        if (!amount) return 'N/A';
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
        }).format(parseFloat(amount));
    };

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
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
                                <div className="flex items-center gap-2">
                                    <h1 className="text-xl font-bold tracking-tight text-[#001f3f] dark:text-white">
                                        {project.name}
                                    </h1>
                                    <Badge variant="outline" className="bg-white/50 dark:bg-slate-800/50">
                                        Project #{project.id}
                                    </Badge>
                                </div>
                                <p className="text-sm text-[#1e3a5f]/60 dark:text-blue-200/60 flex items-center gap-2 mt-1">
                                    <Button
                                        variant="link"
                                        size="sm"
                                        className="h-auto p-0 text-[#1e3a5f]/60 dark:text-blue-200/60 hover:text-[#001f3f] dark:hover:text-white"
                                        onClick={() => navigate('/admin/projects')}
                                    >
                                        <ArrowLeft className="mr-1 h-3 w-3" />
                                        Back to Projects
                                    </Button>
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2 z-10">
                            <Link to={`/admin/projects/${project.id}/edit`}>
                                <Button variant="outline" className="bg-white/50 dark:bg-slate-800/50">
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit
                                </Button>
                            </Link>
                            <Button
                                variant="destructive"
                                onClick={handleDelete}
                                disabled={loading}
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Alerts */}
                <div className="space-y-2">
                    {project.is_overdue && (
                        <div className="flex items-center gap-2 rounded-lg border border-destructive bg-destructive/10 p-4 text-destructive">
                            <AlertCircle className="h-5 w-5" />
                            <p className="font-medium">
                                This project is overdue!
                            </p>
                        </div>
                    )}
                    {!project.is_on_track && !project.is_overdue && (
                        <div className="flex items-center gap-2 rounded-lg border border-orange-500 bg-orange-500/10 p-4 text-orange-600 dark:text-orange-400">
                            <AlertCircle className="h-5 w-5" />
                            <p className="font-medium">
                                This project is behind schedule
                            </p>
                        </div>
                    )}
                </div>

                <div className="grid gap-6 lg:grid-cols-3">
                    {/* Main Content */}
                    <div className="space-y-6 lg:col-span-2">
                        {/* Project Details */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Project Details</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {project.description && (
                                    <div>
                                        <h3 className="mb-2 font-semibold">
                                            Description
                                        </h3>
                                        <p className="whitespace-pre-wrap text-muted-foreground">
                                            {project.description}
                                        </p>
                                    </div>
                                )}

                                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                                    <div>
                                        <h3 className="mb-2 font-semibold">Status</h3>
                                        <Badge
                                            variant={
                                                statusColors[project.status] as any
                                            }
                                        >
                                            {statusLabels[project.status]}
                                        </Badge>
                                    </div>
                                    <div>
                                        <h3 className="mb-2 font-semibold">
                                            Priority
                                        </h3>
                                        <Badge
                                            variant={
                                                priorityColors[
                                                project.priority
                                                ] as any
                                            }
                                        >
                                            {project.priority}
                                        </Badge>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="mb-2 font-semibold">Progress</h3>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between text-sm">
                                            <span>
                                                {project.progress_percentage}%
                                                Complete
                                            </span>
                                            {project.is_on_track ? (
                                                <span className="flex items-center gap-1 text-green-600">
                                                    <CheckCircle2 className="h-4 w-4" />
                                                    On Track
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1 text-destructive">
                                                    <AlertCircle className="h-4 w-4" />
                                                    Behind Schedule
                                                </span>
                                            )}
                                        </div>
                                        <Progress
                                            value={project.progress_percentage}
                                            className="h-2"
                                        />
                                    </div>
                                </div>

                                <Separator />

                                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                                    {project.project_manager && (
                                        <div>
                                            <h3 className="mb-2 font-semibold">
                                                Project Manager
                                            </h3>
                                            <div className="flex items-center gap-2">
                                                <User className="h-4 w-4 text-muted-foreground" />
                                                <span className="text-muted-foreground">
                                                    {project.project_manager.name}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {(project.start_date || project.end_date) && (
                                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                                        {project.start_date && (
                                            <div>
                                                <h3 className="mb-2 font-semibold">
                                                    Start Date
                                                </h3>
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                                    <span className="text-muted-foreground">
                                                        {new Date(
                                                            project.start_date,
                                                        ).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                        {project.end_date && (
                                            <div>
                                                <h3 className="mb-2 font-semibold">
                                                    End Date
                                                </h3>
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                                    <span
                                                        className={
                                                            project.is_overdue
                                                                ? 'text-destructive'
                                                                : 'text-muted-foreground'
                                                        }
                                                    >
                                                        {new Date(
                                                            project.end_date,
                                                        ).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {(project.budget || project.actual_cost) && (
                                    <>
                                        <Separator />
                                        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                                            {project.budget && (
                                                <div>
                                                    <h3 className="mb-2 font-semibold">
                                                        Budget
                                                    </h3>
                                                    <div className="flex items-center gap-2">
                                                        <IndianRupee className="h-4 w-4 text-muted-foreground" />
                                                        <span className="text-muted-foreground">
                                                            {formatCurrency(
                                                                project.budget,
                                                            )}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                            {project.actual_cost && (
                                                <div>
                                                    <h3 className="mb-2 font-semibold">
                                                        Actual Cost
                                                    </h3>
                                                    <div className="flex items-center gap-2">
                                                        <IndianRupee className="h-4 w-4 text-muted-foreground" />
                                                        <span className="text-muted-foreground">
                                                            {formatCurrency(
                                                                project.actual_cost,
                                                            )}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}

                                <Separator />

                                <div className="grid gap-4 text-sm grid-cols-1 sm:grid-cols-2">
                                    <div>
                                        <h3 className="mb-1 font-semibold">
                                            Created By
                                        </h3>
                                        <p className="text-muted-foreground">
                                            {project.created_by?.name || 'Unknown'}
                                        </p>
                                    </div>
                                    <div>
                                        <h3 className="mb-1 font-semibold">
                                            Created At
                                        </h3>
                                        <p className="text-muted-foreground">
                                            {new Date(
                                                project.created_at,
                                            ).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Team Members */}
                        {project.team_members && project.team_members.length > 0 && (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Users className="h-5 w-5" />
                                        Team Members ({project.team_members.length})
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        {project.team_members.map((member) => (
                                            <div
                                                key={member.id}
                                                className="flex items-center justify-between rounded-lg border p-3"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <Avatar>
                                                        <AvatarFallback>
                                                            {getInitials(member.name)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <p className="font-medium">
                                                            {member.name}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {member.role}
                                                        </p>
                                                    </div>
                                                </div>
                                                <Badge variant="outline">
                                                    {member.role}
                                                </Badge>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Quick Actions</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <Link
                                    to={`/admin/projects/${project.id}/edit`}
                                    className="block"
                                >
                                    <Button variant="outline" className="w-full">
                                        <Pencil className="mr-2 h-4 w-4" />
                                        Edit Project
                                    </Button>
                                </Link>
                                <Button
                                    variant="destructive"
                                    className="w-full"
                                    onClick={handleDelete}
                                    disabled={loading}
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete Project
                                </Button>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Statistics</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <ListTodo className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm">Total Tasks</span>
                                    </div>
                                    <Badge variant="secondary">
                                        {project.tasks_count}
                                    </Badge>
                                </div>
                                <Separator />
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Users className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm">Team Size</span>
                                    </div>
                                    <Badge variant="secondary">
                                        {project.team_members?.length || 0}
                                    </Badge>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Activity Timeline</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3 text-sm">
                                    <div className="flex gap-2">
                                        <Calendar className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                            <p className="font-medium">Created</p>
                                            <p className="text-muted-foreground">
                                                {new Date(
                                                    project.created_at,
                                                ).toLocaleString()}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                by{' '}
                                                {project.created_by?.name ||
                                                    'Unknown'}
                                            </p>
                                        </div>
                                    </div>
                                    <Separator />
                                    <div className="flex gap-2">
                                        <Calendar className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                            <p className="font-medium">
                                                Last Updated
                                            </p>
                                            <p className="text-muted-foreground">
                                                {new Date(
                                                    project.updated_at,
                                                ).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}