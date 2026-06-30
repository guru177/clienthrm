import { useState, FormEvent, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppLayout from '@/layouts/app-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, ArrowLeft, Network, Loader2 } from 'lucide-react';
import { handleApiError, handleApiResponse } from '@/lib/toast';
import axios from '@/lib/axios';
import {
    SUPPORTED_TRIGGERS,
    SUPPORTED_ACTIONS,
    CONDITION_FIELDS,
    CONDITION_OPERATORS,
    actionsFromApi,
    conditionsFromApi,
    conditionsToApi,
    type WorkflowAction,
    type TriggerCondition,
} from '@/lib/workflow-utils';

export default function Edit() {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const [pageLoading, setPageLoading] = useState(true);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [triggerType, setTriggerType] = useState('');
    const [conditions, setConditions] = useState<TriggerCondition[]>([]);
    const [actions, setActions] = useState<WorkflowAction[]>([{ type: '', config: {} }]);
    const [isActive, setIsActive] = useState(true);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});

    const breadcrumbs = [
        { label: 'Dashboard', href: '/admin/dashboard' },
        { label: 'Workflows', href: '/admin/workflows' },
        { label: 'Edit Workflow' },
    ];

    useEffect(() => {
        if (!id) return;
        let cancelled = false;

        void (async () => {
            setPageLoading(true);
            try {
                const response = await axios.get(`/admin/workflows/${id}`);
                if (cancelled) return;
                const data = response.data.data;
                setName(data.name ?? '');
                setDescription(data.description ?? '');
                setTriggerType(data.trigger_type ?? '');
                setConditions(conditionsFromApi(data.trigger_conditions));
                const parsed = actionsFromApi(data.actions);
                setActions(parsed.length > 0 ? parsed : [{ type: '', config: {} }]);
                setIsActive(Boolean(data.is_active));
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

    const addAction = () => {
        setActions([...actions, { type: '', config: {} }]);
    };

    const removeAction = (index: number) => {
        setActions(actions.filter((_, i) => i !== index));
    };

    const addCondition = () => {
        setConditions([...conditions, { field: '', operator: 'equals', value: '' }]);
    };

    const removeCondition = (index: number) => {
        setConditions(conditions.filter((_, i) => i !== index));
    };

    const updateCondition = (
        index: number,
        field: keyof TriggerCondition,
        value: string,
    ) => {
        const next = [...conditions];
        next[index] = { ...next[index], [field]: value };
        setConditions(next);
    };

    const updateAction = (
        index: number,
        field: 'type' | 'config',
        value: WorkflowAction['type'] | WorkflowAction['config'],
    ) => {
        const newActions = [...actions];
        if (field === 'type') {
            newActions[index].type = value as string;
            newActions[index].config = {};
        } else {
            newActions[index].config = value as WorkflowAction['config'];
        }
        setActions(newActions);
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!id) return;
        setLoading(true);
        setErrors({});

        try {
            const response = await axios.put(`/admin/workflows/${id}`, {
                name,
                description,
                trigger_type: triggerType,
                trigger_conditions: conditionsToApi(conditions),
                actions,
                is_active: isActive,
            });

            handleApiResponse(response);
            navigate('/admin/workflows');
        } catch (error: unknown) {
            const err = error as { response?: { data?: { errors?: Record<string, string[]> } } };
            if (err.response?.data?.errors) {
                setErrors(err.response.data.errors);
            }
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const renderActionConfig = (action: WorkflowAction, index: number) => {
        switch (action.type) {
            case 'create_task':
                return (
                    <div className="space-y-3">
                        <div>
                            <Label>Task Title</Label>
                            <Input
                                value={String(action.config.title ?? '')}
                                onChange={(e) =>
                                    updateAction(index, 'config', {
                                        ...action.config,
                                        title: e.target.value,
                                    })
                                }
                            />
                        </div>
                        <div>
                            <Label>Due Date (days from now)</Label>
                            <Input
                                type="number"
                                value={String(action.config.due_days ?? '')}
                                onChange={(e) =>
                                    updateAction(index, 'config', {
                                        ...action.config,
                                        due_days: e.target.value,
                                    })
                                }
                            />
                        </div>
                    </div>
                );
            case 'send_notification':
                return (
                    <div>
                        <Label>Notification Message</Label>
                        <Textarea
                            value={String(action.config.message ?? '')}
                            onChange={(e) =>
                                updateAction(index, 'config', {
                                    ...action.config,
                                    message: e.target.value,
                                })
                            }
                        />
                    </div>
                );
            default:
                return null;
        }
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

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <div className="space-y-6">
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#e8f2fd] via-[#d0e4f8] to-[#c4d8f0] dark:from-[#0d1e33] dark:via-[#0a1828] dark:to-[#071220] px-4 sm:px-6 py-4 sm:py-5 border border-white/60 dark:border-white/10 shadow-sm">
                    <div className="relative flex items-center gap-4">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => navigate('/admin/workflows')}
                            className="h-10 w-10 shrink-0 rounded-xl"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-[#071b3a]/15 dark:bg-white/10">
                            <Network className="h-5 w-5 sm:h-6 sm:w-6 text-[#071b3a] dark:text-blue-300" />
                        </div>
                        <div>
                            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[#001f3f] dark:text-white">
                                Edit Workflow
                            </h1>
                            <p className="text-sm text-[#1e3a5f]/60 dark:text-blue-200/60">
                                Update workflow configuration
                            </p>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Basic Information</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label htmlFor="name">
                                    Workflow Name{' '}
                                    <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                                {errors.name && (
                                    <p className="mt-1 text-sm text-destructive">
                                        {errors.name[0]}
                                    </p>
                                )}
                            </div>
                            <div>
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={3}
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <Label htmlFor="is_active">Active Status</Label>
                                </div>
                                <Switch
                                    id="is_active"
                                    checked={isActive}
                                    onCheckedChange={setIsActive}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Trigger</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Label htmlFor="trigger_type">Trigger event</Label>
                            <Select value={triggerType} onValueChange={setTriggerType}>
                                <SelectTrigger id="trigger_type" className="mt-2">
                                    <SelectValue placeholder="Select a trigger" />
                                </SelectTrigger>
                                <SelectContent>
                                    {SUPPORTED_TRIGGERS.map((trigger) => (
                                        <SelectItem key={trigger.value} value={trigger.value}>
                                            {trigger.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle>Trigger Conditions</CardTitle>
                                <Button type="button" variant="outline" size="sm" onClick={addCondition}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add Rule
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {conditions.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No conditions configured.</p>
                            ) : (
                                conditions.map((rule, index) => (
                                    <div key={index} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-4">
                                        <div>
                                            <Label>Field</Label>
                                            <Select
                                                value={rule.field}
                                                onValueChange={(v) => updateCondition(index, 'field', v)}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Field" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {CONDITION_FIELDS.map((f) => (
                                                        <SelectItem key={f.value} value={f.value}>
                                                            {f.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label>Operator</Label>
                                            <Select
                                                value={rule.operator}
                                                onValueChange={(v) => updateCondition(index, 'operator', v)}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {CONDITION_OPERATORS.map((op) => (
                                                        <SelectItem key={op.value} value={op.value}>
                                                            {op.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label>Value</Label>
                                            <Input
                                                value={rule.value}
                                                onChange={(e) =>
                                                    updateCondition(index, 'value', e.target.value)
                                                }
                                            />
                                        </div>
                                        <div className="flex items-end">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => removeCondition(index)}
                                            >
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle>Actions</CardTitle>
                                <Button type="button" variant="outline" size="sm" onClick={addAction}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add Action
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {actions.map((action, index) => (
                                <div key={index} className="space-y-3 rounded-lg border p-4">
                                    <div className="flex items-start justify-between">
                                        <Badge variant="outline">Action {index + 1}</Badge>
                                        {actions.length > 1 && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => removeAction(index)}
                                            >
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        )}
                                    </div>
                                    <div>
                                        <Label>Action Type</Label>
                                        <Select
                                            value={action.type}
                                            onValueChange={(value) =>
                                                updateAction(index, 'type', value)
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select an action" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {SUPPORTED_ACTIONS.map((type) => (
                                                    <SelectItem key={type.value} value={type.value}>
                                                        {type.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {action.type && renderActionConfig(action, index)}
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <div className="flex justify-end gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => navigate('/admin/workflows')}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Updating...' : 'Update Workflow'}
                        </Button>
                    </div>
                </form>
            </div>
        </AppLayout>
    );
}
