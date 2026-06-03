
import { useAuth } from '@/contexts/AuthContext';
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
import { type SharedData } from '@/types';

interface CompanyFormModalProps {
    open: boolean;
    onClose: () => void;
    company?: any;
    onSuccess: () => void;
}

export default function CompanyFormModal({
    open,
    onClose,
    company,
    onSuccess,
}: CompanyFormModalProps) {
    const { user: authUser } = useAuth();
    const isEditing = !!company;

    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [formData, setFormData] = useState({
        name: '',
        legal_name: '',
        email: '',
        phone: '',
        website: '',
        industry: '',
        company_size: '',
        description: '',
        address_line1: '',
        address_line2: '',
        city: '',
        state: '',
        postal_code: '',
        country: '',
        linkedin_url: '',
        twitter_url: '',
        facebook_url: '',
        tax_id: '',
        annual_revenue: '',
        currency: 'USD',
        status: 'prospect',
        owner_id: auth.user.id.toString(),
    });

    useEffect(() => {
        if (company) {
            setFormData({
                name: company.name || '',
                legal_name: company.legal_name || '',
                email: company.email || '',
                phone: company.phone || '',
                website: company.website || '',
                industry: company.industry || '',
                company_size: company.company_size || '',
                description: company.description || '',
                address_line1: company.address_line1 || '',
                address_line2: company.address_line2 || '',
                city: company.city || '',
                state: company.state || '',
                postal_code: company.postal_code || '',
                country: company.country || '',
                linkedin_url: company.linkedin_url || '',
                twitter_url: company.twitter_url || '',
                facebook_url: company.facebook_url || '',
                tax_id: company.tax_id || '',
                annual_revenue: company.annual_revenue || '',
                currency: company.currency || 'USD',
                status: company.status || 'prospect',
                owner_id: company.owner?.id?.toString() || auth.user.id.toString(),
            });
        } else {
            // Reset form for new company
            setFormData({
                name: '',
                legal_name: '',
                email: '',
                phone: '',
                website: '',
                industry: '',
                company_size: '',
                description: '',
                address_line1: '',
                address_line2: '',
                city: '',
                state: '',
                postal_code: '',
                country: '',
                linkedin_url: '',
                twitter_url: '',
                facebook_url: '',
                tax_id: '',
                annual_revenue: '',
                currency: 'USD',
                status: 'prospect',
                owner_id: auth.user.id.toString(),
            });
        }
        setErrors({});
    }, [company, open]);

    const handleChange = (
        e: React.ChangeEvent<
            HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >,
    ) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
        // Clear error for this field
        if (errors[name]) {
            setErrors((prev) => {
                const newErrors = { ...prev };
                delete newErrors[name];
                return newErrors;
            });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrors({});

        try {
            const url = isEditing
                ? `/admin/companies/${company.id}`
                : '/admin/companies';
            const method = isEditing ? 'put' : 'post';

            const response = await axios[method](url, formData);

            if (response.data.success) {
                handleApiResponse(response);
                onSuccess();
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

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>
                        {isEditing ? 'Edit Company' : 'Add New Company'}
                    </DialogTitle>
                    <DialogDescription>
                        {isEditing
                            ? 'Update company information below.'
                            : 'Fill in the company details below.'}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Basic Information */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold">
                            Basic Information
                        </h3>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="name">
                                    Company Name{' '}
                                    <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="name"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    placeholder="Acme Corporation"
                                />
                                {errors.name && (
                                    <p className="text-sm text-destructive">
                                        {errors.name[0]}
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="legal_name">Legal Name</Label>
                                <Input
                                    id="legal_name"
                                    name="legal_name"
                                    value={formData.legal_name}
                                    onChange={handleChange}
                                    placeholder="Acme Corporation Inc."
                                />
                                {errors.legal_name && (
                                    <p className="text-sm text-destructive">
                                        {errors.legal_name[0]}
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    name="email"
                                    type="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    placeholder="contact@acme.com"
                                />
                                {errors.email && (
                                    <p className="text-sm text-destructive">
                                        {errors.email[0]}
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="phone">Phone</Label>
                                <Input
                                    id="phone"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    placeholder="+1 (555) 123-4567"
                                />
                                {errors.phone && (
                                    <p className="text-sm text-destructive">
                                        {errors.phone[0]}
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="website">Website</Label>
                                <Input
                                    id="website"
                                    name="website"
                                    type="url"
                                    value={formData.website}
                                    onChange={handleChange}
                                    placeholder="https://acme.com"
                                />
                                {errors.website && (
                                    <p className="text-sm text-destructive">
                                        {errors.website[0]}
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="industry">Industry</Label>
                                <Input
                                    id="industry"
                                    name="industry"
                                    value={formData.industry}
                                    onChange={handleChange}
                                    placeholder="Technology"
                                />
                                {errors.industry && (
                                    <p className="text-sm text-destructive">
                                        {errors.industry[0]}
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="company_size">
                                    Company Size
                                </Label>
                                <Select
                                    name="company_size"
                                    value={formData.company_size}
                                    onValueChange={(value) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            company_size: value,
                                        }))
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select size" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1-10">
                                            1-10
                                        </SelectItem>
                                        <SelectItem value="11-50">
                                            11-50
                                        </SelectItem>
                                        <SelectItem value="51-200">
                                            51-200
                                        </SelectItem>
                                        <SelectItem value="201-500">
                                            201-500
                                        </SelectItem>
                                        <SelectItem value="501-1000">
                                            501-1000
                                        </SelectItem>
                                        <SelectItem value="1000+">
                                            1000+
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                                {errors.company_size && (
                                    <p className="text-sm text-destructive">
                                        {errors.company_size[0]}
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="status">
                                    Status{' '}
                                    <span className="text-destructive">*</span>
                                </Label>
                                <Select
                                    name="status"
                                    value={formData.status}
                                    onValueChange={(value) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            status: value,
                                        }))
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="prospect">
                                            Prospect
                                        </SelectItem>
                                        <SelectItem value="customer">
                                            Customer
                                        </SelectItem>
                                        <SelectItem value="partner">
                                            Partner
                                        </SelectItem>
                                        <SelectItem value="active">
                                            Active
                                        </SelectItem>
                                        <SelectItem value="inactive">
                                            Inactive
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                                {errors.status && (
                                    <p className="text-sm text-destructive">
                                        {errors.status[0]}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                name="description"
                                value={formData.description}
                                onChange={handleChange}
                                placeholder="Brief description about the company..."
                                rows={3}
                            />
                            {errors.description && (
                                <p className="text-sm text-destructive">
                                    {errors.description[0]}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Address */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold">Address</h3>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2 sm:col-span-2">
                                <Label htmlFor="address_line1">
                                    Address Line 1
                                </Label>
                                <Input
                                    id="address_line1"
                                    name="address_line1"
                                    value={formData.address_line1}
                                    onChange={handleChange}
                                    placeholder="123 Main Street"
                                />
                            </div>

                            <div className="space-y-2 sm:col-span-2">
                                <Label htmlFor="address_line2">
                                    Address Line 2
                                </Label>
                                <Input
                                    id="address_line2"
                                    name="address_line2"
                                    value={formData.address_line2}
                                    onChange={handleChange}
                                    placeholder="Suite 100"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="city">City</Label>
                                <Input
                                    id="city"
                                    name="city"
                                    value={formData.city}
                                    onChange={handleChange}
                                    placeholder="San Francisco"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="state">State</Label>
                                <Input
                                    id="state"
                                    name="state"
                                    value={formData.state}
                                    onChange={handleChange}
                                    placeholder="California"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="postal_code">
                                    Postal Code
                                </Label>
                                <Input
                                    id="postal_code"
                                    name="postal_code"
                                    value={formData.postal_code}
                                    onChange={handleChange}
                                    placeholder="94102"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="country">Country</Label>
                                <Input
                                    id="country"
                                    name="country"
                                    value={formData.country}
                                    onChange={handleChange}
                                    placeholder="United States"
                                />
                            </div>
                        </div>
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
                                    ? 'Update Company'
                                    : 'Create Company'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
