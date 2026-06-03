import { useNavigate } from 'react-router-dom';
import axios from '@/lib/axios';
import { ArrowLeft, Banknote, Briefcase, Building2, Camera, Save, Trash2, Upload, Users, Shield, X } from 'lucide-react';
import { useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import AppLayout from '@/layouts/app-layout';
import { SalaryStructurePanel } from '@/components/salary-structure-panel';
import { handleApiError, handleApiResponse } from '@/lib/toast';

interface Role {
    id: number;
    name: string;
    slug: string;
    description: string | null;
}

interface Department {
    id: number;
    name: string;
}

interface Designation {
    id: number;
    name: string;
}

interface User {
    id: number;
    name: string;
    email: string;
    employee_id?: string;
    phone?: string;
    photo?: string;
    department_id?: number;
    designation_id?: number;
    status: string;
    roles: Role[];
    created_at: string;
    // Employment
    date_of_joining?: string;
    work_location?: string;
    // Bank
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
    account_type?: string;
}

interface Center {
    id: string;
    name: string;
    address_line1?: string;
    city?: string;
    state?: string;
}

interface EditUserPageProps {
    user?: User;
    roles?: Role[];
    departments?: Department[];
    designations?: Designation[];
    centers?: Center[];
}

export default function EditUserPage({
    user = {} as User,
    roles = [],
    departments = [],
    designations = [],
    centers: initialCenters = [],
}: EditUserPageProps) {
    const navigate = useNavigate();
    const isSuperAdmin = false; // managed via Settings > Centers

    const [formData, setFormData] = useState({
        name: user.name,
        email: user.email,
        employee_id: user.employee_id || '',
        phone: user.phone || '',
        department_id: user.department_id || '',
        designation_id: user.designation_id || '',
        status: user.status,
        roles: user.roles.map((r) => r.id),
        // Employment
        date_of_joining: user.date_of_joining || '',
        work_location: user.work_location || '',
        // Bank
        bank_name: user.bank_name || '',
        account_number: user.account_number || '',
        ifsc_code: user.ifsc_code || '',
        account_type: user.account_type || '',
    });
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(
        user.photo
            ? user.photo.startsWith('http')
                ? user.photo
                : `/storage/${user.photo}`
            : null,
    );
    const [removePhoto, setRemovePhoto] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [loading, setLoading] = useState(false);
    const [saved, setSaved] = useState(false);

    const [centers, setCenters] = useState<Center[]>(initialCenters ?? []);

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                setErrors({ ...errors, photo: ['Photo must be less than 2MB'] });
                return;
            }
            setPhotoFile(file);
            setRemovePhoto(false);
            const reader = new FileReader();
            reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleRemovePhoto = () => {
        setPhotoFile(null);
        setPhotoPreview(null);
        setRemovePhoto(true);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrors({});
        setSaved(false);

        try {
            // Update basic user info using FormData for file upload support
            const payload = new FormData();
            payload.append('_method', 'PUT');
            payload.append('name', formData.name);
            payload.append('email', formData.email);
            payload.append('employee_id', formData.employee_id as string);
            payload.append('phone', formData.phone as string);
            if (formData.department_id) payload.append('department_id', String(formData.department_id));
            if (formData.designation_id) payload.append('designation_id', String(formData.designation_id));
            payload.append('status', formData.status);
            // Employment details
            if (formData.date_of_joining) payload.append('date_of_joining', formData.date_of_joining as string);
            if (formData.work_location)   payload.append('work_location', formData.work_location as string);
            // Bank details
            if (formData.bank_name)      payload.append('bank_name', formData.bank_name as string);
            if (formData.account_number) payload.append('account_number', formData.account_number as string);
            if (formData.ifsc_code)      payload.append('ifsc_code', formData.ifsc_code as string);
            if (formData.account_type)   payload.append('account_type', formData.account_type as string);
            if (photoFile) payload.append('photo', photoFile);
            if (removePhoto) payload.append('remove_photo', '1');

            await axios.post(`/admin/users/${user.id}`, payload, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            // Update roles separately
            await axios.put(`/admin/users/${user.id}/roles`, {
                roles: formData.roles,
            });

            handleApiResponse({
                data: {
                    type: 'success',
                    message: 'User updated successfully',
                },
            } as any);

            // Show saved state
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (error: any) {
            if (error.response?.data?.errors) {
                setErrors(error.response.data.errors);
            }
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const handleRoleToggle = (roleId: number) => {
        setFormData((prev) => ({
            ...prev,
            roles: prev.roles.includes(roleId)
                ? prev.roles.filter((id) => id !== roleId)
                : [...prev.roles, roleId],
        }));
    };

    const breadcrumbs = [
        { label: 'Users', href: '/admin/users' },
        { label: user.name, href: '#' },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>

            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => navigate('/admin/users')}
                            >
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <div>
                                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                                    <Users className="h-8 w-8 text-primary" />
                                    Edit User
                                </h1>
                                <p className="text-muted-foreground">
                                    Update user information and assign roles
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant={formData.status === 'active' ? 'default' : 'secondary'}>
                            {formData.status}
                        </Badge>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Profile Photo */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Profile Photo</CardTitle>
                            <CardDescription>
                                Upload a profile photo for this user (max 2MB, JPG/PNG)
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-6">
                                <div className="relative group">
                                    <div className="h-24 w-24 rounded-full overflow-hidden border-2 border-muted bg-muted flex items-center justify-center">
                                        {photoPreview ? (
                                            <img
                                                src={photoPreview}
                                                alt={formData.name}
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <Camera className="h-8 w-8 text-muted-foreground" />
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                                    >
                                        <Upload className="h-5 w-5 text-white" />
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/gif,image/webp"
                                        onChange={handlePhotoChange}
                                        className="hidden"
                                    />
                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            <Upload className="mr-2 h-4 w-4" />
                                            {photoPreview ? 'Change Photo' : 'Upload Photo'}
                                        </Button>
                                        {photoPreview && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={handleRemovePhoto}
                                                className="text-destructive hover:text-destructive"
                                            >
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                Remove
                                            </Button>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Accepted formats: JPG, PNG, GIF, WebP. Max size: 2MB.
                                    </p>
                                    {errors.photo && (
                                        <p className="text-sm text-destructive">{errors.photo[0]}</p>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Basic Information */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Basic Information</CardTitle>
                            <CardDescription>
                                Update user details
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">
                                        Name <span className="text-destructive">*</span>
                                    </Label>
                                    <Input
                                        id="name"
                                        value={formData.name}
                                        onChange={(e) =>
                                            setFormData({ ...formData, name: e.target.value })
                                        }
                                        placeholder="Full name"
                                    />
                                    {errors.name && (
                                        <p className="text-sm text-destructive">{errors.name[0]}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="email">
                                        Email <span className="text-destructive">*</span>
                                    </Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) =>
                                            setFormData({ ...formData, email: e.target.value })
                                        }
                                        placeholder="user@example.com"
                                    />
                                    {errors.email && (
                                        <p className="text-sm text-destructive">{errors.email[0]}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="employee_id">Employee ID</Label>
                                    <Input
                                        id="employee_id"
                                        value={formData.employee_id}
                                        onChange={(e) =>
                                            setFormData({ ...formData, employee_id: e.target.value })
                                        }
                                        placeholder="EMP001"
                                    />
                                    {errors.employee_id && (
                                        <p className="text-sm text-destructive">{errors.employee_id[0]}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="phone">Phone</Label>
                                    <Input
                                        id="phone"
                                        value={formData.phone}
                                        onChange={(e) =>
                                            setFormData({ ...formData, phone: e.target.value })
                                        }
                                        placeholder="Phone number"
                                    />
                                    {errors.phone && (
                                        <p className="text-sm text-destructive">{errors.phone[0]}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="status">Status</Label>
                                    <Select
                                        value={formData.status}
                                        onValueChange={(value) =>
                                            setFormData({ ...formData, status: value })
                                        }
                                    >
                                        <SelectTrigger id="status">
                                            <SelectValue placeholder="Select status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="active">Active</SelectItem>
                                            <SelectItem value="inactive">Inactive</SelectItem>
                                            <SelectItem value="suspended">Suspended</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {errors.status && (
                                        <p className="text-sm text-destructive">
                                            {errors.status[0]}
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="department">Department</Label>
                                    <Select
                                        value={String(formData.department_id) || ''}
                                        onValueChange={(value) =>
                                            setFormData({
                                                ...formData,
                                                department_id: value ? parseInt(value) : '',
                                            })
                                        }
                                    >
                                        <SelectTrigger id="department">
                                            <SelectValue placeholder="Select department" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {departments.map((dept) => (
                                                <SelectItem key={dept.id} value={String(dept.id)}>
                                                    {dept.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {errors.department_id && (
                                        <p className="text-sm text-destructive">
                                            {errors.department_id[0]}
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="designation">Designation</Label>
                                    <Select
                                        value={String(formData.designation_id) || ''}
                                        onValueChange={(value) =>
                                            setFormData({
                                                ...formData,
                                                designation_id: value ? parseInt(value) : '',
                                            })
                                        }
                                    >
                                        <SelectTrigger id="designation">
                                            <SelectValue placeholder="Select designation" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {designations.map((desig) => (
                                                <SelectItem key={desig.id} value={String(desig.id)}>
                                                    {desig.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {errors.designation_id && (
                                        <p className="text-sm text-destructive">
                                            {errors.designation_id[0]}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Employment Details */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Briefcase className="h-5 w-5" />
                                Employment Details
                            </CardTitle>
                            <CardDescription>Work-related information for this employee</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="date_of_joining">Date of Joining</Label>
                                    <Input
                                        id="date_of_joining"
                                        type="date"
                                        value={formData.date_of_joining as string}
                                        onChange={(e) => setFormData({ ...formData, date_of_joining: e.target.value })}
                                    />
                                    {errors.date_of_joining && (
                                        <p className="text-sm text-destructive">{errors.date_of_joining[0]}</p>
                                    )}
                                </div>

                                {/* Center Dropdown */}
                                <div className="space-y-2">
                                    <Label htmlFor="work_location">Center</Label>
                                    {centers.length === 0 ? (
                                        <p className="text-sm text-muted-foreground italic py-2">
                                            No centers configured. Contact admin to add centers via Settings → General Settings.
                                        </p>
                                    ) : (
                                        <Select
                                            value={formData.work_location as string}
                                            onValueChange={(v) => setFormData({ ...formData, work_location: v })}
                                        >
                                            <SelectTrigger id="work_location">
                                                <SelectValue placeholder="Select center" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {centers.map((center) => (
                                                    <SelectItem key={center.id} value={center.id}>
                                                        {center.name}{center.city ? ` — ${center.city}` : ''}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                    {errors.work_location && (
                                        <p className="text-sm text-destructive">{errors.work_location[0]}</p>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Bank Details */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Building2 className="h-5 w-5" />
                                Bank Details
                            </CardTitle>
                            <CardDescription>Bank account details for salary transfer</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="bank_name">Bank Name</Label>
                                    <Input
                                        id="bank_name"
                                        value={formData.bank_name as string}
                                        onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                                        placeholder="e.g. HDFC Bank"
                                    />
                                    {errors.bank_name && (
                                        <p className="text-sm text-destructive">{errors.bank_name[0]}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="account_type">Account Type</Label>
                                    <Select
                                        value={formData.account_type as string}
                                        onValueChange={(v) => setFormData({ ...formData, account_type: v })}
                                    >
                                        <SelectTrigger id="account_type">
                                            <SelectValue placeholder="Select account type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="savings">Savings</SelectItem>
                                            <SelectItem value="current">Current</SelectItem>
                                            <SelectItem value="salary">Salary Account</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="account_number">Account Number</Label>
                                    <Input
                                        id="account_number"
                                        value={formData.account_number as string}
                                        onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                                        placeholder="Bank account number"
                                    />
                                    {errors.account_number && (
                                        <p className="text-sm text-destructive">{errors.account_number[0]}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="ifsc_code">IFSC Code</Label>
                                    <Input
                                        id="ifsc_code"
                                        value={formData.ifsc_code as string}
                                        onChange={(e) => setFormData({ ...formData, ifsc_code: e.target.value.toUpperCase() })}
                                        placeholder="e.g. HDFC0001234"
                                        maxLength={11}
                                        className="uppercase"
                                    />
                                    {errors.ifsc_code && (
                                        <p className="text-sm text-destructive">{errors.ifsc_code[0]}</p>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Roles Assignment */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Assign Roles</CardTitle>
                                    <CardDescription>
                                        Select roles for this user
                                    </CardDescription>
                                </div>
                                <Badge variant="outline">
                                    {formData.roles.length} role
                                    {formData.roles.length !== 1 ? 's' : ''} assigned
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {roles.map((role) => (
                                    <div key={role.id} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                        <Checkbox
                                            id={`role-${role.id}`}
                                            checked={formData.roles.includes(role.id)}
                                            onCheckedChange={() => handleRoleToggle(role.id)}
                                            className="mt-1"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <Label
                                                htmlFor={`role-${role.id}`}
                                                className="font-medium cursor-pointer"
                                            >
                                                {role.name}
                                            </Label>
                                            {role.description && (
                                                <p className="text-xs text-muted-foreground line-clamp-2">
                                                    {role.description}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {errors.roles && (
                                <p className="text-sm text-destructive">{errors.roles[0]}</p>
                            )}
                            {roles.length === 0 && (
                                <p className="text-sm text-muted-foreground text-center py-8">
                                    No roles available. Create roles first.
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Salary Structure */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Banknote className="h-5 w-5" />
                                Salary Structure
                            </CardTitle>
                            <CardDescription>Monthly compensation breakdown based on salary components</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <SalaryStructurePanel userId={user.id} />
                        </CardContent>
                    </Card>

                    {/* Actions */}
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            {saved && (
                                <div className="text-sm text-green-600 font-medium">
                                    ✓ Changes saved successfully
                                </div>
                            )}
                        </div>
                        <div className="flex gap-3">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => navigate('/admin/users')}
                                disabled={loading}
                            >
                                Back to Users
                            </Button>
                            <Button type="submit" disabled={loading}>
                                {loading ? (
                                    <>Saving...</>
                                ) : saved ? (
                                    <>
                                        <span className="mr-2">✓</span>
                                        Saved
                                    </>
                                ) : (
                                    <>
                                        <Save className="mr-2 h-4 w-4" />
                                        Save Changes
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </form>
            </div>
        </AppLayout>
    );
}