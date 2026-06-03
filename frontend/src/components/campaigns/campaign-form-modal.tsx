import axios from '@/lib/axios';
import { useState, useEffect } from 'react';


import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
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
import { handleApiResponse, handleApiError } from '@/lib/toast';

interface CampaignFormModalProps {
    open: boolean;
    onClose: () => void;
    campaign?: any;
    onSuccess: () => void;
}

export default function CampaignFormModal({
    open,
    onClose,
    campaign,
    onSuccess,
}: CampaignFormModalProps) {
    const isEditing = !!campaign;

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

    // Populate form when editing
    useEffect(() => {
        if (campaign) {
            setFormData({
                name: campaign.name || '',
                description: campaign.description || '',
                status: campaign.status || 'draft',
                is_public: campaign.is_public || false,
                success_message: campaign.success_message || '',
                redirect_url: campaign.redirect_url || '',
            });
        } else {
            // Reset form for new campaign
            setFormData({
                name: '',
                description: '',
                status: 'draft',
                is_public: false,
                success_message: '',
                redirect_url: '',
            });
        }
        setErrors({});
    }, [campaign, open]);

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
            const url = isEditing ? `/admin/campaigns/${campaign.id}` : '/admin/campaigns';
            const method = isEditing ? 'put' : 'post';

            const response = await axios[method](url, formData);
            handleApiResponse(response);
            onSuccess();
            onClose();
        } catch (error: any) {
            if (error.response?.data?.errors) {
                setErrors(error.response.data.errors);
            }
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {isEditing ? 'Edit Campaign' : 'Create New Campaign'}
                    </DialogTitle>
                    <DialogDescription>
                        {isEditing
                            ? 'Update campaign information below.'
                            : 'Create a new marketing campaign for lead capture.'}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Basic Information */}
                    <div className="space-y-2">
                        <Label htmlFor="name">
                            Campaign Name <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) => handleChange('name', e.target.value)}
                            placeholder="Spring 2026 Newsletter Signup"
                            className={errors.name ? 'border-red-500' : ''}
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

                    {/* Status and Visibility */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="status">
                                Status <span className="text-red-500">*</span>
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
                                    <SelectItem value="draft">Draft</SelectItem>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="paused">Paused</SelectItem>
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

                    {/* Form Submission Settings */}
                    <div className="space-y-4 pt-4 border-t">
                        <h4 className="font-medium text-sm">
                            Form Submission Settings
                        </h4>

                        <div className="space-y-2">
                            <Label htmlFor="success_message">
                                Success Message
                            </Label>
                            <Textarea
                                id="success_message"
                                value={formData.success_message}
                                onChange={(e) =>
                                    handleChange('success_message', e.target.value)
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
                    </div>

                    <div className="bg-muted/50 p-3 rounded-md text-sm text-muted-foreground">
                        <strong>Note:</strong> Dynamic form builder for custom
                        fields will be available in a future update. For now,
                        campaigns use the default contact fields (name, email,
                        phone).
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading
                                ? 'Saving...'
                                : isEditing
                                    ? 'Update Campaign'
                                    : 'Create Campaign'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
