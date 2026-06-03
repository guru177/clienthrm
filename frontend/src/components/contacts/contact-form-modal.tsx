
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

interface ContactFormModalProps {
    open: boolean;
    onClose: () => void;
    contact?: any;
    onSuccess: () => void;
}

export default function ContactFormModal({
    open,
    onClose,
    contact,
    onSuccess,
}: ContactFormModalProps) {
    const { user: authUser } = useAuth();
    const isEditing = !!contact;

    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [companies, setCompanies] = useState<any[]>([]);
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        mobile: '',
        job_title: '',
        department: '',
        company_id: '',
        owner_id: auth.user.id.toString(),
        status: 'active',
        contact_type: 'primary',
        address: '',
        city: '',
        state: '',
        country: '',
        postal_code: '',
        birthday: '',
        linkedin: '',
        twitter: '',
        notes: '',
    });

    useEffect(() => {
        if (open) {
            fetchCompanies();
        }
    }, [open]);

    useEffect(() => {
        if (contact) {
            setFormData({
                first_name: contact.first_name || '',
                last_name: contact.last_name || '',
                email: contact.email || '',
                phone: contact.phone || '',
                mobile: contact.mobile || '',
                job_title: contact.job_title || '',
                department: contact.department || '',
                company_id: contact.company_id?.toString() || '',
                owner_id: contact.owner?.id?.toString() || auth.user.id.toString(),
                status: contact.status || 'active',
                contact_type: contact.contact_type || 'primary',
                address: contact.address || '',
                city: contact.city || '',
                state: contact.state || '',
                country: contact.country || '',
                postal_code: contact.postal_code || '',
                birthday: contact.birthday || '',
                linkedin: contact.linkedin || '',
                twitter: contact.twitter || '',
                notes: contact.notes || '',
            });
        } else {
            setFormData({
                first_name: '',
                last_name: '',
                email: '',
                phone: '',
                mobile: '',
                job_title: '',
                department: '',
                company_id: '',
                owner_id: auth.user.id.toString(),
                status: 'active',
                contact_type: 'primary',
                address: '',
                city: '',
                state: '',
                country: '',
                postal_code: '',
                birthday: '',
                linkedin: '',
                twitter: '',
                notes: '',
            });
        }
        setErrors({});
    }, [contact, open]);

    const fetchCompanies = async () => {
        try {
            const response = await axios.get('/admin/companies/list', {
                params: { per_page: 100 },
            });
            if (response.data.success) {
                setCompanies(response.data.data);
            }
        } catch (error) {
            console.error('Failed to fetch companies:', error);
        }
    };

    const handleChange = (
        e: React.ChangeEvent<
            HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >,
    ) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
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
            const url = isEditing ? `/admin/contacts/${contact.id}` : '/admin/contacts';
            const method = isEditing ? 'put' : 'post';

            // Convert empty strings to null for nullable fields
            const submitData = Object.fromEntries(
                Object.entries(formData).map(([key, value]) => [
                    key,
                    value === '' ? null : value,
                ]),
            );

            const response = await axios[method](url, submitData);

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
                        {isEditing ? 'Edit Contact' : 'Add New Contact'}
                    </DialogTitle>
                    <DialogDescription>
                        {isEditing
                            ? 'Update contact information below.'
                            : 'Fill in the contact details below.'}
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
                                <Label htmlFor="first_name">
                                    First Name{' '}
                                    <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="first_name"
                                    name="first_name"
                                    value={formData.first_name}
                                    onChange={handleChange}
                                    disabled={loading}
                                />
                                {errors.first_name && (
                                    <p className="text-sm text-destructive">
                                        {errors.first_name[0]}
                                    </p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="last_name">
                                    Last Name{' '}
                                    <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="last_name"
                                    name="last_name"
                                    value={formData.last_name}
                                    onChange={handleChange}
                                    disabled={loading}
                                />
                                {errors.last_name && (
                                    <p className="text-sm text-destructive">
                                        {errors.last_name[0]}
                                    </p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">
                                    Email{' '}
                                    <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="email"
                                    name="email"
                                    type="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    disabled={loading}
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
                                    disabled={loading}
                                />
                                {errors.phone && (
                                    <p className="text-sm text-destructive">
                                        {errors.phone[0]}
                                    </p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="mobile">Mobile</Label>
                                <Input
                                    id="mobile"
                                    name="mobile"
                                    value={formData.mobile}
                                    onChange={handleChange}
                                    disabled={loading}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="job_title">Job Title</Label>
                                <Input
                                    id="job_title"
                                    name="job_title"
                                    value={formData.job_title}
                                    onChange={handleChange}
                                    disabled={loading}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="department">Department</Label>
                                <Input
                                    id="department"
                                    name="department"
                                    value={formData.department}
                                    onChange={handleChange}
                                    disabled={loading}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="company_id">Company</Label>
                                <Select
                                    value={formData.company_id || undefined}
                                    onValueChange={(value) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            company_id: value,
                                        }))
                                    }
                                    disabled={loading}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="No Company" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {companies.map((company) => (
                                            <SelectItem
                                                key={company.id}
                                                value={company.id.toString()}
                                            >
                                                {company.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    {/* Status & Type */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold">
                            Status & Type
                        </h3>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="status">Status</Label>
                                <Select
                                    value={formData.status}
                                    onValueChange={(value) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            status: value,
                                        }))
                                    }
                                    disabled={loading}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="active">
                                            Active
                                        </SelectItem>
                                        <SelectItem value="inactive">
                                            Inactive
                                        </SelectItem>
                                        <SelectItem value="lead">
                                            Lead
                                        </SelectItem>
                                        <SelectItem value="customer">
                                            Customer
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="contact_type">
                                    Contact Type
                                </Label>
                                <Select
                                    value={formData.contact_type}
                                    onValueChange={(value) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            contact_type: value,
                                        }))
                                    }
                                    disabled={loading}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="primary">
                                            Primary
                                        </SelectItem>
                                        <SelectItem value="secondary">
                                            Secondary
                                        </SelectItem>
                                        <SelectItem value="billing">
                                            Billing
                                        </SelectItem>
                                        <SelectItem value="technical">
                                            Technical
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    {/* Address */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold">Address</h3>
                        <div className="grid gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="address">Address</Label>
                                <Textarea
                                    id="address"
                                    name="address"
                                    value={formData.address}
                                    onChange={handleChange}
                                    disabled={loading}
                                    rows={2}
                                />
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="city">City</Label>
                                    <Input
                                        id="city"
                                        name="city"
                                        value={formData.city}
                                        onChange={handleChange}
                                        disabled={loading}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="state">State</Label>
                                    <Input
                                        id="state"
                                        name="state"
                                        value={formData.state}
                                        onChange={handleChange}
                                        disabled={loading}
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
                                        disabled={loading}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="country">Country</Label>
                                    <Input
                                        id="country"
                                        name="country"
                                        value={formData.country}
                                        onChange={handleChange}
                                        disabled={loading}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Additional Info */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold">
                            Additional Information
                        </h3>
                        <div className="grid gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="notes">Notes</Label>
                                <Textarea
                                    id="notes"
                                    name="notes"
                                    value={formData.notes}
                                    onChange={handleChange}
                                    disabled={loading}
                                    rows={3}
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
                                ? isEditing
                                    ? 'Updating...'
                                    : 'Creating...'
                                : isEditing
                                    ? 'Update Contact'
                                    : 'Create Contact'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
