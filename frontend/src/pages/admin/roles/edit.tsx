import { useNavigate, useParams } from 'react-router-dom';
import axios from '@/lib/axios';
import { ArrowLeft, Loader2, Save, Shield, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import { handleApiError, handleApiResponse } from '@/lib/toast';
import {
    fetchPermissionsPayload,
    type Permission,
    type PermissionModule,
} from '@/lib/permissions-api';

interface Role {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    users_count: number;
    permissions_count: number;
    permissions: Permission[];
    created_at: string;
}

export default function EditRolePage() {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [role, setRole] = useState<Role | null>(null);
    const [permissionsList, setPermissionsList] = useState<Permission[]>([]);
    const [permissionModules, setPermissionModules] = useState<PermissionModule[]>([]);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        permissions: [] as number[],
    });
    const [errors, setErrors] = useState<Record<string, string[]>>({});

    useEffect(() => {
        if (!id) return;
        let cancelled = false;

        void (async () => {
            setLoading(true);
            try {
                const [roleRes, permissionsPayload] = await Promise.all([
                    axios.get(`/admin/roles/${id}`),
                    fetchPermissionsPayload(),
                ]);
                if (cancelled) return;

                const roleData = roleRes.data.data as Role;
                setRole(roleData);
                setPermissionsList(permissionsPayload.permissions);
                setPermissionModules(permissionsPayload.modules);
                setFormData({
                    name: roleData.name,
                    description: roleData.description || '',
                    permissions: roleData.permissions?.map((p) => p.id) || [],
                });
            } catch (error) {
                if (!cancelled) handleApiError(error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [id]);

    const groupedPermissions = useMemo(() => {
        if (permissionModules.length > 0) {
            return permissionModules.reduce((acc, module) => {
                acc[module.label] = module.permissions;
                return acc;
            }, {} as Record<string, Permission[]>);
        }
        return permissionsList.reduce((acc, permission) => {
            const group = permission.group || 'Other';
            if (!acc[group]) acc[group] = [];
            acc[group].push(permission);
            return acc;
        }, {} as Record<string, Permission[]>);
    }, [permissionModules, permissionsList]);

    const moduleOrder = useMemo(
        () => (permissionModules.length > 0 ? permissionModules.map((m) => m.label) : Object.keys(groupedPermissions)),
        [permissionModules, groupedPermissions],
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!role) return;
        setSaving(true);
        setErrors({});

        try {
            const response = await axios.put(`/admin/roles/${role.id}`, formData);
            handleApiResponse(response);
            navigate('/admin/users?tab=roles');
        } catch (error: any) {
            if (error.response?.data?.errors) {
                setErrors(error.response.data.errors);
            }
            handleApiError(error);
        } finally {
            setSaving(false);
        }
    };

    const handlePermissionToggle = (permissionId: number) => {
        setFormData((prev) => ({
            ...prev,
            permissions: prev.permissions.includes(permissionId)
                ? prev.permissions.filter((pid) => pid !== permissionId)
                : [...prev.permissions, permissionId],
        }));
    };

    const handleGroupToggle = (group: string) => {
        const groupPermissionIds = groupedPermissions[group].map((p) => p.id);
        const allSelected = groupPermissionIds.every((pid) => formData.permissions.includes(pid));

        setFormData((prev) => ({
            ...prev,
            permissions: allSelected
                ? prev.permissions.filter((pid) => !groupPermissionIds.includes(pid))
                : [...new Set([...prev.permissions, ...groupPermissionIds])],
        }));
    };

    const isGroupFullySelected = (group: string) =>
        groupedPermissions[group].every((p) => formData.permissions.includes(p.id));

    const isGroupPartiallySelected = (group: string) => {
        const groupPermissionIds = groupedPermissions[group].map((p) => p.id);
        const selectedCount = groupPermissionIds.filter((pid) => formData.permissions.includes(pid)).length;
        return selectedCount > 0 && selectedCount < groupPermissionIds.length;
    };

    const breadcrumbs = [
        { label: 'Users', href: '/admin/users' },
        { label: 'Roles', href: '/admin/users' },
        { label: role?.name || 'Edit role', href: '#' },
    ];

    if (loading) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                <div className="flex h-64 items-center justify-center text-muted-foreground">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Loading role...
                </div>
            </AppLayout>
        );
    }

    if (!role) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
                    <p>Role not found.</p>
                    <Button variant="outline" onClick={() => navigate('/admin/users')}>
                        Back to Users
                    </Button>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/users')}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                                <Shield className="h-8 w-8 text-primary" />
                                Edit Role
                            </h1>
                            <p className="text-muted-foreground">
                                Update role details and assign module permissions
                            </p>
                        </div>
                    </div>
                    <Badge variant="secondary" className="gap-1">
                        <Users className="h-3 w-3" />
                        {role.users_count} {role.users_count === 1 ? 'User' : 'Users'}
                    </Badge>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Basic Information</CardTitle>
                            <CardDescription>Update the role name and description</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">
                                    Role Name <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g., Manager"
                                />
                                {errors.name && <p className="text-sm text-destructive">{errors.name[0]}</p>}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Brief description of the role"
                                    rows={3}
                                />
                                {errors.description && (
                                    <p className="text-sm text-destructive">{errors.description[0]}</p>
                                )}
                            </div>

                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Shield className="h-4 w-4" />
                                <span>Role Slug:</span>
                                <code className="bg-muted px-2 py-1 rounded text-xs">{role.slug}</code>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Module Permissions</CardTitle>
                                    <CardDescription>
                                        Permissions grouped by your organization&apos;s subscribed HRM modules
                                    </CardDescription>
                                </div>
                                <Badge variant="outline">
                                    {formData.permissions.length} of {permissionsList.length} selected
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {moduleOrder.map((group, index) => {
                                const permissions = groupedPermissions[group] || [];
                                return (
                                <div key={group} className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                id={`group-${group}`}
                                                checked={permissions.length > 0 && isGroupFullySelected(group)}
                                                disabled={permissions.length === 0}
                                                onCheckedChange={() => handleGroupToggle(group)}
                                                className={
                                                    isGroupPartiallySelected(group)
                                                        ? 'data-[state=checked]:bg-primary/50'
                                                        : ''
                                                }
                                            />
                                            <Label htmlFor={`group-${group}`} className="font-semibold text-base cursor-pointer">
                                                {group}
                                            </Label>
                                        </div>
                                        <Badge variant="secondary" className="text-xs">
                                            {permissions.filter((p) => formData.permissions.includes(p.id)).length} /{' '}
                                            {permissions.length}
                                        </Badge>
                                    </div>
                                    {permissions.length === 0 ? (
                                        <p className="ml-6 text-sm text-muted-foreground">
                                            No permissions configured for this module yet.
                                        </p>
                                    ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 ml-6">
                                        {permissions.map((permission) => (
                                            <div key={permission.id} className="flex items-center gap-2">
                                                <Checkbox
                                                    id={`permission-${permission.id}`}
                                                    checked={formData.permissions.includes(permission.id)}
                                                    onCheckedChange={() => handlePermissionToggle(permission.id)}
                                                />
                                                <Label htmlFor={`permission-${permission.id}`} className="text-sm cursor-pointer">
                                                    {permission.name}
                                                </Label>
                                            </div>
                                        ))}
                                    </div>
                                    )}
                                    {index < moduleOrder.length - 1 && <Separator className="mt-4" />}
                                </div>
                            );})}
                            {errors.permissions && (
                                <p className="text-sm text-destructive">{errors.permissions[0]}</p>
                            )}
                        </CardContent>
                    </Card>

                    <div className="flex items-center justify-end gap-3">
                        <Button type="button" variant="outline" onClick={() => navigate('/admin/users')} disabled={saving}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? (
                                <>Saving...</>
                            ) : (
                                <>
                                    <Save className="mr-2 h-4 w-4" />
                                    Save Changes
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </AppLayout>
    );
}
