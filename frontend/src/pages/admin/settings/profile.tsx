import { Transition } from '@headlessui/react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import axios from '@/lib/axios';
import { handleApiResponse, handleApiError } from '@/lib/toast';

import DeleteUser from '@/components/delete-user';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { type BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Profile settings',
        href: '/admin/settings/profile',
    },
];

export default function Profile() {
    const { user: authUser, refreshUser } = useAuth();
    const user = authUser as any;

    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoUploading, setPhotoUploading] = useState(false);
    const [photoSuccess, setPhotoSuccess] = useState(false);
    const [photoErrors, setPhotoErrors] = useState<Record<string, string>>({});

    // Personal info form state
    const [personalForm, setPersonalForm] = useState({
        name: user?.name || '',
        email: user?.email || '',
        phone: user?.phone || '',
        date_of_birth: user?.date_of_birth || '',
        gender: user?.gender || '',
        timezone: user?.timezone || '',
        bio: user?.bio || '',
    });
    const [personalProcessing, setPersonalProcessing] = useState(false);
    const [personalSuccess, setPersonalSuccess] = useState(false);
    const [personalErrors, setPersonalErrors] = useState<Record<string, string>>({});

    // Address form state
    const [addressForm, setAddressForm] = useState({
        address: user?.address || '',
        city: user?.city || '',
        state: user?.state || '',
        country: user?.country || '',
        postal_code: user?.postal_code || '',
    });
    const [addressProcessing, setAddressProcessing] = useState(false);
    const [addressSuccess, setAddressSuccess] = useState(false);
    const [addressErrors, setAddressErrors] = useState<Record<string, string>>({});

    const handlePhotoSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!photoFile) return;
        setPhotoUploading(true);
        setPhotoErrors({});
        try {
            const formData = new FormData();
            formData.append('photo', photoFile);
            formData.append('_method', 'PATCH');
            formData.append('name', user?.name || '');
            formData.append('email', user?.email || '');
            const response = await axios.post('/admin/settings/profile', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            handleApiResponse(response);
            setPhotoPreview(null);
            setPhotoFile(null);
            setPhotoSuccess(true);
            setTimeout(() => setPhotoSuccess(false), 2000);
            if (refreshUser) refreshUser();
        } catch (error: any) {
            if (error.response?.data?.errors) {
                setPhotoErrors(error.response.data.errors);
            }
            handleApiError(error);
        } finally {
            setPhotoUploading(false);
        }
    };

    const handlePersonalSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setPersonalProcessing(true);
        setPersonalErrors({});
        try {
            const response = await axios.patch('/admin/settings/profile', personalForm);
            handleApiResponse(response);
            setPersonalSuccess(true);
            setTimeout(() => setPersonalSuccess(false), 2000);
            if (refreshUser) refreshUser();
        } catch (error: any) {
            if (error.response?.data?.errors) {
                setPersonalErrors(error.response.data.errors);
            }
            handleApiError(error);
        } finally {
            setPersonalProcessing(false);
        }
    };

    const handleAddressSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setAddressProcessing(true);
        setAddressErrors({});
        try {
            const response = await axios.patch('/admin/settings/profile', addressForm);
            handleApiResponse(response);
            setAddressSuccess(true);
            setTimeout(() => setAddressSuccess(false), 2000);
            if (refreshUser) refreshUser();
        } catch (error: any) {
            if (error.response?.data?.errors) {
                setAddressErrors(error.response.data.errors);
            }
            handleApiError(error);
        } finally {
            setAddressProcessing(false);
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>

            <h1 className="sr-only">Profile Settings</h1>

            <SettingsLayout>
                <div className="space-y-6">
                    {/* Profile Photo Section */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Profile photo</CardTitle>
                            <CardDescription>Upload a new profile picture</CardDescription>
                        </CardHeader>
                        <CardContent>
                        <form onSubmit={handlePhotoSubmit} className="space-y-4">
                            <div className="flex gap-6">
                                <div className="flex-shrink-0">
                                    <img
                                        src={
                                            photoPreview ||
                                            user?.photo ||
                                            `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || '')}&background=random`
                                        }
                                        alt={user?.name || 'Profile'}
                                        className="h-24 w-24 rounded-full object-cover"
                                    />
                                </div>

                                <div className="space-y-3">
                                    <Label htmlFor="photo">Change photo</Label>
                                    <p className="text-xs text-muted-foreground">
                                        JPG, PNG, GIF up to 5MB
                                    </p>
                                    <input
                                        ref={fileInputRef}
                                        id="photo"
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => {
                                            const file = e.currentTarget.files?.[0] || null;
                                            setPhotoFile(file);
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onloadend = () => setPhotoPreview(reader.result as string);
                                                reader.readAsDataURL(file);
                                            } else {
                                                setPhotoPreview(null);
                                            }
                                        }}
                                        className="hidden"
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        <Upload className="h-4 w-4 mr-2" />
                                        Choose photo
                                    </Button>
                                    {photoErrors.photo && (
                                        <InputError className="mt-2" message={photoErrors.photo} />
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <Button
                                    type="submit"
                                    disabled={photoUploading || !photoFile}
                                >
                                    Save photo
                                </Button>
                                <Transition
                                    show={photoSuccess}
                                    enter="transition ease-in-out"
                                    enterFrom="opacity-0"
                                    leave="transition ease-in-out"
                                    leaveTo="opacity-0"
                                >
                                    <p className="text-sm text-neutral-600">Saved</p>
                                </Transition>
                            </div>
                        </form>
                        </CardContent>
                    </Card>

                    {/* Personal Information */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Personal information</CardTitle>
                            <CardDescription>Update your personal details</CardDescription>
                        </CardHeader>
                        <CardContent>
                        <form onSubmit={handlePersonalSubmit} className="space-y-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="grid gap-2">
                                    <Label htmlFor="name">Full Name</Label>
                                    <Input
                                        id="name"
                                        className="mt-1 block w-full"
                                        value={personalForm.name}
                                        onChange={(e) => setPersonalForm({ ...personalForm, name: e.target.value })}
                                        required
                                        autoComplete="name"
                                        placeholder="Full name"
                                    />
                                    <InputError className="mt-2" message={personalErrors.name} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        className="mt-1 block w-full"
                                        value={personalForm.email}
                                        onChange={(e) => setPersonalForm({ ...personalForm, email: e.target.value })}
                                        required
                                        autoComplete="username"
                                        placeholder="Email address"
                                    />
                                    <InputError className="mt-2" message={personalErrors.email} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="phone">Phone</Label>
                                    <Input
                                        id="phone"
                                        type="tel"
                                        className="mt-1 block w-full"
                                        value={personalForm.phone}
                                        onChange={(e) => setPersonalForm({ ...personalForm, phone: e.target.value })}
                                        autoComplete="tel"
                                        placeholder="Phone number"
                                    />
                                    <InputError className="mt-2" message={personalErrors.phone} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="date_of_birth">Date of Birth</Label>
                                    <Input
                                        id="date_of_birth"
                                        type="date"
                                        className="mt-1 block w-full"
                                        value={personalForm.date_of_birth}
                                        onChange={(e) => setPersonalForm({ ...personalForm, date_of_birth: e.target.value })}
                                    />
                                    <InputError className="mt-2" message={personalErrors.date_of_birth} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="gender">Gender</Label>
                                    <select
                                        id="gender"
                                        value={personalForm.gender}
                                        onChange={(e) => setPersonalForm({ ...personalForm, gender: e.target.value })}
                                        className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <option value="">Select gender</option>
                                        <option value="male">Male</option>
                                        <option value="female">Female</option>
                                        <option value="other">Other</option>
                                    </select>
                                    <InputError className="mt-2" message={personalErrors.gender} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="timezone">Timezone</Label>
                                    <Input
                                        id="timezone"
                                        className="mt-1 block w-full"
                                        value={personalForm.timezone}
                                        onChange={(e) => setPersonalForm({ ...personalForm, timezone: e.target.value })}
                                        placeholder="e.g., UTC, Asia/Kolkata"
                                    />
                                    <InputError className="mt-2" message={personalErrors.timezone} />
                                </div>
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="bio">Bio</Label>
                                <Textarea
                                    id="bio"
                                    className="mt-1 block w-full"
                                    value={personalForm.bio}
                                    onChange={(e) => setPersonalForm({ ...personalForm, bio: e.target.value })}
                                    placeholder="Tell us about yourself"
                                    rows={3}
                                />
                                <InputError className="mt-2" message={personalErrors.bio} />
                            </div>

                            <div className="flex items-center gap-4">
                                <Button disabled={personalProcessing} data-test="update-profile-button">
                                    Save personal info
                                </Button>
                                <Transition
                                    show={personalSuccess}
                                    enter="transition ease-in-out"
                                    enterFrom="opacity-0"
                                    leave="transition ease-in-out"
                                    leaveTo="opacity-0"
                                >
                                    <p className="text-sm text-neutral-600">Saved</p>
                                </Transition>
                            </div>
                        </form>
                        </CardContent>
                    </Card>

                    {/* Address Information */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Address</CardTitle>
                            <CardDescription>Update your address information</CardDescription>
                        </CardHeader>
                        <CardContent>
                        <form onSubmit={handleAddressSubmit} className="space-y-6">
                            <div className="grid gap-2">
                                <Label htmlFor="address">Street Address</Label>
                                <Input
                                    id="address"
                                    className="mt-1 block w-full"
                                    value={addressForm.address}
                                    onChange={(e) => setAddressForm({ ...addressForm, address: e.target.value })}
                                    placeholder="Street address"
                                />
                                <InputError className="mt-2" message={addressErrors.address} />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="grid gap-2">
                                    <Label htmlFor="city">City</Label>
                                    <Input
                                        id="city"
                                        className="mt-1 block w-full"
                                        value={addressForm.city}
                                        onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                                        placeholder="City"
                                    />
                                    <InputError className="mt-2" message={addressErrors.city} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="state">State</Label>
                                    <Input
                                        id="state"
                                        className="mt-1 block w-full"
                                        value={addressForm.state}
                                        onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value })}
                                        placeholder="State"
                                    />
                                    <InputError className="mt-2" message={addressErrors.state} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="country">Country</Label>
                                    <Input
                                        id="country"
                                        className="mt-1 block w-full"
                                        value={addressForm.country}
                                        onChange={(e) => setAddressForm({ ...addressForm, country: e.target.value })}
                                        placeholder="Country"
                                    />
                                    <InputError className="mt-2" message={addressErrors.country} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="postal_code">Postal Code</Label>
                                    <Input
                                        id="postal_code"
                                        className="mt-1 block w-full"
                                        value={addressForm.postal_code}
                                        onChange={(e) => setAddressForm({ ...addressForm, postal_code: e.target.value })}
                                        placeholder="Postal code"
                                    />
                                    <InputError className="mt-2" message={addressErrors.postal_code} />
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <Button disabled={addressProcessing} data-test="update-profile-button">
                                    Save address
                                </Button>
                                <Transition
                                    show={addressSuccess}
                                    enter="transition ease-in-out"
                                    enterFrom="opacity-0"
                                    leave="transition ease-in-out"
                                    leaveTo="opacity-0"
                                >
                                    <p className="text-sm text-neutral-600">Saved</p>
                                </Transition>
                            </div>
                        </form>
                        </CardContent>
                    </Card>

                    {/* Bank & Identification Details Section (Read-Only) */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Bank & identification details</CardTitle>
                            <CardDescription>Your bank account and government identification information</CardDescription>
                        </CardHeader>
                        <CardContent>
                        <div className="bg-muted/30 rounded-lg p-6 space-y-6 border border-border">
                            {/* Bank Details */}
                            {(user?.bank_name ||
                                user?.account_number ||
                                user?.ifsc_code) && (
                                    <div>
                                        <h3 className="text-sm font-semibold mb-4">
                                            Bank Details
                                        </h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                            {user?.bank_name && (
                                                <div>
                                                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                                                        Bank Name
                                                    </Label>
                                                    <p className="mt-2 font-medium">
                                                        {user.bank_name}
                                                    </p>
                                                </div>
                                            )}
                                            {user?.account_number && (
                                                <div>
                                                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                                                        Account Number
                                                    </Label>
                                                    <p className="mt-2 font-medium">
                                                        {user.account_number}
                                                    </p>
                                                </div>
                                            )}
                                            {user?.ifsc_code && (
                                                <div>
                                                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                                                        IFSC Code
                                                    </Label>
                                                    <p className="mt-2 font-medium">
                                                        {user.ifsc_code}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                            {/* Government IDs */}
                            {(user?.aadhar_number ||
                                user?.pan_number ||
                                user?.pf_number ||
                                user?.esi_number) && (
                                    <div className="border-t border-border pt-6">
                                        <h3 className="text-sm font-semibold mb-4">
                                            Government & Statutory IDs
                                        </h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                            {user?.aadhar_number && (
                                                <div>
                                                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                                                        Aadhar Number
                                                    </Label>
                                                    <p className="mt-2 font-medium">
                                                        {user.aadhar_number}
                                                    </p>
                                                </div>
                                            )}
                                            {user?.pan_number && (
                                                <div>
                                                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                                                        PAN Number
                                                    </Label>
                                                    <p className="mt-2 font-medium">
                                                        {user.pan_number}
                                                    </p>
                                                </div>
                                            )}
                                            {user?.pf_number && (
                                                <div>
                                                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                                                        PF Number
                                                    </Label>
                                                    <p className="mt-2 font-medium">
                                                        {user.pf_number}
                                                    </p>
                                                </div>
                                            )}
                                            {user?.esi_number && (
                                                <div>
                                                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                                                        ESI Number
                                                    </Label>
                                                    <p className="mt-2 font-medium">
                                                        {user.esi_number}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                            {!user?.bank_name &&
                                !user?.account_number &&
                                !user?.ifsc_code &&
                                !user?.aadhar_number &&
                                !user?.pan_number &&
                                !user?.pf_number &&
                                !user?.esi_number && (
                                    <p className="text-sm text-muted-foreground italic">
                                        No bank or identification details on
                                        file.
                                    </p>
                                )}
                        </div>
                        </CardContent>
                    </Card>

                    <DeleteUser />
                </div>
            </SettingsLayout>
        </AppLayout>
    );
}
