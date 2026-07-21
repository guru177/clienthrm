import { useNavigate } from 'react-router-dom';
import axios from '@/lib/axios';
import { storageUrl } from '@/lib/storage-url';
import { ArrowLeft, Banknote, Briefcase, Building2, Camera, IdCard, MapPin, Save, Trash2, Upload, Users } from 'lucide-react';
import { useRef, useState, useEffect, useMemo } from 'react';
import { useStorageSrc } from '@/hooks/use-storage-src';
import { invalidateStorageBlobUrl } from '@/lib/storage-url';
import { useParams } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
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
import { SalaryTabsPanel } from '@/components/salary-tabs-panel';
import { handleApiError, handleApiResponse } from '@/lib/toast';
import { useAuth } from '@/contexts/AuthContext';

const EMPLOYMENT_TYPES = [
    { value: 'full_time', label: 'Full-time' },
    { value: 'part_time', label: 'Part-time' },
    { value: 'contract', label: 'Contract' },
    { value: 'intern', label: 'Intern' },
    { value: 'probation', label: 'Probation' },
] as const;

const GENDER_OPTIONS = [
    { value: 'male', label: 'Male' },
    { value: 'female', label: 'Female' },
    { value: 'other', label: 'Other' },
] as const;

const TAX_REGIMES = [
    { value: 'new', label: 'New regime' },
    { value: 'old', label: 'Old regime' },
] as const;

function toDateInput(value?: string | null): string {
    if (!value) return '';
    return value.length >= 10 ? value.slice(0, 10) : value;
}

interface Role {
    id: number;
    name: string;
    slug: string;
    description: string | null;
}

interface Department {
    id: number;
    name: string;
    center_id?: number;
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
    date_of_birth?: string;
    gender?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    postal_code?: string;
    bio?: string;
    employment_type?: string;
    date_of_joining?: string;
    date_of_exit?: string;
    work_location?: string;
    work_state?: string;
    tax_regime?: string;
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
    account_type?: string;
    pan_number?: string;
    esi_number?: string;
    pf_number?: string;
    aadhar_number?: string;
    emergency_contact?: string;
    doc_aadhaar?: string;
    doc_pan?: string;
    doc_id_proof?: string;
    doc_other?: string;
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

export default function EditUserPage() {
    const navigate = useNavigate();
    const { id } = useParams();
    const { canAccessAllCenters, hasPermission, user: currentUser } = useAuth();
    const isSuperAdmin = false; // managed via Settings > Branches

    // Employees editing their own profile can only change personal fields (name, phone, photo, etc.)
    // Admin-only fields: role, department, designation, branch, salary, status, employment type, employee_id
    const isEditingSelf = !!currentUser && !!id && String(currentUser.id) === String(id);
    const canEditAdminFields = hasPermission('edit-users');

    const [user, setUser] = useState<User | null>(null);
    const [roles, setRoles] = useState<Role[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [designations, setDesignations] = useState<Designation[]>([]);
    const [centers, setCenters] = useState<Center[]>([]);
    const [managedCenterIds, setManagedCenterIds] = useState<number[]>([]);
    const [loading, setLoading] = useState(true);

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        employee_id: '',
        phone: '',
        date_of_birth: '',
        gender: '',
        address: '',
        city: '',
        state: '',
        country: 'India',
        postal_code: '',
        bio: '',
        department_id: '' as string | number,
        designation_id: '' as string | number,
        status: 'active',
        roles: [] as number[],
        employment_type: '',
        date_of_joining: '',
        date_of_exit: '',
        work_location: '',
        work_state: '',
        tax_regime: 'new',
        bank_name: '',
        account_number: '',
        ifsc_code: '',
        account_type: '',
        pan_number: '',
        esi_number: '',
        pf_number: '',
        aadhar_number: '',
        emergency_contact: '',
        is_external: false,
        hr_managed: false,
        enable_login_password: '',
    });
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    // photoPreview: local blob URL (newly selected/webcam file)
    // savedPhotoPath: the server-side path — use useStorageSrc for authenticated fetch
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [savedPhotoPath, setSavedPhotoPath] = useState<string | null>(null);
    const savedPhotoSrc = useStorageSrc(savedPhotoPath);
    // Displayed src: local preview takes priority, then authenticated blob from server
    const displayedPhotoSrc = photoPreview ?? savedPhotoSrc ?? null;
    const [removePhoto, setRemovePhoto] = useState(false);
    const [docFiles, setDocFiles] = useState<{
        doc_aadhaar: File | null;
        doc_pan: File | null;
        doc_id_proof: File | null;
        doc_other: File | null;
    }>({
        doc_aadhaar: null,
        doc_pan: null,
        doc_id_proof: null,
        doc_other: null,
    });
    const [existingDocs, setExistingDocs] = useState<{
        doc_aadhaar?: string | null;
        doc_pan?: string | null;
        doc_id_proof?: string | null;
        doc_other?: string | null;
    }>({});
    const fileInputRef = useRef<HTMLInputElement>(null);
    const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
    const webcamStreamRef = useRef<MediaStream | null>(null);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [initialHrManaged, setInitialHrManaged] = useState(false);
    const [webcamOpen, setWebcamOpen] = useState(false);
    const [webcamStarting, setWebcamStarting] = useState(false);
    const [webcamError, setWebcamError] = useState<string | null>(null);

    const departmentsForBranch = useMemo(() => {
        if (!formData.work_location) return [];
        return departments.filter(
            (d) => String(d.center_id ?? '') === String(formData.work_location),
        );
    }, [departments, formData.work_location]);

    useEffect(() => {
        if (!id) return;
        let cancelled = false;

        const fetchData = async () => {
            setLoading(true);
            try {
                // User first so the form can paint; lookups in parallel after / with it.
                const userPromise = axios.get(`/admin/users/${id}`);
                const lookupsPromise = Promise.all([
                    axios.get('/admin/roles/list'),
                    axios.get('/admin/departments/list', { params: { compact: 1 } }),
                    axios.get('/admin/designations/list', { params: { compact: 1 } }),
                    axios.get('/admin/settings/centers', { params: { compact: 1 } }),
                ]);

                const userRes = await userPromise;
                if (cancelled) return;

                const userData = userRes.data.data;
                setUser(userData);
                setFormData({
                    name: userData.name,
                    email: userData.email,
                    employee_id: userData.employee_id || '',
                    phone: userData.phone || '',
                    date_of_birth: toDateInput(userData.date_of_birth),
                    gender: userData.gender || '',
                    address: userData.address || '',
                    city: userData.city || '',
                    state: userData.state || '',
                    country: userData.country || 'India',
                    postal_code: userData.postal_code || '',
                    bio: userData.bio || '',
                    department_id: userData.department_id || '',
                    designation_id: userData.designation_id || '',
                    status: userData.status || 'active',
                    roles: userData.roles?.map((r: Role) => r.id) || [],
                    employment_type: userData.employment_type || '',
                    date_of_joining: toDateInput(userData.date_of_joining),
                    date_of_exit: toDateInput(userData.date_of_exit),
                    work_location: userData.work_location || '',
                    work_state: userData.work_state || '',
                    tax_regime: userData.tax_regime || 'new',
                    bank_name: userData.bank_name || '',
                    account_number: userData.account_number || '',
                    ifsc_code: userData.ifsc_code || '',
                    account_type: userData.account_type || '',
                    pan_number: userData.pan_number || '',
                    esi_number: userData.esi_number || '',
                    pf_number: userData.pf_number || '',
                    aadhar_number: userData.aadhar_number || '',
                    emergency_contact: userData.emergency_contact || '',
                    is_external: !!userData.is_external,
                    hr_managed: !!userData.hr_managed,
                    enable_login_password: '',
                });
                setInitialHrManaged(!!userData.hr_managed);
                if (userData.photo) {
                    setSavedPhotoPath(userData.photo);
                }
                setExistingDocs({
                    doc_aadhaar: userData.doc_aadhaar || null,
                    doc_pan: userData.doc_pan || null,
                    doc_id_proof: userData.doc_id_proof || null,
                    doc_other: userData.doc_other || null,
                });
                setDocFiles({
                    doc_aadhaar: null,
                    doc_pan: null,
                    doc_id_proof: null,
                    doc_other: null,
                });
                setManagedCenterIds(
                    Array.isArray(userData.managed_center_ids)
                        ? userData.managed_center_ids.map((n: number) => Number(n)).filter((n: number) => n > 0)
                        : [],
                );
                setLoading(false);

                const [rolesRes, deptsRes, desigsRes, centersRes] = await lookupsPromise;
                if (cancelled) return;
                setRoles(rolesRes.data.data);
                setDepartments(deptsRes.data.data);
                setDesignations(desigsRes.data.data);
                setCenters(centersRes.data.data);
            } catch (error) {
                if (cancelled) return;
                console.error('Failed to fetch data:', error);
                handleApiError(error);
                navigate('/admin/users');
                setLoading(false);
            }
        };

        void fetchData();
        return () => {
            cancelled = true;
        };
    }, [id, navigate]);

    useEffect(() => {
        return () => {
            stopWebcam();
        };
    }, []);

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                setErrors({ ...errors, photo: ['Photo must be less than 2MB'] });
                return;
            }
            setPhotoFile(file);
            setRemovePhoto(false);
            setWebcamError(null);
            const reader = new FileReader();
            reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleRemovePhoto = () => {
        setPhotoFile(null);
        setPhotoPreview(null);
        setSavedPhotoPath(null);
        setRemovePhoto(true);
        setWebcamError(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const stopWebcam = () => {
        if (webcamStreamRef.current) {
            webcamStreamRef.current.getTracks().forEach((track) => track.stop());
            webcamStreamRef.current = null;
        }
        if (webcamVideoRef.current) {
            webcamVideoRef.current.srcObject = null;
        }
    };

    const startWebcam = async () => {
        setWebcamStarting(true);
        setWebcamError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user' },
                audio: false,
            });
            webcamStreamRef.current = stream;
            setWebcamOpen(true);
            requestAnimationFrame(() => {
                if (webcamVideoRef.current) {
                    webcamVideoRef.current.srcObject = stream;
                    void webcamVideoRef.current.play();
                }
            });
        } catch {
            setWebcamError('Unable to access webcam. Please allow camera permission and retry.');
            setWebcamOpen(false);
        } finally {
            setWebcamStarting(false);
        }
    };

    const closeWebcam = () => {
        stopWebcam();
        setWebcamOpen(false);
    };

    const captureFromWebcam = async () => {
        const video = webcamVideoRef.current;
        if (!video || !video.videoWidth || !video.videoHeight) {
            setWebcamError('Camera is not ready yet. Please wait and try again.');
            return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            setWebcamError('Failed to capture image from webcam.');
            return;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
        if (!blob) {
            setWebcamError('Unable to create captured image.');
            return;
        }
        if (blob.size > 2 * 1024 * 1024) {
            setWebcamError('Captured photo is larger than 2MB. Move closer and try again.');
            return;
        }

        const capturedFile = new File([blob], `webcam-user-${user?.id ?? 'photo'}.jpg`, {
            type: 'image/jpeg',
        });
        setPhotoFile(capturedFile);
        setRemovePhoto(false);
        setPhotoPreview(URL.createObjectURL(blob));
        setWebcamError(null);
        closeWebcam();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setSaving(true);
        setErrors({});
        setSaved(false);

        try {
            let response;

            const extendedFields = {
                date_of_birth: formData.date_of_birth,
                gender: formData.gender,
                address: formData.address,
                city: formData.city,
                state: formData.state,
                country: formData.country,
                postal_code: formData.postal_code,
                bio: formData.bio,
                employment_type: formData.employment_type,
                work_state: formData.work_state,
                tax_regime: formData.tax_regime,
                date_of_exit: formData.date_of_exit,
                pan_number: formData.pan_number,
                esi_number: formData.esi_number,
                pf_number: formData.pf_number,
                aadhar_number: formData.aadhar_number,
                emergency_contact: formData.emergency_contact,
                is_external: formData.is_external,
                hr_managed: formData.hr_managed,
            };

            const hasDocUploads = Object.values(docFiles).some(Boolean);

            if (photoFile || removePhoto || hasDocUploads) {
                const fd = new FormData();
                fd.append('name', formData.name);
                fd.append('email', formData.email);
                fd.append('employee_id', formData.employee_id);
                fd.append('phone', formData.phone);
                fd.append('status', formData.status);
                fd.append('department_id', formData.department_id != null ? String(formData.department_id) : '');
                fd.append('designation_id', formData.designation_id != null ? String(formData.designation_id) : '');
                fd.append('date_of_joining', formData.date_of_joining);
                fd.append('work_location', formData.work_location);
                fd.append('bank_name', formData.bank_name);
                fd.append('account_number', formData.account_number);
                fd.append('ifsc_code', formData.ifsc_code);
                fd.append('account_type', formData.account_type);
                fd.append('roles', JSON.stringify(formData.roles));
                for (const cid of managedCenterIds) {
                    fd.append('managed_center_ids[]', String(cid));
                }
                if (managedCenterIds.length === 0) {
                    fd.append('managed_center_ids', '');
                }
                Object.entries(extendedFields).forEach(([key, value]) => {
                    if (typeof value === 'boolean') {
                        fd.append(key, value ? '1' : '0');
                    } else {
                        fd.append(key, value != null ? String(value) : '');
                    }
                });
                if (photoFile) fd.append('photo', photoFile);
                if (removePhoto) fd.append('remove_photo', '1');
                if (initialHrManaged && !formData.hr_managed && formData.enable_login_password) {
                    fd.append('password', formData.enable_login_password);
                }
                (Object.keys(docFiles) as Array<keyof typeof docFiles>).forEach((key) => {
                    const file = docFiles[key];
                    if (file) fd.append(key, file);
                });

                response = await axios.post(`/admin/users/${user.id}`, fd);
            } else {
                const payload: Record<string, unknown> = {
                    name: formData.name,
                    email: formData.email,
                    employee_id: formData.employee_id,
                    phone: formData.phone,
                    status: formData.status,
                    department_id: formData.department_id ? Number(formData.department_id) : null,
                    designation_id: formData.designation_id ? Number(formData.designation_id) : null,
                    date_of_joining: formData.date_of_joining,
                    work_location: formData.work_location,
                    bank_name: formData.bank_name,
                    account_number: formData.account_number,
                    ifsc_code: formData.ifsc_code,
                    account_type: formData.account_type,
                    roles: formData.roles,
                    managed_center_ids: managedCenterIds,
                    ...extendedFields,
                };
                if (initialHrManaged && !formData.hr_managed) {
                    payload.password = formData.enable_login_password;
                }
                response = await axios.put(`/admin/users/${user.id}`, payload);
            }

            handleApiResponse(response);

            if (response.data?.data?.photo) {
                const photo = response.data.data.photo as string;
                // Invalidate old blob cache so useStorageSrc re-fetches the new image
                if (savedPhotoPath) invalidateStorageBlobUrl(savedPhotoPath);
                setSavedPhotoPath(photo);
                setPhotoPreview(null);
                setPhotoFile(null);
                setRemovePhoto(false);
            } else if (removePhoto) {
                if (savedPhotoPath) invalidateStorageBlobUrl(savedPhotoPath);
                setSavedPhotoPath(null);
                setPhotoPreview(null);
                setPhotoFile(null);
                setRemovePhoto(false);
            }

            const savedUser = response.data?.data;
            if (savedUser) {
                setExistingDocs({
                    doc_aadhaar: savedUser.doc_aadhaar || null,
                    doc_pan: savedUser.doc_pan || null,
                    doc_id_proof: savedUser.doc_id_proof || null,
                    doc_other: savedUser.doc_other || null,
                });
                setDocFiles({
                    doc_aadhaar: null,
                    doc_pan: null,
                    doc_id_proof: null,
                    doc_other: null,
                });
            }

            setSaved(true);
            setInitialHrManaged(formData.hr_managed);
            setFormData((prev) => ({ ...prev, enable_login_password: '' }));
            setTimeout(() => setSaved(false), 3000);
        } catch (error: any) {
            if (error.response?.data?.errors) {
                setErrors(error.response.data.errors);
            }
            handleApiError(error);
        } finally {
            setSaving(false);
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

    if (loading) {
        return (
            <AppLayout breadcrumbs={[{ label: 'Users', href: '/admin/users' }, { label: 'Loading...' }]}>
                <div className="flex h-[400px] items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                </div>
            </AppLayout>
        );
    }

    if (!user) {
        return (
            <AppLayout breadcrumbs={[{ label: 'Users', href: '/admin/users' }, { label: 'Not Found' }]}>
                <div className="flex h-[400px] flex-col items-center justify-center gap-4">
                    <h2 className="text-xl font-semibold">User not found</h2>
                    <Button onClick={() => navigate('/admin/users')}>Back to Users</Button>
                </div>
            </AppLayout>
        );
    }

    const breadcrumbs = [
        { label: 'Users', href: '/admin/users' },
        { label: user.name?.trim() || `User #${user.id}`, href: `/admin/users/${user.id}` },
        { label: 'Edit', href: '#' },
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
                        {formData.hr_managed ? (
                            <Badge variant="outline">HR-managed</Badge>
                        ) : null}
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
                                        {displayedPhotoSrc ? (
                                            <img
                                                src={displayedPhotoSrc}
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
                                            {displayedPhotoSrc ? 'Change Photo' : 'Upload Photo'}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={startWebcam}
                                            disabled={webcamStarting}
                                        >
                                            <Camera className="mr-2 h-4 w-4" />
                                            {webcamStarting ? 'Opening...' : 'Open Webcam'}
                                        </Button>
                                        {displayedPhotoSrc && (
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
                                    {webcamError && (
                                        <p className="text-sm text-destructive">{webcamError}</p>
                                    )}
                                    {errors.photo && (
                                        <p className="text-sm text-destructive">{errors.photo[0]}</p>
                                    )}
                                </div>
                            </div>
                            {webcamOpen && (
                                <div className="mt-4 rounded-lg border p-3 space-y-3">
                                    <p className="text-sm font-medium">Webcam Capture</p>
                                    <div className="max-w-md overflow-hidden rounded-md border bg-muted">
                                        <video
                                            ref={webcamVideoRef}
                                            className="w-full h-auto"
                                            autoPlay
                                            muted
                                            playsInline
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <Button type="button" size="sm" onClick={captureFromWebcam}>
                                            Capture Photo
                                        </Button>
                                        <Button type="button" size="sm" variant="outline" onClick={closeWebcam}>
                                            Cancel Webcam
                                        </Button>
                                    </div>
                                </div>
                            )}
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
                                        Email
                                        {!formData.hr_managed ? (
                                            <span className="text-destructive"> *</span>
                                        ) : null}
                                    </Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) =>
                                            setFormData({ ...formData, email: e.target.value })
                                        }
                                        placeholder={
                                            formData.hr_managed
                                                ? 'Internal placeholder — not used for login'
                                                : 'user@example.com'
                                        }
                                        disabled={formData.hr_managed && !!formData.email?.endsWith('@hr-managed.local')}
                                    />
                                    {formData.hr_managed ? (
                                        <p className="text-xs text-muted-foreground">
                                            Uncheck HR-managed below and set a real email + password to enable app login.
                                        </p>
                                    ) : null}
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
                                        disabled={!canEditAdminFields}
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
                                        disabled={!canEditAdminFields}
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
                                    <Label htmlFor="work_location">Branch</Label>
                                    {centers.length === 0 ? (
                                        <p className="text-sm text-muted-foreground italic py-2">
                                            No branches configured. Add branches under Branches in the sidebar.
                                        </p>
                                    ) : (
                                        <Select
                                            value={formData.work_location as string}
                                            onValueChange={(v) =>
                                                setFormData((prev) => {
                                                    const next = { ...prev, work_location: v };
                                                    const validDept = departments.some(
                                                        (d) =>
                                                            d.id === Number(prev.department_id) &&
                                                            String(d.center_id ?? '') === v,
                                                    );
                                                    if (!validDept) {
                                                        next.department_id = '';
                                                    }
                                                    return next;
                                                })
                                            }
                                            disabled={!canEditAdminFields}
                                        >
                                            <SelectTrigger id="work_location">
                                                <SelectValue placeholder="Select branch" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {centers.map((center) => (
                                                    <SelectItem key={center.id} value={String(center.id)}>
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

                                <div className="space-y-2">
                                    <Label htmlFor="department">Department</Label>
                                    {!formData.work_location ? (
                                        <p className="text-sm text-muted-foreground italic py-2">
                                            Select a branch first to choose a department.
                                        </p>
                                    ) : departmentsForBranch.length === 0 ? (
                                        <p className="text-sm text-muted-foreground italic py-2">
                                            No departments for this branch yet.
                                        </p>
                                    ) : (
                                        <Select
                                            value={String(formData.department_id) || ''}
                                            onValueChange={(value) =>
                                                setFormData({
                                                    ...formData,
                                                    department_id: value ? parseInt(value) : '',
                                                })
                                            }
                                            disabled={!canEditAdminFields}
                                        >
                                            <SelectTrigger id="department">
                                                <SelectValue placeholder="Select department" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {departmentsForBranch.map((dept) => (
                                                    <SelectItem key={dept.id} value={String(dept.id)}>
                                                        {dept.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
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
                                        disabled={!canEditAdminFields}
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

                    {/* Personal Details */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Personal Details</CardTitle>
                            <CardDescription>Date of birth and gender</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="date_of_birth">Date of Birth</Label>
                                    <Input
                                        id="date_of_birth"
                                        type="date"
                                        value={formData.date_of_birth}
                                        onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="gender">Gender</Label>
                                    <Select
                                        value={formData.gender || 'none'}
                                        onValueChange={(v) =>
                                            setFormData({ ...formData, gender: v === 'none' ? '' : v })
                                        }
                                    >
                                        <SelectTrigger id="gender">
                                            <SelectValue placeholder="Select gender" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Not specified</SelectItem>
                                            {GENDER_OPTIONS.map((g) => (
                                                <SelectItem key={g.value} value={g.value}>
                                                    {g.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Contact & Address */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <MapPin className="h-5 w-5" />
                                Contact & Address
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="emergency_contact">Emergency Contact No</Label>
                                <Input
                                    id="emergency_contact"
                                    value={formData.emergency_contact}
                                    onChange={(e) =>
                                        setFormData({ ...formData, emergency_contact: e.target.value })
                                    }
                                    placeholder="Emergency phone number"
                                />
                                {errors.emergency_contact && (
                                    <p className="text-sm text-destructive">{errors.emergency_contact[0]}</p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="address">Address</Label>
                                <Textarea
                                    id="address"
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    placeholder="Street address"
                                    rows={2}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="city">City</Label>
                                    <Input
                                        id="city"
                                        value={formData.city}
                                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="state">State</Label>
                                    <Input
                                        id="state"
                                        value={formData.state}
                                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="country">Country</Label>
                                    <Input
                                        id="country"
                                        value={formData.country}
                                        onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="postal_code">PIN / Postal Code</Label>
                                    <Input
                                        id="postal_code"
                                        value={formData.postal_code}
                                        onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Documents */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <IdCard className="h-5 w-5" />
                                Documents
                            </CardTitle>
                            <CardDescription>
                                Upload identity documents (PDF, JPG, or PNG, max 10MB each)
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                {(
                                    [
                                        { key: 'doc_aadhaar', label: 'Aadhaar document' },
                                        { key: 'doc_pan', label: 'PAN document' },
                                        { key: 'doc_id_proof', label: 'ID proof' },
                                        { key: 'doc_other', label: 'Other document' },
                                    ] as const
                                ).map(({ key, label }) => {
                                    const existing = existingDocs[key];
                                    const selected = docFiles[key];
                                    return (
                                        <div key={key} className="space-y-2 rounded-lg border p-3">
                                            <Label htmlFor={key}>{label}</Label>
                                            {existing && !selected && (
                                                <p className="text-xs text-muted-foreground">
                                                    Current:{' '}
                                                    <a
                                                        href={storageUrl(existing)}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-primary underline-offset-4 hover:underline"
                                                    >
                                                        View uploaded file
                                                    </a>
                                                </p>
                                            )}
                                            {selected && (
                                                <p className="text-xs text-muted-foreground">
                                                    Selected: {selected.name}
                                                </p>
                                            )}
                                            <Input
                                                id={key}
                                                type="file"
                                                accept=".pdf,image/png,image/jpeg,image/jpg,.png,.jpg,.jpeg"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0] ?? null;
                                                    setDocFiles((prev) => ({ ...prev, [key]: file }));
                                                }}
                                            />
                                        </div>
                                    );
                                })}
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
                                    <Label htmlFor="employment_type">Employment Type</Label>
                                    <Select
                                        value={formData.employment_type || 'none'}
                                        onValueChange={(v) =>
                                            setFormData({ ...formData, employment_type: v === 'none' ? '' : v })
                                        }
                                        disabled={!canEditAdminFields}
                                    >
                                        <SelectTrigger id="employment_type">
                                            <SelectValue placeholder="Select type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Not specified</SelectItem>
                                            {EMPLOYMENT_TYPES.map((t) => (
                                                <SelectItem key={t.value} value={t.value}>
                                                    {t.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

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

                                {/* Branch lives under Basic Information; managed branches stay here */}
                                {canAccessAllCenters() && centers.length > 0 && (
                                    <div className="space-y-2 md:col-span-2">
                                        <Label>Managed branches (branch RBAC)</Label>
                                        <p className="text-xs text-muted-foreground">
                                            Branches this user may administer. Leave empty to use their work branch only.
                                            Org admins with Access All Centers ignore this list.
                                        </p>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            {centers.map((center) => {
                                                const checked = managedCenterIds.includes(Number(center.id));
                                                return (
                                                    <label
                                                        key={center.id}
                                                        className="flex items-center gap-2 text-sm"
                                                    >
                                                        <Checkbox
                                                            checked={checked}
                                                            onCheckedChange={(v) => {
                                                                const id = Number(center.id);
                                                                setManagedCenterIds((prev) =>
                                                                    v
                                                                        ? [...prev, id]
                                                                        : prev.filter((x) => x !== id),
                                                                );
                                                            }}
                                                        />
                                                        {center.name}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor="work_state">Work State (PT)</Label>
                                    <Input
                                        id="work_state"
                                        value={formData.work_state}
                                        onChange={(e) => setFormData({ ...formData, work_state: e.target.value })}
                                        placeholder="e.g. Maharashtra"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="tax_regime">Tax Regime</Label>
                                    <Select
                                        value={formData.tax_regime || 'new'}
                                        onValueChange={(v) => setFormData({ ...formData, tax_regime: v })}
                                    >
                                        <SelectTrigger id="tax_regime">
                                            <SelectValue placeholder="Select regime" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {TAX_REGIMES.map((r) => (
                                                <SelectItem key={r.value} value={r.value}>
                                                    {r.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="date_of_exit">Date of Exit</Label>
                                    <Input
                                        id="date_of_exit"
                                        type="date"
                                        value={formData.date_of_exit}
                                        onChange={(e) => setFormData({ ...formData, date_of_exit: e.target.value })}
                                    />
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

                    {/* Government IDs */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <IdCard className="h-5 w-5" />
                                Government IDs
                            </CardTitle>
                            <CardDescription>PAN, Aadhaar, PF and ESI numbers for payroll and compliance</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="pan_number">PAN</Label>
                                    <Input
                                        id="pan_number"
                                        value={formData.pan_number}
                                        onChange={(e) =>
                                            setFormData({ ...formData, pan_number: e.target.value.toUpperCase() })
                                        }
                                        placeholder="ABCDE1234F"
                                        maxLength={10}
                                        className="uppercase font-mono"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="aadhar_number">Aadhaar</Label>
                                    <Input
                                        id="aadhar_number"
                                        value={formData.aadhar_number}
                                        onChange={(e) =>
                                            setFormData({
                                                ...formData,
                                                aadhar_number: e.target.value.replace(/\D/g, '').slice(0, 12),
                                            })
                                        }
                                        placeholder="12-digit number"
                                        maxLength={12}
                                        className="font-mono"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="pf_number">PF Number</Label>
                                    <Input
                                        id="pf_number"
                                        value={formData.pf_number}
                                        onChange={(e) => setFormData({ ...formData, pf_number: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="esi_number">ESI Number</Label>
                                    <Input
                                        id="esi_number"
                                        value={formData.esi_number}
                                        onChange={(e) => setFormData({ ...formData, esi_number: e.target.value })}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Roles Assignment — admin only */}
                    {canEditAdminFields && <Card>
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
                            <div className="flex items-center space-x-2 pt-4">
                                <Checkbox
                                    id="is_external"
                                    checked={formData.is_external}
                                    onCheckedChange={(checked) =>
                                        setFormData({ ...formData, is_external: !!checked })
                                    }
                                />
                                <div className="grid gap-1.5 leading-none">
                                    <Label htmlFor="is_external" className="font-medium">
                                        External Consultant (Exclude from Payroll)
                                    </Label>
                                    <p className="text-sm text-muted-foreground">
                                        Visiting doctors or contractors who shouldn't appear in the regular employee payroll.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start space-x-2 pt-4 border-t">
                                <Checkbox
                                    id="hr_managed"
                                    checked={formData.hr_managed}
                                    onCheckedChange={(checked) =>
                                        setFormData({
                                            ...formData,
                                            hr_managed: !!checked,
                                            enable_login_password: '',
                                        })
                                    }
                                />
                                <div className="grid gap-1.5 leading-none flex-1">
                                    <Label htmlFor="hr_managed" className="font-medium">
                                        HR-managed (will not use the app)
                                    </Label>
                                    <p className="text-sm text-muted-foreground">
                                        Attendance and leave are handled by HR. No employee login.
                                    </p>
                                    {initialHrManaged && !formData.hr_managed ? (
                                        <div className="mt-3 space-y-2 rounded-md border bg-muted/40 p-3">
                                            <p className="text-sm font-medium">Enable app login</p>
                                            <p className="text-xs text-muted-foreground">
                                                Set a real work email above and a temporary password.
                                            </p>
                                            <div className="space-y-1">
                                                <Label htmlFor="enable_login_password">New password</Label>
                                                <PasswordInput
                                                    id="enable_login_password"
                                                    value={formData.enable_login_password}
                                                    onChange={(e) =>
                                                        setFormData({
                                                            ...formData,
                                                            enable_login_password: e.target.value,
                                                        })
                                                    }
                                                    placeholder="Min 8 characters"
                                                />
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
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
                    </Card>}

                    {/* Pay setup — admin only */}
                    {canEditAdminFields && <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Banknote className="h-5 w-5" />
                                Pay setup
                            </CardTitle>
                            <CardDescription>
                                Monthly salary, extras for this person, and one-time bonus
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <SalaryTabsPanel userId={user.id} />
                        </CardContent>
                    </Card>}

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
                                disabled={saving}
                            >
                                Back to Users
                            </Button>
                            <Button type="submit" disabled={saving}>
                                {saving ? (
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