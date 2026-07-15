import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppLayout from '@/layouts/app-layout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
    ArrowLeft,
    Pencil,
    Trash2,
    Calendar,
    User,
    Clock,
    MessageSquare,
    AlertCircle,
    Briefcase,
    ListTodo,
} from 'lucide-react';
import { handleApiError, handleApiResponse } from '@/lib/toast';
import axios from '@/lib/axios';
import { useConfirm } from '@/lib/confirm';

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
    related_to: {
        type: string;
        name: string;
    } | null;
    is_overdue: boolean;
    comments: Comment[];
    created_at: string;
    updated_at: string;
}

interface Comment {
    id: number;
    comment: string;
    user?: {
        id: number;
        name: string;
    };
    created_at: string;
}

interface Props {
    task?: Task;
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

export default function View({ task = {} as Task }: Props) {
    const confirm = useConfirm();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [commentError, setCommentError] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);

    const breadcrumbs = [
        // { label: 'Dashboard', href: '/admin/dashboard' },
        { label: 'Tasks', href: '/admin/tasks' },
        { label: 'Task Details' },
    ];

    const handleDelete = async () => {
        if (
            !confirm(
                `Are you sure you want to delete "${task.title}"? This action cannot be undone.`,
            )
        ) {
            return;
        }

        setLoading(true);
        try {
            const response = await axios.delete(`/admin/tasks/${task.id}`);
            handleApiResponse(response);
            navigate('/admin/tasks');
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!commentText.trim()) {
            setCommentError('Comment cannot be empty');
            return;
        }

        setSubmittingComment(true);
        setCommentError('');

        try {
            const response = await axios.post(
                `/admin/tasks/${task.id}/comments`,
                { comment: commentText },
            );
            handleApiResponse(response);
            setCommentText('');
            window.location.reload();
        } catch (error: any) {
            if (error.response?.data?.errors?.comment) {
                setCommentError(error.response.data.errors.comment[0]);
            }
            handleApiError(error);
        } finally {
            setSubmittingComment(false);
        }
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
                                <ListTodo className="h-6 w-6 text-[#071b3a] dark:text-blue-300" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-xl font-bold tracking-tight text-[#001f3f] dark:text-white">
                                        {task.title}
                                    </h1>
                                    <Badge variant="outline" className="bg-white/50 dark:bg-slate-800/50">
                                        Task #{task.id}
                                    </Badge>
                                </div>
                                <p className="text-sm text-[#1e3a5f]/60 dark:text-blue-200/60 flex items-center gap-2 mt-1">
                                    <Button
                                        variant="link"
                                        size="sm"
                                        className="h-auto p-0 text-[#1e3a5f]/60 dark:text-blue-200/60 hover:text-[#001f3f] dark:hover:text-white"
                                        onClick={() => navigate('/admin/tasks')}
                                    >
                                        <ArrowLeft className="mr-1 h-3 w-3" />
                                        Back to Tasks
                                    </Button>
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2 z-10">
                            <Link to={`/admin/tasks/${task.id}/edit`}>
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

                {/* Overdue Alert */}
                {task.is_overdue && (
                    <div className="flex items-center gap-2 rounded-lg border border-destructive bg-destructive/10 p-4 text-destructive">
                        <AlertCircle className="h-5 w-5" />
                        <p className="font-medium">This task is overdue!</p>
                    </div>
                )}

                <div className="grid gap-6 lg:grid-cols-3">
                    {/* Main Content */}
                    <div className="space-y-6 lg:col-span-2">
                        {/* Task Details */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Task Details</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {task.description && (
                                    <div>
                                        <h3 className="mb-2 font-semibold">
                                            Description
                                        </h3>
                                        <p className="whitespace-pre-wrap text-muted-foreground">
                                            {task.description}
                                        </p>
                                    </div>
                                )}

                                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                                    <div>
                                        <h3 className="mb-2 font-semibold">Status</h3>
                                        <Badge variant="outline">
                                            {statusLabels[task.status]}
                                        </Badge>
                                    </div>
                                    <div>
                                        <h3 className="mb-2 font-semibold">
                                            Priority
                                        </h3>
                                        <Badge
                                            variant={
                                                priorityColors[task.priority] as any
                                            }
                                        >
                                            {task.priority}
                                        </Badge>
                                    </div>
                                    <div>
                                        <h3 className="mb-2 font-semibold">Type</h3>
                                        <p className="text-muted-foreground">
                                            {typeLabels[task.type]}
                                        </p>
                                    </div>
                                    <div>
                                        <h3 className="mb-2 font-semibold">
                                            Assigned To
                                        </h3>
                                        <div className="flex items-center gap-2">
                                            <User className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-muted-foreground">
                                                {task.assigned_to?.name ||
                                                    'Unassigned'}
                                            </span>
                                        </div>
                                    </div>
                                    {task.project && (
                                        <div>
                                            <h3 className="mb-2 font-semibold">
                                                Project
                                            </h3>
                                            <div className="flex items-center gap-2">
                                                <Briefcase className="h-4 w-4 text-muted-foreground" />
                                                <span className="text-muted-foreground">
                                                    {task.project.name}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {task.due_date && (
                                    <div>
                                        <h3 className="mb-2 font-semibold">
                                            Due Date
                                        </h3>
                                        <div className="flex items-center gap-2">
                                            <Calendar className="h-4 w-4 text-muted-foreground" />
                                            <span
                                                className={
                                                    task.is_overdue
                                                        ? 'text-destructive'
                                                        : 'text-muted-foreground'
                                                }
                                            >
                                                {new Date(
                                                    task.due_date,
                                                ).toLocaleDateString()}
                                                {task.due_time &&
                                                    ` at ${task.due_time}`}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {task.related_to && (
                                    <div>
                                        <h3 className="mb-2 font-semibold">
                                            Related To
                                        </h3>
                                        <p className="text-muted-foreground">
                                            {task.related_to.type}:{' '}
                                            {task.related_to.name}
                                        </p>
                                    </div>
                                )}

                                <Separator />

                                <div className="grid gap-4 text-sm grid-cols-1 sm:grid-cols-2">
                                    <div>
                                        <h3 className="mb-1 font-semibold">
                                            Created By
                                        </h3>
                                        <p className="text-muted-foreground">
                                            {task.created_by?.name || 'Unknown'}
                                        </p>
                                    </div>
                                    <div>
                                        <h3 className="mb-1 font-semibold">
                                            Created At
                                        </h3>
                                        <p className="text-muted-foreground">
                                            {new Date(
                                                task.created_at,
                                            ).toLocaleString()}
                                        </p>
                                    </div>
                                    <div>
                                        <h3 className="mb-1 font-semibold">
                                            Last Updated
                                        </h3>
                                        <p className="text-muted-foreground">
                                            {new Date(
                                                task.updated_at,
                                            ).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Comments Section */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <MessageSquare className="h-5 w-5" />
                                    Comments ({task.comments?.length || 0})
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Add Comment Form */}
                                <form
                                    onSubmit={handleAddComment}
                                    className="space-y-2"
                                >
                                    <Textarea
                                        placeholder="Add a comment..."
                                        value={commentText}
                                        onChange={(e) => {
                                            setCommentText(e.target.value);
                                            setCommentError('');
                                        }}
                                        rows={3}
                                    />
                                    {commentError && (
                                        <p className="text-sm text-destructive">
                                            {commentError}
                                        </p>
                                    )}
                                    <div className="flex justify-end">
                                        <Button
                                            type="submit"
                                            disabled={submittingComment}
                                        >
                                            {submittingComment
                                                ? 'Adding...'
                                                : 'Add Comment'}
                                        </Button>
                                    </div>
                                </form>

                                <Separator />

                                {/* Comments List */}
                                {task.comments && task.comments.length > 0 ? (
                                    <div className="space-y-4">
                                        {task.comments.map((comment) => (
                                            <div
                                                key={comment.id}
                                                className="flex gap-3"
                                            >
                                                <Avatar>
                                                    <AvatarFallback>
                                                        {comment.user?.name
                                                            ? getInitials(comment.user.name)
                                                            : 'UN'}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="flex-1 space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold">
                                                            {comment.user?.name || 'Unknown User'}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {new Date(
                                                                comment.created_at,
                                                            ).toLocaleString()}
                                                        </span>
                                                    </div>
                                                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                                                        {comment.comment}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-center text-sm text-muted-foreground">
                                        No comments yet. Be the first to comment!
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Quick Actions</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <Link
                                    to={`/admin/tasks/${task.id}/edit`}
                                    className="block"
                                >
                                    <Button variant="outline" className="w-full">
                                        <Pencil className="mr-2 h-4 w-4" />
                                        Edit Task
                                    </Button>
                                </Link>
                                <Button
                                    variant="destructive"
                                    className="w-full"
                                    onClick={handleDelete}
                                    disabled={loading}
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete Task
                                </Button>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Activity Timeline</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3 text-sm">
                                    <div className="flex gap-2">
                                        <Clock className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                            <p className="font-medium">Created</p>
                                            <p className="text-muted-foreground">
                                                {new Date(
                                                    task.created_at,
                                                ).toLocaleString()}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                by {task.created_by?.name || 'Unknown'}
                                            </p>
                                        </div>
                                    </div>
                                    <Separator />
                                    <div className="flex gap-2">
                                        <Clock className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                            <p className="font-medium">
                                                Last Updated
                                            </p>
                                            <p className="text-muted-foreground">
                                                {new Date(
                                                    task.updated_at,
                                                ).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                    {task.comments && task.comments.length > 0 && (
                                        <>
                                            <Separator />
                                            <div className="flex gap-2">
                                                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                                                <div>
                                                    <p className="font-medium">
                                                        Last Comment
                                                    </p>
                                                    <p className="text-muted-foreground">
                                                        {new Date(
                                                            task.comments[
                                                                task.comments
                                                                    .length - 1
                                                            ].created_at,
                                                        ).toLocaleString()}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        by{' '}
                                                        {
                                                            task.comments[
                                                                task.comments
                                                                    .length - 1
                                                            ].user?.name || 'Unknown User'
                                                        }
                                                    </p>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}