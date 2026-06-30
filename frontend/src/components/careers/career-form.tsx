import axios from '@/lib/axios';
import { X, Plus } from 'lucide-react';
import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { handleApiResponse, handleApiError } from '@/lib/toast';

interface Career {
    id: number;
    title: string;
    slug?: string;
    location: string;
    job_type: string;
    experience_required: string | null;
    description: string;
    requirements: string[] | null;
    responsibilities: string[] | null;
    salary_range: string | null;
    is_active: boolean;
}

interface CareerFormProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
    career?: Career | null;
}

export default function CareerForm({
    open,
    onClose,
    onSuccess,
    career = null,
}: CareerFormProps) {
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [formData, setFormData] = useState({
        title: '',
        location: '',
        job_type: 'Full-time',
        experience_required: '',
        description: '',
        requirements: [''],
        responsibilities: [''],
        salary_range: '',
        is_active: true,
    });

    useEffect(() => {
        if (career) {
            setFormData({
                title: career.title,
                location: career.location,
                job_type: career.job_type,
                experience_required: career.experience_required || '',
                description: career.description,
                requirements: career.requirements || [''],
                responsibilities: career.responsibilities || [''],
                salary_range: career.salary_range || '',
                is_active: career.is_active,
            });
        } else {
            setFormData({
                title: '',
                location: '',
                job_type: 'Full-time',
                experience_required: '',
                description: '',
                requirements: [''],
                responsibilities: [''],
                salary_range: '',
                is_active: true,
            });
        }
        setErrors({});
    }, [career, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrors({});

        if (!formData.title.trim()) {
            setErrors({ title: ['Title is required'] });
            setLoading(false);
            return;
        }

        try {
            // Filter out empty strings from arrays
            const cleanedData = {
                ...formData,
                requirements: formData.requirements.filter((r) => r.trim() !== ''),
                responsibilities: formData.responsibilities.filter((r) => r.trim() !== ''),
            };

            const url = career ? `/admin/careers/${career.id}` : '/admin/careers';
            const method = career ? 'put' : 'post';

            const response = await axios[method](url, cleanedData);
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

    const addArrayField = (field: 'requirements' | 'responsibilities') => {
        setFormData({
            ...formData,
            [field]: [...formData[field], ''],
        });
    };

    const removeArrayField = (field: 'requirements' | 'responsibilities', index: number) => {
        if (formData[field].length > 1) {
            setFormData({
                ...formData,
                [field]: formData[field].filter((_, i) => i !== index),
            });
        }
    };

    const updateArrayField = (
        field: 'requirements' | 'responsibilities',
        index: number,
        value: string,
    ) => {
        const updated = [...formData[field]];
        updated[index] = value;
        setFormData({ ...formData, [field]: updated });
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{career ? 'Edit Job Posting' : 'Create Job Posting'}</DialogTitle>
                    <DialogDescription>
                        {career
                            ? 'Update job posting information'
                            : 'Add a new job opening to your careers page'}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit}>
                    <div className="space-y-4">
                        {/* Title */}
                        <div className="space-y-2">
                            <Label htmlFor="title">
                                Job Title <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="title"
                                value={formData.title}
                                onChange={(e) =>
                                    setFormData({ ...formData, title: e.target.value })
                                }
                                placeholder="e.g., Senior Software Engineer"
                                disabled={loading}
                            />
                            {errors.title && (
                                <p className="text-sm text-red-500">{errors.title[0]}</p>
                            )}
                        </div>

                        {/* Location & Job Type Row */}
                        <div className="grid gap-4 md:grid-cols-2">
                            {/* Location */}
                            <div className="space-y-2">
                                <Label htmlFor="location">
                                    Location <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    id="location"
                                    value={formData.location}
                                    onChange={(e) =>
                                        setFormData({ ...formData, location: e.target.value })
                                    }
                                    placeholder="e.g., New York, NY (Remote)"
                                    disabled={loading}
                                />
                                {errors.location && (
                                    <p className="text-sm text-red-500">{errors.location[0]}</p>
                                )}
                            </div>

                            {/* Job Type */}
                            <div className="space-y-2">
                                <Label htmlFor="job_type">
                                    Job Type <span className="text-red-500">*</span>
                                </Label>
                                <Select
                                    value={formData.job_type}
                                    onValueChange={(value) =>
                                        setFormData({ ...formData, job_type: value })
                                    }
                                    disabled={loading}
                                >
                                    <SelectTrigger id="job_type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Full-time">Full-time</SelectItem>
                                        <SelectItem value="Part-time">Part-time</SelectItem>
                                        <SelectItem value="Contract">Contract</SelectItem>
                                        <SelectItem value="Freelance">Freelance</SelectItem>
                                        <SelectItem value="Internship">Internship</SelectItem>
                                    </SelectContent>
                                </Select>
                                {errors.job_type && (
                                    <p className="text-sm text-red-500">{errors.job_type[0]}</p>
                                )}
                            </div>
                        </div>

                        {/* Experience & Salary Row */}
                        <div className="grid gap-4 md:grid-cols-2">
                            {/* Experience Required */}
                            <div className="space-y-2">
                                <Label htmlFor="experience_required">Experience Required</Label>
                                <Input
                                    id="experience_required"
                                    value={formData.experience_required}
                                    onChange={(e) =>
                                        setFormData({
                                            ...formData,
                                            experience_required: e.target.value,
                                        })
                                    }
                                    placeholder="e.g., 3-5 years"
                                    disabled={loading}
                                />
                                {errors.experience_required && (
                                    <p className="text-sm text-red-500">
                                        {errors.experience_required[0]}
                                    </p>
                                )}
                            </div>

                            {/* Salary Range */}
                            <div className="space-y-2">
                                <Label htmlFor="salary_range">Salary Range</Label>
                                <Input
                                    id="salary_range"
                                    value={formData.salary_range}
                                    onChange={(e) =>
                                        setFormData({ ...formData, salary_range: e.target.value })
                                    }
                                    placeholder="e.g., $80,000 - $120,000"
                                    disabled={loading}
                                />
                                {errors.salary_range && (
                                    <p className="text-sm text-red-500">{errors.salary_range[0]}</p>
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
                                value={formData.description}
                                onChange={(e) =>
                                    setFormData({ ...formData, description: e.target.value })
                                }
                                placeholder="Detailed job description..."
                                rows={4}
                                disabled={loading}
                            />
                            {errors.description && (
                                <p className="text-sm text-red-500">{errors.description[0]}</p>
                            )}
                        </div>

                        {/* Requirements */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Requirements</Label>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => addArrayField('requirements')}
                                    disabled={loading}
                                >
                                    <Plus className="mr-1 h-4 w-4" />
                                    Add
                                </Button>
                            </div>
                            <div className="space-y-2">
                                {formData.requirements.map((req, index) => (
                                    <div key={index} className="flex gap-2">
                                        <Input
                                            value={req}
                                            onChange={(e) =>
                                                updateArrayField(
                                                    'requirements',
                                                    index,
                                                    e.target.value,
                                                )
                                            }
                                            placeholder={`Requirement ${index + 1}`}
                                            disabled={loading}
                                        />
                                        {formData.requirements.length > 1 && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() =>
                                                    removeArrayField('requirements', index)
                                                }
                                                disabled={loading}
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {errors.requirements && (
                                <p className="text-sm text-red-500">{errors.requirements[0]}</p>
                            )}
                        </div>

                        {/* Responsibilities */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Responsibilities</Label>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => addArrayField('responsibilities')}
                                    disabled={loading}
                                >
                                    <Plus className="mr-1 h-4 w-4" />
                                    Add
                                </Button>
                            </div>
                            <div className="space-y-2">
                                {formData.responsibilities.map((resp, index) => (
                                    <div key={index} className="flex gap-2">
                                        <Input
                                            value={resp}
                                            onChange={(e) =>
                                                updateArrayField(
                                                    'responsibilities',
                                                    index,
                                                    e.target.value,
                                                )
                                            }
                                            placeholder={`Responsibility ${index + 1}`}
                                            disabled={loading}
                                        />
                                        {formData.responsibilities.length > 1 && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() =>
                                                    removeArrayField('responsibilities', index)
                                                }
                                                disabled={loading}
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {errors.responsibilities && (
                                <p className="text-sm text-red-500">{errors.responsibilities[0]}</p>
                            )}
                        </div>

                        {/* Active Status */}
                        <div className="flex items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                                <Label htmlFor="is_active">Active Status</Label>
                                <p className="text-sm text-muted-foreground">
                                    Make this job posting visible to applicants
                                </p>
                            </div>
                            <Switch
                                id="is_active"
                                checked={formData.is_active}
                                onCheckedChange={(checked) =>
                                    setFormData({ ...formData, is_active: checked })
                                }
                                disabled={loading}
                            />
                        </div>
                    </div>

                    <DialogFooter className="mt-6">
                        <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Saving...' : career ? 'Update' : 'Create'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
