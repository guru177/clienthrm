import { useNavigate } from 'react-router-dom';
import axios from '@/lib/axios';
import { ArrowLeft, Plus, Trash2, GripVertical } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import { handleApiResponse, handleApiError } from '@/lib/toast';

interface FormField {
    id: string;
    name: string;
    type: string;
    label: string;
    required: boolean;
    options?: string[];
    placeholder?: string;
}

export default function CampaignCreate() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        status: 'draft',
        is_public: false,
        success_message: '',
        redirect_url: '',
    });
    const [formFields, setFormFields] = useState<FormField[]>([]);

    const breadcrumbs = [
        // { label: 'Dashboard', href: '/dashboard' },
        { label: 'Campaigns', href: '/admin/campaigns' },
        { label: 'Create Campaign', href: '/admin/campaigns/create' },
    ];

    const handleChange = (field: string, value: string | boolean) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors((prev) => ({ ...prev, [field]: [] }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrors({});

        try {
            const payload = {
                ...formData,
                form_fields: formFields,
            };

            const response = await axios.post('/admin/campaigns', payload);
            handleApiResponse(response);

            // Navigate to edit page after successful creation
            if (response.data.success && response.data.data?.id) {
                navigate(`/admin/campaigns/${response.data.data.id}/edit`);
            }
        } catch (error: any) {
            if (error.response?.data?.errors) {
                setErrors(error.response.data.errors);
            }
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const addFormField = () => {
        const newField: FormField = {
            id: `field_${Date.now()}`,
            name: '',
            type: 'text',
            label: '',
            required: false,
            placeholder: '',
        };
        setFormFields([...formFields, newField]);
    };

    const updateFormField = (id: string, updates: Partial<FormField>) => {
        setFormFields(
            formFields.map((field) =>
                field.id === id ? { ...field, ...updates } : field,
            ),
        );
    };

    const removeFormField = (id: string) => {
        setFormFields(formFields.filter((field) => field.id !== id));
    };

    const addOption = (fieldId: string) => {
        updateFormField(fieldId, {
            options: [
                ...(formFields.find((f) => f.id === fieldId)?.options || []),
                '',
            ],
        });
    };

    const updateOption = (fieldId: string, index: number, value: string) => {
        const field = formFields.find((f) => f.id === fieldId);
        if (field?.options) {
            const newOptions = [...field.options];
            newOptions[index] = value;
            updateFormField(fieldId, { options: newOptions });
        }
    };

    const removeOption = (fieldId: string, index: number) => {
        const field = formFields.find((f) => f.id === fieldId);
        if (field?.options) {
            updateFormField(fieldId, {
                options: field.options.filter((_, i) => i !== index),
            });
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            

            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate('/admin/campaigns')}
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">
                                Create Campaign
                            </h1>
                            <p className="text-muted-foreground">
                                Create a new marketing campaign with custom form
                                fields
                            </p>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Left Column: Basic Info + Submission Settings */}
                        <div className="lg:col-span-4 space-y-6">
                            {/* Basic Information Card */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Basic Information</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="name">
                                            Campaign Name{' '}
                                            <span className="text-red-500">*</span>
                                        </Label>
                                        <Input
                                            id="name"
                                            value={formData.name}
                                            onChange={(e) =>
                                                handleChange('name', e.target.value)
                                            }
                                            placeholder="Spring 2026 Newsletter Signup"
                                            className={
                                                errors.name ? 'border-red-500' : ''
                                            }
                                        />
                                        {errors.name && (
                                            <p className="text-sm text-red-500">
                                                {errors.name[0]}
                                            </p>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="description">Description</Label>
                                        <Textarea
                                            id="description"
                                            value={formData.description}
                                            onChange={(e) =>
                                                handleChange('description', e.target.value)
                                            }
                                            placeholder="Brief description of this campaign's purpose..."
                                            rows={3}
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="status">
                                                Status{' '}
                                                <span className="text-red-500">*</span>
                                            </Label>
                                            <Select
                                                value={formData.status}
                                                onValueChange={(value) =>
                                                    handleChange('status', value)
                                                }
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="draft">
                                                        Draft
                                                    </SelectItem>
                                                    <SelectItem value="active">
                                                        Active
                                                    </SelectItem>
                                                    <SelectItem value="paused">
                                                        Paused
                                                    </SelectItem>
                                                    <SelectItem value="completed">
                                                        Completed
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="is_public">Visibility</Label>
                                            <div className="flex items-center space-x-2 h-10">
                                                <Checkbox
                                                    id="is_public"
                                                    checked={formData.is_public}
                                                    onCheckedChange={(checked) =>
                                                        handleChange(
                                                            'is_public',
                                                            checked === true,
                                                        )
                                                    }
                                                />
                                                <label
                                                    htmlFor="is_public"
                                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                                >
                                                    Public (accessible via public form URL)
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Form Submission Settings Card */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Form Submission Settings</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="success_message">
                                            Success Message
                                        </Label>
                                        <Textarea
                                            id="success_message"
                                            value={formData.success_message}
                                            onChange={(e) =>
                                                handleChange(
                                                    'success_message',
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="Thank you for your interest! We'll be in touch soon."
                                            rows={2}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Message shown after successful form submission
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="redirect_url">Redirect URL</Label>
                                        <Input
                                            id="redirect_url"
                                            type="url"
                                            value={formData.redirect_url}
                                            onChange={(e) =>
                                                handleChange('redirect_url', e.target.value)
                                            }
                                            placeholder="https://example.com/thank-you"
                                            className={
                                                errors.redirect_url ? 'border-red-500' : ''
                                            }
                                        />
                                        {errors.redirect_url && (
                                            <p className="text-sm text-red-500">
                                                {errors.redirect_url[0]}
                                            </p>
                                        )}
                                        <p className="text-xs text-muted-foreground">
                                            Optional: Redirect users to this URL after
                                            submission
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Right Column: Form Builder */}
                        <div className="lg:col-span-8">
                            {/* Form Builder Card */}
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle>Form Builder</CardTitle>
                                            <p className="text-sm text-muted-foreground mt-1">
                                                Default fields: First Name, Last Name, Email,
                                                Phone. Add custom fields below.
                                            </p>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={addFormField}
                                        >
                                            <Plus className="h-4 w-4 mr-2" />
                                            Add Field
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {/* Default Fields Display */}
                                    <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                                        {['First Name', 'Last Name', 'Email', 'Phone'].map(
                                            (field) => (
                                                <div
                                                    key={field}
                                                    className="flex items-center gap-2"
                                                >
                                                    <Badge variant="secondary">
                                                        Default
                                                    </Badge>
                                                    <span className="text-sm font-medium">
                                                        {field}
                                                    </span>
                                                    <Badge
                                                        variant="outline"
                                                        className="text-xs"
                                                    >
                                                        Required
                                                    </Badge>
                                                </div>
                                            ),
                                        )}
                                    </div>

                                    {/* Custom Fields */}
                                    {formFields.length === 0 ? (
                                        <div className="text-center py-8 text-muted-foreground">
                                            No custom fields added yet. Click "Add Field"
                                            to create one.
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {formFields.map((field, index) => (
                                                <Card key={field.id}>
                                                    <CardContent className="pt-6 space-y-4">
                                                        <div className="flex items-start justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <GripVertical className="h-4 w-4 text-muted-foreground" />
                                                                <h4 className="font-medium">
                                                                    Field {index + 1}
                                                                </h4>
                                                            </div>
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() =>
                                                                    removeFormField(field.id)
                                                                }
                                                            >
                                                                <Trash2 className="h-4 w-4 text-red-500" />
                                                            </Button>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="space-y-2">
                                                                <Label>Field Name</Label>
                                                                <Input
                                                                    value={field.name}
                                                                    onChange={(e) =>
                                                                        updateFormField(
                                                                            field.id,
                                                                            {
                                                                                name: e
                                                                                    .target
                                                                                    .value,
                                                                            },
                                                                        )
                                                                    }
                                                                    placeholder="company_name"
                                                                />
                                                                <p className="text-xs text-muted-foreground">
                                                                    Internal identifier
                                                                    (lowercase, underscores)
                                                                </p>
                                                            </div>

                                                            <div className="space-y-2">
                                                                <Label>Label</Label>
                                                                <Input
                                                                    value={field.label}
                                                                    onChange={(e) =>
                                                                        updateFormField(
                                                                            field.id,
                                                                            {
                                                                                label: e
                                                                                    .target
                                                                                    .value,
                                                                            },
                                                                        )
                                                                    }
                                                                    placeholder="Company Name"
                                                                />
                                                                <p className="text-xs text-muted-foreground">
                                                                    Display label for users
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="space-y-2">
                                                                <Label>Field Type</Label>
                                                                <Select
                                                                    value={field.type}
                                                                    onValueChange={(value) =>
                                                                        updateFormField(
                                                                            field.id,
                                                                            {
                                                                                type: value,
                                                                            },
                                                                        )
                                                                    }
                                                                >
                                                                    <SelectTrigger>
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="text">
                                                                            Text
                                                                        </SelectItem>
                                                                        <SelectItem value="email">
                                                                            Email
                                                                        </SelectItem>
                                                                        <SelectItem value="number">
                                                                            Number
                                                                        </SelectItem>
                                                                        <SelectItem value="tel">
                                                                            Phone
                                                                        </SelectItem>
                                                                        <SelectItem value="textarea">
                                                                            Textarea
                                                                        </SelectItem>
                                                                        <SelectItem value="select">
                                                                            Select Dropdown
                                                                        </SelectItem>
                                                                        <SelectItem value="checkbox">
                                                                            Checkbox
                                                                        </SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>

                                                            <div className="space-y-2">
                                                                <Label>Placeholder</Label>
                                                                <Input
                                                                    value={
                                                                        field.placeholder || ''
                                                                    }
                                                                    onChange={(e) =>
                                                                        updateFormField(
                                                                            field.id,
                                                                            {
                                                                                placeholder:
                                                                                    e.target
                                                                                        .value,
                                                                            },
                                                                        )
                                                                    }
                                                                    placeholder="Enter placeholder text..."
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center space-x-2">
                                                            <Checkbox
                                                                id={`required_${field.id}`}
                                                                checked={field.required}
                                                                onCheckedChange={(checked) =>
                                                                    updateFormField(field.id, {
                                                                        required:
                                                                            checked === true,
                                                                    })
                                                                }
                                                            />
                                                            <label
                                                                htmlFor={`required_${field.id}`}
                                                                className="text-sm font-medium"
                                                            >
                                                                Required field
                                                            </label>
                                                        </div>

                                                        {/* Options for select fields */}
                                                        {field.type === 'select' && (
                                                            <div className="space-y-2 border-t pt-4">
                                                                <div className="flex items-center justify-between">
                                                                    <Label>Options</Label>
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() =>
                                                                            addOption(field.id)
                                                                        }
                                                                    >
                                                                        <Plus className="h-3 w-3 mr-1" />
                                                                        Add Option
                                                                    </Button>
                                                                </div>
                                                                {field.options?.map(
                                                                    (option, optIndex) => (
                                                                        <div
                                                                            key={optIndex}
                                                                            className="flex gap-2"
                                                                        >
                                                                            <Input
                                                                                value={option}
                                                                                onChange={(e) =>
                                                                                    updateOption(
                                                                                        field.id,
                                                                                        optIndex,
                                                                                        e.target
                                                                                            .value,
                                                                                    )
                                                                                }
                                                                                placeholder={`Option ${optIndex + 1}`}
                                                                            />
                                                                            <Button
                                                                                type="button"
                                                                                variant="ghost"
                                                                                size="icon"
                                                                                onClick={() =>
                                                                                    removeOption(
                                                                                        field.id,
                                                                                        optIndex,
                                                                                    )
                                                                                }
                                                                            >
                                                                                <Trash2 className="h-4 w-4" />
                                                                            </Button>
                                                                        </div>
                                                                    ),
                                                                )}
                                                            </div>
                                                        )}
                                                    </CardContent>
                                                </Card>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-end gap-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => navigate('/admin/campaigns')}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Creating...' : 'Create Campaign'}
                        </Button>
                    </div>
                </form>
            </div>
        </AppLayout>
    );
}
