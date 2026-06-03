import axios from '@/lib/axios';
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
import { Textarea } from '@/components/ui/textarea';
import { handleApiResponse, handleApiError } from '@/lib/toast';

interface LeadFormModalProps {
    open: boolean;
    onClose: () => void;
    lead?: any;
    onSuccess: () => void;
}

export default function LeadFormModal({
    open,
    onClose,
    lead,
    onSuccess,
}: LeadFormModalProps) {
    const isEditing = !!lead;

    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        mobile: '',
        campaign_id: '',
        status: 'new',
        notes: '',
    });

    // Fetch campaigns for dropdown
    useEffect(() => {
        const fetchCampaigns = async () => {
            try {
                const response = await axios.get('/admin/campaigns/list', {
                    params: { per_page: 100, sort_by: 'name', sort_order: 'asc' },
                });
                setCampaigns(Array.isArray(response.data.data) ? response.data.data : (response.data.data?.data || []));
            } catch (error) {
                console.error('Error fetching campaigns:', error);
            }
        };

        if (open) {
            fetchCampaigns();
        }
    }, [open]);

    // Populate form when editing
    useEffect(() => {
        if (lead) {
            setFormData({
                first_name: lead.first_name || '',
                last_name: lead.last_name || '',
                email: lead.email || '',
                phone: lead.phone || '',
                mobile: lead.mobile || '',
                campaign_id: lead.campaign_id || '',
                status: lead.status || 'new',
                notes: lead.notes || '',
            });
        } else {
            // Reset form for new lead
            setFormData({
                first_name: '',
                last_name: '',
                email: '',
                phone: '',
                mobile: '',
                campaign_id: '1', // Default to General Campaign
                status: 'new',
                notes: '',
            });
        }
        setErrors({});
    }, [lead, open]);

    const handleChange = (field: string, value: string) => {
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
            const url = isEditing ? `/admin/leads/${lead.id}` : '/admin/leads';
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
                        {isEditing ? 'Edit Lead' : 'Create New Lead'}
                    </DialogTitle>
                    <DialogDescription>
                        {isEditing
                            ? 'Update lead information below.'
                            : 'Add a new lead to your CRM.'}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Basic Information */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="first_name">
                                First Name <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="first_name"
                                value={formData.first_name}
                                onChange={(e) =>
                                    handleChange('first_name', e.target.value)
                                }
                                placeholder="John"
                                className={
                                    errors.first_name
                                        ? 'border-red-500'
                                        : ''
                                }
                            />
                            {errors.first_name && (
                                <p className="text-sm text-red-500">
                                    {errors.first_name[0]}
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="last_name">
                                Last Name <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="last_name"
                                value={formData.last_name}
                                onChange={(e) =>
                                    handleChange('last_name', e.target.value)
                                }
                                placeholder="Doe"
                                className={
                                    errors.last_name
                                        ? 'border-red-500'
                                        : ''
                                }
                            />
                            {errors.last_name && (
                                <p className="text-sm text-red-500">
                                    {errors.last_name[0]}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Contact Information */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">
                                Email <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="email"
                                type="email"
                                value={formData.email}
                                onChange={(e) =>
                                    handleChange('email', e.target.value)
                                }
                                placeholder="john.doe@example.com"
                                className={
                                    errors.email ? 'border-red-500' : ''
                                }
                            />
                            {errors.email && (
                                <p className="text-sm text-red-500">
                                    {errors.email[0]}
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="phone">
                                Phone <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="phone"
                                value={formData.phone}
                                onChange={(e) =>
                                    handleChange('phone', e.target.value)
                                }
                                placeholder="+1-555-0100"
                                className={
                                    errors.phone ? 'border-red-500' : ''
                                }
                            />
                            {errors.phone && (
                                <p className="text-sm text-red-500">
                                    {errors.phone[0]}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="mobile">Mobile</Label>
                        <Input
                            id="mobile"
                            value={formData.mobile}
                            onChange={(e) =>
                                handleChange('mobile', e.target.value)
                            }
                            placeholder="+1-555-0200"
                        />
                    </div>

                    {/* Campaign & Status */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="campaign_id">
                                Campaign <span className="text-red-500">*</span>
                            </Label>
                            <Select
                                value={formData.campaign_id}
                                onValueChange={(value) =>
                                    handleChange('campaign_id', value)
                                }
                            >
                                <SelectTrigger
                                    className={
                                        errors.campaign_id
                                            ? 'border-red-500'
                                            : ''
                                    }
                                >
                                    <SelectValue placeholder="Select campaign" />
                                </SelectTrigger>
                                <SelectContent>
                                    {campaigns.map((campaign) => (
                                        <SelectItem
                                            key={campaign.id}
                                            value={campaign.id.toString()}
                                        >
                                            {campaign.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {errors.campaign_id && (
                                <p className="text-sm text-red-500">
                                    {errors.campaign_id[0]}
                                </p>
                            )}
                        </div>

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
                                    <SelectItem value="new">New</SelectItem>
                                    <SelectItem value="in_progress">
                                        In Progress
                                    </SelectItem>
                                    <SelectItem value="qualified">
                                        Qualified
                                    </SelectItem>
                                    <SelectItem value="contacted">
                                        Contacted
                                    </SelectItem>
                                    <SelectItem value="converted">
                                        Converted
                                    </SelectItem>
                                    <SelectItem value="rejected">
                                        Rejected
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                        <Label htmlFor="notes">Notes</Label>
                        <Textarea
                            id="notes"
                            value={formData.notes}
                            onChange={(e) =>
                                handleChange('notes', e.target.value)
                            }
                            placeholder="Additional notes about this lead..."
                            rows={4}
                        />
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
                                    ? 'Update Lead'
                                    : 'Create Lead'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
