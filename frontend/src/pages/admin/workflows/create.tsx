import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Plus, Trash2, ArrowLeft, Network } from 'lucide-react';
import { handleApiError, handleApiResponse } from '@/lib/toast';
import axios from '@/lib/axios';
import {
    SUPPORTED_TRIGGERS,
    SUPPORTED_ACTIONS,
    CONDITION_FIELDS,
    CONDITION_OPERATORS,
    conditionsToApi,
    type WorkflowAction,
    type TriggerCondition,
} from '@/lib/workflow-utils';

export default function Create() {
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [triggerType, setTriggerType] = useState('');
    const [conditions, setConditions] = useState<TriggerCondition[]>([]);
    const [actions, setActions] = useState<WorkflowAction[]>([
        { type: '', config: {} },
    ]);
    const [isActive, setIsActive] = useState(true);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});

    const breadcrumbs = [
        { label: 'Dashboard', href: '/admin/dashboard' },
        { label: 'Workflows', href: '/admin/workflows' },
        { label: 'Create Workflow' },
    ];

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
        setLoading(true);
        setErrors({});

        const nextErrors: Record<string, string[]> = {};
        if (!name.trim()) nextErrors.name = ['Name is required'];
        if (!triggerType) nextErrors.trigger_type = ['Trigger is required'];
        if (actions.length === 0 || actions.every((a) => !a.type)) {
            nextErrors.actions = ['At least one action is required'];
        }
        if (Object.keys(nextErrors).length > 0) {
            setErrors(nextErrors);
            setLoading(false);
            return;
        }

        try {
            const response = await axios.post('/admin/workflows', {
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
                                placeholder="Notify manager on leave approval"
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
                                placeholder="3"
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
            case 'send_email':
            case 'whatsapp':
            case 'notify_manager':
                return (
                    <div className="space-y-3">
                        {action.type === 'send_email' && (
                            <div>
                                <Label>Subject</Label>
                                <Input
                                    placeholder="Email subject"
                                    value={String(action.config.subject ?? '')}
                                    onChange={(e) =>
                                        updateAction(index, 'config', {
                                            ...action.config,
                                            subject: e.target.value,
                                        })
                                    }
                                />
                            </div>
                        )}
                        <div>
                            <Label>
                                {action.type === 'send_email'
                                    ? 'Email Body'
                                    : action.type === 'whatsapp'
                                      ? 'WhatsApp Message'
                                      : 'Message'}
                            </Label>
                            <Textarea
                                placeholder="Message content"
                                value={String(action.config.message ?? '')}
                                onChange={(e) =>
                                    updateAction(index, 'config', {
                                        ...action.config,
                                        message: e.target.value,
                                    })
                                }
                            />
                        </div>
                    </div>
                );
            case 'webhook':
                return (
                    <div>
                        <Label>Webhook URL</Label>
                        <Input
                            placeholder="https://example.com/hooks/hrm"
                            value={String(action.config.url ?? '')}
                            onChange={(e) =>
                                updateAction(index, 'config', {
                                    ...action.config,
                                    url: e.target.value,
                                })
                            }
                        />
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <div className="space-y-6">
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#e8f2fd] via-[#d0e4f8] to-[#c4d8f0] dark:from-[#0d1e33] dark:via-[#0a1828] dark:to-[#071220] px-4 sm:px-6 py-4 sm:py-5 border border-white/60 dark:border-white/10 shadow-sm">
                    <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
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
                                    Create Workflow
                                </h1>
                                <p className="text-sm text-[#1e3a5f]/60 dark:text-blue-200/60">
                                    Automate leave-related actions when events occur
                                </p>
                            </div>
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
                                    placeholder="e.g., Notify on new leave request"
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
                                    placeholder="Brief description of what this workflow does"
                                    rows={3}
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <Label htmlFor="is_active">Active Status</Label>
                                    <p className="text-sm text-muted-foreground">
                                        Enable this workflow to start running
                                    </p>
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
                        <CardContent className="space-y-4">
                            <div>
                                <Label htmlFor="trigger_type">
                                    When should this workflow run?{' '}
                                    <span className="text-destructive">*</span>
                                </Label>
                                <Select value={triggerType} onValueChange={setTriggerType}>
                                    <SelectTrigger id="trigger_type">
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
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Trigger Conditions</CardTitle>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Optional — workflow runs only when all rules match
                                    </p>
                                </div>
                                <Button type="button" variant="outline" size="sm" onClick={addCondition}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add Rule
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {conditions.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    No conditions — workflow runs for every matching trigger event.
                                </p>
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
                                                placeholder="e.g. annual"
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
                            {loading ? 'Creating...' : 'Create Workflow'}
                        </Button>
                    </div>
                </form>
            </div>
        </AppLayout>
    );
}
