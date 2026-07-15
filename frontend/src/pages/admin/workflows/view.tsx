import { Link, useNavigate, useParams } from 'react-router-dom';
import AppLayout from '@/layouts/app-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
    PlayCircle,
    PauseCircle,
    Copy,
    Trash2,
    Loader2,
} from 'lucide-react';
import { handleApiError, handleApiResponse } from '@/lib/toast';
import axios from '@/lib/axios';
import { useEffect, useState } from 'react';
import { useConfirm } from '@/lib/confirm';
import {
    actionsFromApi,
    conditionsFromApi,
    triggerLabel,
    actionLabel,
    type WorkflowAction,
    type TriggerCondition,
} from '@/lib/workflow-utils';

interface Workflow {
    id: number;
    name: string;
    description: string | null;
    trigger_type: string;
    trigger_conditions?: unknown;
    actions: WorkflowAction[];
    is_active: boolean;
    execution_count: number;
    last_executed_at: string | null;
    created_by?: {
        id: number;
        name: string;
    };
    created_at: string;
    updated_at: string;
}

interface WorkflowExecution {
    id: number;
    status: string;
    trigger_type: string;
    created_at: string;
    updated_at: string;
}

export default function View() {
    const confirm = useConfirm();
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const [workflow, setWorkflow] = useState<Workflow | null>(null);
    const [conditions, setConditions] = useState<TriggerCondition[]>([]);
    const [actions, setActions] = useState<WorkflowAction[]>([]);
    const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
    const [pageLoading, setPageLoading] = useState(true);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!id) return;
        let cancelled = false;

        void (async () => {
            setPageLoading(true);
            try {
                const [workflowRes, executionsRes] = await Promise.all([
                    axios.get(`/admin/workflows/${id}`),
                    axios.get(`/admin/workflows/${id}/executions`),
                ]);
                if (cancelled) return;
                const data = workflowRes.data.data;
                setWorkflow({
                    ...data,
                    actions: actionsFromApi(data.actions),
                });
                setConditions(conditionsFromApi(data.trigger_conditions));
                setActions(actionsFromApi(data.actions));
                setExecutions(executionsRes.data.data ?? []);
            } catch (error) {
                if (!cancelled) handleApiError(error);
            } finally {
                if (!cancelled) setPageLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [id]);

    const breadcrumbs = [
        { label: 'Workflows', href: '/admin/workflows' },
        { label: workflow?.name ?? 'Workflow' },
    ];

    const handleToggle = async () => {
        if (!workflow) return;
        setLoading(true);
        try {
            const response = await axios.post(`/admin/workflows/${workflow.id}/toggle`);
            handleApiResponse(response);
            const refreshed = await axios.get(`/admin/workflows/${workflow.id}`);
            const data = refreshed.data.data;
            setWorkflow({ ...data, actions: actionsFromApi(data.actions) });
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const handleDuplicate = async () => {
        if (!workflow) return;
        setLoading(true);
        try {
            const response = await axios.post(`/admin/workflows/${workflow.id}/duplicate`);
            handleApiResponse(response);
            navigate('/admin/workflows');
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!workflow) return;
        if (
            !confirm(
                `Are you sure you want to delete "${workflow.name}"? This action cannot be undone.`,
            )
        ) {
            return;
        }

        setLoading(true);
        try {
            const response = await axios.delete(`/admin/workflows/${workflow.id}`);
            handleApiResponse(response);
            navigate('/admin/workflows');
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const renderActionDetails = (action: WorkflowAction) => {
        const entries = Object.entries(action.config).filter(
            ([, value]) => value !== undefined && value !== '',
        );
        if (entries.length === 0) return 'No configuration';
        return entries.map(([key, value]) => `${key}: ${value}`).join(', ');
    };

    if (pageLoading) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            </AppLayout>
        );
    }

    if (!workflow) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                <div className="py-12 text-center text-muted-foreground">Workflow not found.</div>
            </AppLayout>
        );
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">{workflow.name}</h1>
                        <p className="text-muted-foreground">
                            {workflow.description || 'No description'}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => navigate('/admin/workflows')}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back
                        </Button>
                        <Link to={`/admin/workflows/${workflow.id}/edit`}>
                            <Button variant="outline">
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                            </Button>
                        </Link>
                        <Button variant="outline" onClick={handleToggle} disabled={loading}>
                            {workflow.is_active ? (
                                <>
                                    <PauseCircle className="mr-2 h-4 w-4" />
                                    Deactivate
                                </>
                            ) : (
                                <>
                                    <PlayCircle className="mr-2 h-4 w-4" />
                                    Activate
                                </>
                            )}
                        </Button>
                        <Button variant="outline" onClick={handleDuplicate} disabled={loading}>
                            <Copy className="mr-2 h-4 w-4" />
                            Duplicate
                        </Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={loading}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                        </Button>
                    </div>
                </div>

                <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    <Card>
                        <CardHeader>
                            <CardTitle>Status</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Badge
                                variant={workflow.is_active ? 'default' : 'secondary'}
                                className="text-lg"
                            >
                                {workflow.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Executions</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold">{workflow.execution_count}</div>
                            <p className="text-sm text-muted-foreground">Total runs</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Last Executed</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-lg font-medium">
                                {workflow.last_executed_at
                                    ? new Date(workflow.last_executed_at).toLocaleString()
                                    : 'Never'}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Trigger Configuration</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <span className="text-sm font-medium text-muted-foreground">
                                Trigger Type:
                            </span>
                            <div className="mt-1">
                                <Badge variant="outline">
                                    {triggerLabel(workflow.trigger_type)}
                                </Badge>
                            </div>
                        </div>
                        {conditions.length > 0 && (
                            <div>
                                <span className="text-sm font-medium text-muted-foreground">
                                    Conditions:
                                </span>
                                <ul className="mt-2 space-y-1 text-sm">
                                    {conditions.map((rule, i) => (
                                        <li key={i} className="font-mono">
                                            {rule.field} {rule.operator} {rule.value}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Actions ({actions.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>#</TableHead>
                                    <TableHead>Action Type</TableHead>
                                    <TableHead>Configuration</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {actions.map((action, index) => (
                                    <TableRow key={index}>
                                        <TableCell>{index + 1}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">
                                                {actionLabel(action.type)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="font-mono text-sm">
                                            {renderActionDetails(action)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Execution History ({executions.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {executions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No executions recorded yet.</p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>#</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Trigger</TableHead>
                                        <TableHead>Executed At</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {executions.map((row) => (
                                        <TableRow key={row.id}>
                                            <TableCell>{row.id}</TableCell>
                                            <TableCell>
                                                <Badge variant={row.status === 'completed' ? 'default' : 'secondary'}>
                                                    {row.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{triggerLabel(row.trigger_type)}</TableCell>
                                            <TableCell>
                                                {new Date(row.created_at).toLocaleString()}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Workflow Information</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                            <div>
                                <span className="text-sm font-medium text-muted-foreground">
                                    Created By
                                </span>
                                <p className="mt-1">{workflow.created_by?.name || 'Unknown'}</p>
                            </div>
                            <div>
                                <span className="text-sm font-medium text-muted-foreground">
                                    Created At
                                </span>
                                <p className="mt-1">
                                    {new Date(workflow.created_at).toLocaleString()}
                                </p>
                            </div>
                            <div>
                                <span className="text-sm font-medium text-muted-foreground">
                                    Last Updated
                                </span>
                                <p className="mt-1">
                                    {new Date(workflow.updated_at).toLocaleString()}
                                </p>
                            </div>
                            <div>
                                <span className="text-sm font-medium text-muted-foreground">
                                    Workflow ID
                                </span>
                                <p className="mt-1">#{workflow.id}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
