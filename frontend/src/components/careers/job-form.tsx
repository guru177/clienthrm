import axios from '@/lib/axios';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { handleApiResponse, handleApiError } from '@/lib/toast';

interface Job {
    id: number;
    title: string;
    slug: string;
    description: string;
    requirements?: string;
    location?: string;
    type: string;
    salary_range?: string;
    closing_date?: string;
    is_active: boolean;
    display_order: number;
}

interface JobFormProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
    job?: Job | null;
}

interface FormData {
    title: string;
    description: string;
    requirements: string;
    location: string;
    type: string;
    salary_range: string;
    closing_date: string;
    is_active: boolean;
    display_order: number;
}

export default function JobForm({ open, onClose, onSuccess, job }: JobFormProps) {
    const [formData, setFormData] = useState<FormData>({
        title: '',
        description: '',
        requirements: '',
        location: '',
        type: 'full-time',
        salary_range: '',
        closing_date: '',
        is_active: true,
        display_order: 0,
    });
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});

    useEffect(() => {
        if (job) {
            setFormData({
                title: job.title || '',
                description: job.description || '',
                requirements: job.requirements || '',
                location: job.location || '',
                type: job.type || 'full-time',
                salary_range: job.salary_range || '',
                closing_date: job.closing_date || '',
                is_active: job.is_active ?? true,
                display_order: job.display_order || 0,
            });
        } else {
            setFormData({
                title: '',
                description: '',
                requirements: '',
                location: '',
                type: 'full-time',
                salary_range: '',
                closing_date: '',
                is_active: true,
                display_order: 0,
            });
        }
        setErrors({});
    }, [job, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrors({});

        try {
            const url = job ? `/admin/jobs/${job.id}` : '/admin/jobs';
            const method = job ? 'put' : 'post';

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

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const { name, value, type } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: type === 'number' ? parseInt(value) || 0 : value,
        }));
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{job ? 'Edit Job' : 'Add New Job'}</DialogTitle>
                    <DialogDescription>
                        {job
                            ? 'Update the job details below.'
                            : 'Fill in the details to create a new job posting.'}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Title */}
                    <div className="space-y-2">
                        <Label htmlFor="title">
                            Job Title <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            id="title"
                            name="title"
                            value={formData.title}
                            onChange={handleChange}
                            placeholder="e.g., Senior React Developer"
                            required
                        />
                        {errors.title && (
                            <p className="text-sm text-red-500">{errors.title[0]}</p>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Type */}
                        <div className="space-y-2">
                            <Label htmlFor="type">
                                Job Type <span className="text-red-500">*</span>
                            </Label>
                            <Select
                                value={formData.type}
                                onValueChange={(value) =>
                                    setFormData((prev) => ({ ...prev, type: value }))
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="full-time">Full-time</SelectItem>
                                    <SelectItem value="part-time">Part-time</SelectItem>
                                    <SelectItem value="contract">Contract</SelectItem>
                                    <SelectItem value="internship">Internship</SelectItem>
                                </SelectContent>
                            </Select>
                            {errors.type && (
                                <p className="text-sm text-red-500">{errors.type[0]}</p>
                            )}
                        </div>

                        {/* Location */}
                        <div className="space-y-2">
                            <Label htmlFor="location">Location</Label>
                            <Input
                                id="location"
                                name="location"
                                value={formData.location}
                                onChange={handleChange}
                                placeholder="e.g., Remote, Mumbai, Bangalore"
                            />
                            {errors.location && (
                                <p className="text-sm text-red-500">{errors.location[0]}</p>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Salary Range */}
                        <div className="space-y-2">
                            <Label htmlFor="salary_range">Salary Range</Label>
                            <Input
                                id="salary_range"
                                name="salary_range"
                                value={formData.salary_range}
                                onChange={handleChange}
                                placeholder="e.g., ₹10-15 LPA"
                            />
                            {errors.salary_range && (
                                <p className="text-sm text-red-500">
                                    {errors.salary_range[0]}
                                </p>
                            )}
                        </div>

                        {/* Closing Date */}
                        <div className="space-y-2">
                            <Label htmlFor="closing_date">Closing Date</Label>
                            <Input
                                id="closing_date"
                                name="closing_date"
                                type="date"
                                value={formData.closing_date}
                                onChange={handleChange}
                            />
                            {errors.closing_date && (
                                <p className="text-sm text-red-500">
                                    {errors.closing_date[0]}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                        <Label htmlFor="description">
                            Job Description <span className="text-red-500">*</span>
                        </Label>
                        <Textarea
                            id="description"
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            placeholder="Describe the role, responsibilities, and what the candidate will do..."
                            rows={4}
                            required
                        />
                        {errors.description && (
                            <p className="text-sm text-red-500">{errors.description[0]}</p>
                        )}
                    </div>

                    {/* Requirements */}
                    <div className="space-y-2">
                        <Label htmlFor="requirements">Requirements</Label>
                        <Textarea
                            id="requirements"
                            name="requirements"
                            value={formData.requirements}
                            onChange={handleChange}
                            placeholder="List the skills, qualifications, and experience required..."
                            rows={4}
                        />
                        {errors.requirements && (
                            <p className="text-sm text-red-500">{errors.requirements[0]}</p>
                        )}
                    </div>

                    {/* Display Order */}
                    <div className="space-y-2">
                        <Label htmlFor="display_order">Display Order</Label>
                        <Input
                            id="display_order"
                            name="display_order"
                            type="number"
                            min="0"
                            value={formData.display_order}
                            onChange={handleChange}
                        />
                        {errors.display_order && (
                            <p className="text-sm text-red-500">
                                {errors.display_order[0]}
                            </p>
                        )}
                    </div>

                    {/* Is Active */}
                    <div className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                            <Label htmlFor="is_active">Active Status</Label>
                            <p className="text-sm text-muted-foreground">
                                Make this job visible and accepting applications
                            </p>
                        </div>
                        <Switch
                            id="is_active"
                            checked={formData.is_active}
                            onCheckedChange={(checked) =>
                                setFormData((prev) => ({ ...prev, is_active: checked }))
                            }
                        />
                    </div>

                    {/* Form Actions */}
                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Saving...' : job ? 'Update Job' : 'Create Job'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
