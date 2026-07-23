import axios from '@/lib/axios';
import { Search, Shield } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { handleApiError, handleApiResponse } from '@/lib/toast';
import { fetchPermissionsPayload, type Permission, type PermissionModule } from '@/lib/permissions-api';

interface Role {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    permissions?: Permission[];
}

interface RoleFormProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    role?: Role | null;
    allPermissions: Permission[];
    permissionModules?: PermissionModule[];
    onSuccess: (role: Role) => void;
}

export default function RoleForm({
    open,
    onOpenChange,
    role,
    allPermissions,
    permissionModules = [],
    onSuccess,
}: RoleFormProps) {
    const [formData, setFormData] = useState({
        name: '',
        description: '',
    });
    const [selectedPermissions, setSelectedPermissions] = useState<number[]>([]);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [loading, setLoading] = useState(false);
    const [livePermissions, setLivePermissions] = useState<Permission[]>(allPermissions);
    const [liveModules, setLiveModules] = useState<PermissionModule[]>(permissionModules);
    const [loadingPermissions, setLoadingPermissions] = useState(false);
    const [permissionSearch, setPermissionSearch] = useState('');

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoadingPermissions(true);
        void fetchPermissionsPayload()
            .then((payload) => {
                if (cancelled) return;
                setLivePermissions(payload.permissions);
                setLiveModules(payload.modules);
            })
            .catch(() => {
                if (!cancelled) {
                    setLivePermissions(allPermissions);
                    setLiveModules(permissionModules);
                }
            })
            .finally(() => {
                if (!cancelled) setLoadingPermissions(false);
            });
        return () => {
            cancelled = true;
        };
    }, [open, allPermissions, permissionModules]);

    useEffect(() => {
        if (role) {
            setFormData({
                name: role.name,
                description: role.description || '',
            });
            setSelectedPermissions(
                role.permissions?.map((p) => p.id) || []
            );
        } else {
            setFormData({ name: '', description: '' });
            setSelectedPermissions([]);
        }
        setErrors({});
        setPermissionSearch('');
    }, [role, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrors({});

        try {
            const payload = {
                ...formData,
                permissions: selectedPermissions,
            };

            const response = role
                ? await axios.put(`/admin/roles/${role.id}`, payload)
                : await axios.post('/admin/roles', payload);

            handleApiResponse(response);
            onSuccess(response.data.data);
        } catch (error: any) {
            if (error.response?.data?.errors) {
                setErrors(error.response.data.errors);
            }
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const handlePermissionToggle = (permissionId: number) => {
        setSelectedPermissions((prev) =>
            prev.includes(permissionId)
                ? prev.filter((id) => id !== permissionId)
                : [...prev, permissionId]
        );
    };

    const handleModuleToggle = (module: PermissionModule) => {
        const groupPermissions = module.permissions.map((p) => p.id);
        if (groupPermissions.length === 0) return;

        const allSelected = groupPermissions.every((id) =>
            selectedPermissions.includes(id)
        );

        if (allSelected) {
            setSelectedPermissions((prev) =>
                prev.filter((id) => !groupPermissions.includes(id))
            );
        } else {
            setSelectedPermissions((prev) => [
                ...new Set([...prev, ...groupPermissions]),
            ]);
        }
    };

    const isModuleSelected = (module: PermissionModule) => {
        const groupPermissions = module.permissions.map((p) => p.id);
        if (groupPermissions.length === 0) return false;
        return groupPermissions.every((id) => selectedPermissions.includes(id));
    };

    const groupedPermissions = useMemo(
        () =>
            liveModules.length > 0
                ? liveModules
                : Object.entries(
                      livePermissions.reduce((acc, permission) => {
                          const group = permission.group || 'Other';
                          if (!acc[group]) acc[group] = [];
                          acc[group].push(permission);
                          return acc;
                      }, {} as Record<string, Permission[]>),
                  ).map(([label, permissions]) => ({ key: label, label, permissions })),
        [liveModules, livePermissions],
    );

    const filteredGroupedPermissions = useMemo(() => {
        const q = permissionSearch.trim().toLowerCase();
        if (!q) return groupedPermissions;
        return groupedPermissions
            .map((module) => {
                const moduleMatches = module.label.toLowerCase().includes(q);
                const permissions = moduleMatches
                    ? module.permissions
                    : module.permissions.filter(
                          (p) =>
                              p.name.toLowerCase().includes(q) ||
                              (p.slug && p.slug.toLowerCase().includes(q)),
                      );
                return { ...module, permissions };
            })
            .filter((module) => module.permissions.length > 0 || module.label.toLowerCase().includes(q));
    }, [groupedPermissions, permissionSearch]);

    const visiblePermissionIds = useMemo(
        () => filteredGroupedPermissions.flatMap((m) => m.permissions.map((p) => p.id)),
        [filteredGroupedPermissions],
    );

    const allVisibleSelected =
        visiblePermissionIds.length > 0 &&
        visiblePermissionIds.every((id) => selectedPermissions.includes(id));

    const toggleSelectVisible = () => {
        if (allVisibleSelected) {
            setSelectedPermissions((prev) =>
                prev.filter((id) => !visiblePermissionIds.includes(id)),
            );
        } else {
            setSelectedPermissions((prev) => [
                ...new Set([...prev, ...visiblePermissionIds]),
            ]);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden">
                <DialogHeader className="shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        {role ? 'Edit Role' : 'Create Role'}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-4">
                    <div className="shrink-0 space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">
                                Role Name <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) =>
                                    setFormData({ ...formData, name: e.target.value })
                                }
                                placeholder="e.g. Sales Manager"
                                disabled={loading}
                            />
                            {errors.name && (
                                <p className="text-sm text-destructive">
                                    {errors.name[0]}
                                </p>
                            )}
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                value={formData.description}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        description: e.target.value,
                                    })
                                }
                                placeholder="Describe the responsibilities and access level of this role"
                                rows={3}
                                disabled={loading}
                            />
                            {errors.description && (
                                <p className="text-sm text-destructive">
                                    {errors.description[0]}
                                </p>
                            )}
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <Label>Module Permissions</Label>
                            <Badge variant="secondary">
                                {selectedPermissions.length} of{' '}
                                {livePermissions.length} selected
                                {loadingPermissions ? ' · refreshing…' : ''}
                            </Badge>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <div className="relative flex-1">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    value={permissionSearch}
                                    onChange={(e) => setPermissionSearch(e.target.value)}
                                    placeholder="Search permissions…"
                                    className="pl-8"
                                    disabled={loading || loadingPermissions}
                                />
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={toggleSelectVisible}
                                disabled={loading || visiblePermissionIds.length === 0}
                            >
                                {allVisibleSelected ? 'Clear visible' : 'Select visible'}
                            </Button>
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border p-4">
                        <div className="space-y-6">
                            {loadingPermissions && filteredGroupedPermissions.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Loading permissions…</p>
                            ) : null}
                            {!loadingPermissions && filteredGroupedPermissions.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    No permissions match “{permissionSearch.trim()}”.
                                </p>
                            ) : null}
                            {filteredGroupedPermissions.map((module) => (
                                <div key={module.key} className="space-y-3">
                                    <div className="flex items-center gap-2 border-b pb-2">
                                        <Checkbox
                                            id={`group-${module.key}`}
                                            checked={isModuleSelected(module)}
                                            onCheckedChange={() =>
                                                handleModuleToggle(module)
                                            }
                                            disabled={loading || module.permissions.length === 0}
                                        />
                                        <Label
                                            htmlFor={`group-${module.key}`}
                                            className="cursor-pointer text-base font-semibold"
                                        >
                                            {module.label}
                                        </Label>
                                        <Badge variant="outline" className="ml-auto">
                                            {module.permissions.length}
                                        </Badge>
                                    </div>

                                    {module.permissions.length === 0 ? (
                                        <p className="pl-6 text-sm text-muted-foreground">
                                            No permissions configured for this module yet.
                                        </p>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-3 pl-6">
                                            {module.permissions.map((permission) => (
                                                <div
                                                    key={permission.id}
                                                    className="flex items-center gap-2"
                                                >
                                                    <Checkbox
                                                        id={`permission-${permission.id}`}
                                                        checked={selectedPermissions.includes(
                                                            permission.id
                                                        )}
                                                        onCheckedChange={() =>
                                                            handlePermissionToggle(
                                                                permission.id
                                                            )
                                                        }
                                                        disabled={loading}
                                                    />
                                                    <Label
                                                        htmlFor={`permission-${permission.id}`}
                                                        className="cursor-pointer text-sm"
                                                    >
                                                        {permission.name}
                                                    </Label>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {errors.permissions && (
                        <p className="shrink-0 text-sm text-destructive">
                            {errors.permissions[0]}
                        </p>
                    )}

                    <div className="flex shrink-0 justify-end gap-2 border-t pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Saving...' : role ? 'Update' : 'Create'} Role
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
