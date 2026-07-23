import axios from '@/lib/axios';
import {
    Award,
    Building2,
    Key,
    Plus,
    Shield,
    UserCheck,
    UserX,
    Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import DepartmentForm from '@/components/departments/department-form';
import DepartmentTable from '@/components/departments/department-table';
import DesignationForm from '@/components/designations/designation-form';
import DesignationTable from '@/components/designations/designation-table';
import RoleTable from '@/components/roles/role-table';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import UserTable from '@/components/users/user-table';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { fetchPermissionsPayload, type Permission, type PermissionModule } from '@/lib/permissions-api';
import { fetchRolesList, type Role } from '@/lib/roles-api';
import { handleApiError, handleApiResponse, showToast } from '@/lib/toast';

type HubTab = 'staff' | 'departments' | 'designations' | 'roles';

interface LookupOption {
    id: number;
    name: string;
}

interface DepartmentRow {
    id: number;
    name: string;
    slug: string;
    description?: string;
    center_id?: number;
    is_active: boolean;
}

interface DesignationRow {
    id: number;
    name: string;
    slug: string;
    description?: string;
    level?: number;
    is_active: boolean;
}

const emptyCreateForm = {
    name: '',
    email: '',
    employee_id: '',
    phone: '',
    password: '',
    password_confirmation: '',
    status: 'active',
    hr_managed: false,
    department_id: '',
    designation_id: '',
    role_id: '',
    reporting_manager_id: '',
};

interface ManagerOption {
    id: number;
    name: string;
    designation?: { name?: string } | null;
}

function parseTab(raw: string | null): HubTab {
    if (raw === 'users') return 'staff';
    if (raw === 'departments' || raw === 'designations' || raw === 'roles' || raw === 'staff') {
        return raw;
    }
    return 'staff';
}

export default function UsersIndex() {
    const { hasPermission } = usePermissions();
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<HubTab>(() => parseTab(searchParams.get('tab')));
    const [refreshKey, setRefreshKey] = useState(0);
    const [addOpen, setAddOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [createForm, setCreateForm] = useState(emptyCreateForm);
    const [errors, setErrors] = useState<Record<string, string[]>>({});

    const [stats, setStats] = useState({
        total: 0,
        active: 0,
        inactive: 0,
        suspended: 0,
        hr_managed: 0,
        app_users: 0,
    });
    const [roleStats, setRoleStats] = useState({ total: 0, permissions_total: 0 });
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [permissionModules, setPermissionModules] = useState<PermissionModule[]>([]);
    const [rolesList, setRolesList] = useState<Role[]>([]);
    const [rolesLoading, setRolesLoading] = useState(false);

    const [departments, setDepartments] = useState<LookupOption[]>([]);
    const [designations, setDesignations] = useState<LookupOption[]>([]);
    const [roleOptions, setRoleOptions] = useState<LookupOption[]>([]);
    const [managerOptions, setManagerOptions] = useState<ManagerOption[]>([]);

    const [quickDeptOpen, setQuickDeptOpen] = useState(false);
    const [quickDesigOpen, setQuickDesigOpen] = useState(false);

    const [deptRefresh, setDeptRefresh] = useState(0);
    const [editingDepartment, setEditingDepartment] = useState<DepartmentRow | null>(null);
    const [deptFormOpen, setDeptFormOpen] = useState(false);

    const [desigRefresh, setDesigRefresh] = useState(0);
    const [editingDesignation, setEditingDesignation] = useState<DesignationRow | null>(null);
    const [desigFormOpen, setDesigFormOpen] = useState(false);

    const canViewStaff = hasPermission('view-users');
    const canCreateStaff = hasPermission('create-users');
    const canViewDepartments = hasPermission('view-departments');
    const canCreateDepartments = hasPermission('create-departments');
    const canViewDesignations = hasPermission('view-designations');
    const canCreateDesignations = hasPermission('create-designations');
    const canViewRoles =
        hasPermission('view-users') ||
        hasPermission('edit-roles') ||
        hasPermission('create-roles');

    const visibleTabs = useMemo(() => {
        const tabs: { id: HubTab; label: string; icon: typeof Users }[] = [];
        if (canViewStaff) tabs.push({ id: 'staff', label: 'Staff', icon: Users });
        if (canViewDepartments) tabs.push({ id: 'departments', label: 'Departments', icon: Building2 });
        if (canViewDesignations) tabs.push({ id: 'designations', label: 'Designations', icon: Award });
        if (canViewRoles) tabs.push({ id: 'roles', label: 'Roles', icon: Shield });
        return tabs;
    }, [canViewStaff, canViewDepartments, canViewDesignations, canViewRoles]);

    useEffect(() => {
        const fromUrl = parseTab(searchParams.get('tab'));
        if (visibleTabs.length === 0) return;
        const allowed = visibleTabs.some((t) => t.id === fromUrl)
            ? fromUrl
            : visibleTabs[0].id;
        if (allowed !== activeTab) setActiveTab(allowed);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- sync URL → tab once tabs known
    }, [searchParams, visibleTabs]);

    const loadRolesList = useCallback(async () => {
        setRolesLoading(true);
        try {
            const items = await fetchRolesList();
            setRolesList(items);
            setRoleOptions(items.map((r) => ({ id: r.id, name: r.name })));
        } catch (error) {
            handleApiError(error);
            setRolesList([]);
        } finally {
            setRolesLoading(false);
        }
    }, []);

    const loadLookups = useCallback(async () => {
        try {
            const [deptsRes, desigsRes, roles, managersRes] = await Promise.all([
                axios.get('/admin/departments/list', { params: { compact: 1 } }),
                axios.get('/admin/designations/list', { params: { compact: 1 } }),
                fetchRolesList().catch(() => [] as Role[]),
                axios.get('/admin/users/list').catch(() => ({ data: { data: [] } })),
            ]);
            const deptData = deptsRes.data?.data;
            setDepartments(
                (Array.isArray(deptData) ? deptData : deptData?.data || []).map(
                    (d: LookupOption) => ({ id: d.id, name: d.name }),
                ),
            );
            const desigData = desigsRes.data?.data;
            setDesignations(
                (Array.isArray(desigData) ? desigData : desigData?.data || []).map(
                    (d: LookupOption) => ({ id: d.id, name: d.name }),
                ),
            );
            setRoleOptions(roles.map((r) => ({ id: r.id, name: r.name })));
            const managersRaw = managersRes.data?.data;
            setManagerOptions(
                (Array.isArray(managersRaw) ? managersRaw : []).map(
                    (m: ManagerOption) => ({
                        id: m.id,
                        name: m.name,
                        designation: m.designation,
                    }),
                ),
            );
        } catch (error) {
            handleApiError(error);
        }
    }, []);

    const fetchStats = async () => {
        try {
            const response = await axios.get('/admin/users/stats');
            if (response.data.success) setStats(response.data.data);
        } catch (error) {
            handleApiError(error);
        }
    };

    const fetchRoleStats = async () => {
        try {
            const response = await axios.get('/admin/roles/stats');
            if (response.data.success) setRoleStats(response.data.data);
        } catch (error) {
            handleApiError(error);
        }
    };

    useEffect(() => {
        void fetchPermissionsPayload()
            .then((payload) => {
                setPermissions(payload.permissions);
                setPermissionModules(payload.modules);
            })
            .catch(handleApiError);
        void loadLookups();
    }, [loadLookups]);

    useEffect(() => {
        if (activeTab === 'staff' && canViewStaff) void fetchStats();
        if (activeTab === 'roles' && canViewRoles) {
            void loadRolesList();
            void fetchRoleStats();
        }
    }, [activeTab, refreshKey, canViewStaff, canViewRoles, loadRolesList]);

    const handleTabChange = (value: string) => {
        const tab = parseTab(value);
        setActiveTab(tab);
        setSearchParams(tab === 'staff' ? {} : { tab }, { replace: true });
    };

    const handleCreateStaff = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        setErrors({});
        try {
            if (!createForm.name.trim()) {
                setErrors({ name: ['Name is required'] });
                return;
            }
            if (createForm.hr_managed) {
                if (!createForm.phone.trim() && !createForm.employee_id.trim()) {
                    setErrors({
                        phone: ['Phone or Employee ID is required for HR-managed staff'],
                    });
                    return;
                }
            } else {
                if (!createForm.email.trim()) {
                    setErrors({ email: ['Email is required'] });
                    return;
                }
                if (createForm.password.length < 8) {
                    setErrors({ password: ['Password must be at least 8 characters'] });
                    return;
                }
                if (createForm.password !== createForm.password_confirmation) {
                    showToast({
                        type: 'error',
                        message: 'Password confirmation does not match',
                    });
                    return;
                }
            }

            const payload: Record<string, unknown> = {
                name: createForm.name.trim(),
                status: createForm.status,
                employee_id: createForm.employee_id.trim() || undefined,
                phone: createForm.phone.trim() || undefined,
                hr_managed: createForm.hr_managed,
                department_id: createForm.department_id
                    ? Number(createForm.department_id)
                    : undefined,
                designation_id: createForm.designation_id
                    ? Number(createForm.designation_id)
                    : undefined,
                role_ids: createForm.role_id ? [Number(createForm.role_id)] : undefined,
                reporting_manager_id: createForm.reporting_manager_id
                    ? Number(createForm.reporting_manager_id)
                    : undefined,
            };
            if (!createForm.hr_managed) {
                payload.email = createForm.email.trim();
                payload.password = createForm.password;
                payload.password_confirmation = createForm.password_confirmation;
            }

            const response = await axios.post('/admin/users', payload);
            handleApiResponse(response);
            if (response.data.success) {
                setCreateForm(emptyCreateForm);
                setRefreshKey((prev) => prev + 1);
                setAddOpen(false);
                void loadLookups();
            }
        } catch (error: unknown) {
            const err = error as { response?: { data?: { errors?: Record<string, string[]> } } };
            if (err.response?.data?.errors) setErrors(err.response.data.errors);
            handleApiError(error);
        } finally {
            setCreating(false);
        }
    };

    const onQuickDeptSuccess = async () => {
        setQuickDeptOpen(false);
        const before = new Set(departments.map((d) => d.id));
        await loadLookups();
        try {
            const res = await axios.get('/admin/departments/list', { params: { compact: 1 } });
            const list: LookupOption[] = Array.isArray(res.data?.data)
                ? res.data.data
                : res.data?.data?.data || [];
            const newest = list
                .filter((d) => !before.has(d.id))
                .sort((a, b) => b.id - a.id)[0];
            if (newest) {
                setCreateForm((prev) => ({ ...prev, department_id: String(newest.id) }));
            }
        } catch {
            /* lookups already refreshed */
        }
        setDeptRefresh((n) => n + 1);
    };

    const onQuickDesigSuccess = async () => {
        setQuickDesigOpen(false);
        const before = new Set(designations.map((d) => d.id));
        await loadLookups();
        try {
            const res = await axios.get('/admin/designations/list', { params: { compact: 1 } });
            const list: LookupOption[] = Array.isArray(res.data?.data)
                ? res.data.data
                : res.data?.data?.data || [];
            const newest = list
                .filter((d) => !before.has(d.id))
                .sort((a, b) => b.id - a.id)[0];
            if (newest) {
                setCreateForm((prev) => ({ ...prev, designation_id: String(newest.id) }));
            }
        } catch {
            /* lookups already refreshed */
        }
        setDesigRefresh((n) => n + 1);
    };

    const tabTriggerClass =
        'gap-2 rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#071b3a] data-[state=active]:to-[#0d4a8a] data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-500/25 dark:data-[state=active]:from-[#2a7fd9] dark:data-[state=active]:to-[#3a9bff] transition-all duration-200';

    if (visibleTabs.length === 0) {
        return (
            <AppLayout breadcrumbs={[{ title: 'User management', href: '/admin/users' }]}>
                <p className="text-muted-foreground">You do not have access to this area.</p>
            </AppLayout>
        );
    }

    return (
        <AppLayout breadcrumbs={[{ title: 'User management', href: '/admin/users' }]}>
            <div className="flex flex-1 flex-col gap-5">
                <div className="relative overflow-hidden rounded-2xl border border-white/60 bg-gradient-to-br from-[#e8f2fd] via-[#d0e4f8] to-[#c4d8f0] px-5 py-4 shadow-sm dark:border-white/10 dark:from-[#0d1e33] dark:via-[#0a1828] dark:to-[#071220]">
                    <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#071b3a]/20 bg-[#071b3a]/15 shadow-inner dark:border-white/10 dark:bg-white/10">
                                <Users className="h-5 w-5 text-[#071b3a] dark:text-blue-300" />
                            </div>
                            <div>
                                <h1 className="text-lg font-bold tracking-tight text-[#001f3f] dark:text-white">
                                    User management
                                </h1>
                                <p className="text-sm text-[#1e3a5f]/60 dark:text-blue-200/60">
                                    Staff, departments, designations, and roles in one place
                                </p>
                            </div>
                        </div>
                        {activeTab === 'staff' && canCreateStaff && (
                            <Button
                                onClick={() => {
                                    setErrors({});
                                    setAddOpen(true);
                                }}
                                className="shrink-0 gap-2 rounded-xl bg-gradient-to-r from-[#071b3a] to-[#0d4a8a] text-white shadow-md shadow-blue-500/25 hover:from-[#040f22] hover:to-[#0a3272]"
                            >
                                <Plus className="h-4 w-4" />
                                Add staff
                            </Button>
                        )}
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={handleTabChange}>
                    <TabsList className="h-11 gap-1 rounded-xl border border-white/80 bg-white/60 p-1 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
                        {visibleTabs.map((tab) => {
                            const Icon = tab.icon;
                            return (
                                <TabsTrigger key={tab.id} value={tab.id} className={tabTriggerClass}>
                                    <Icon className="h-4 w-4" />
                                    {tab.label}
                                </TabsTrigger>
                            );
                        })}
                    </TabsList>

                    {canViewStaff && (
                        <TabsContent value="staff" className="mt-4 space-y-5">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                <StatCard title="Total Users" value={stats.total} description="All users" icon={Users} />
                                <StatCard
                                    title="Active"
                                    value={stats.active}
                                    description="Currently active"
                                    icon={UserCheck}
                                    iconClassName="text-emerald-500 dark:text-emerald-400"
                                />
                                <StatCard
                                    title="HR-managed"
                                    value={stats.hr_managed ?? 0}
                                    description="No app login — HR manages them"
                                    icon={UserX}
                                    iconClassName="text-amber-500 dark:text-amber-400"
                                />
                                <StatCard
                                    title="App users"
                                    value={stats.app_users ?? Math.max(0, stats.total - (stats.hr_managed ?? 0))}
                                    description="Can sign in to the app"
                                    icon={UserCheck}
                                    iconClassName="text-sky-500 dark:text-sky-400"
                                />
                            </div>

                            <UserTable
                                key={refreshKey}
                                onRefresh={() => setRefreshKey((prev) => prev + 1)}
                                onCreateClick={
                                    canCreateStaff
                                        ? () => {
                                              setErrors({});
                                              setAddOpen(true);
                                          }
                                        : undefined
                                }
                            />
                        </TabsContent>
                    )}
                    {canViewDepartments && (
                        <TabsContent value="departments" className="mt-4 space-y-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-base font-semibold">Departments</h2>
                                    <p className="text-sm text-muted-foreground">Manage departments per branch</p>
                                </div>
                                {canCreateDepartments && (
                                    <Button
                                        onClick={() => {
                                            setEditingDepartment(null);
                                            setDeptFormOpen(true);
                                        }}
                                        className="gap-2"
                                    >
                                        <Plus className="h-4 w-4" />
                                        Add Department
                                    </Button>
                                )}
                            </div>
                            <DepartmentTable
                                onEdit={(department) => {
                                    setEditingDepartment(department as DepartmentRow);
                                    setDeptFormOpen(true);
                                }}
                                onRefresh={() => {
                                    setDeptRefresh((n) => n + 1);
                                    void loadLookups();
                                }}
                                refreshTrigger={deptRefresh}
                                onCreateClick={
                                    canCreateDepartments
                                        ? () => {
                                              setEditingDepartment(null);
                                              setDeptFormOpen(true);
                                          }
                                        : undefined
                                }
                            />
                            <DepartmentForm
                                open={deptFormOpen}
                                onClose={() => setDeptFormOpen(false)}
                                onSuccess={() => {
                                    setDeptFormOpen(false);
                                    setEditingDepartment(null);
                                    setDeptRefresh((n) => n + 1);
                                    void loadLookups();
                                }}
                                department={editingDepartment}
                            />
                        </TabsContent>
                    )}

                    {canViewDesignations && (
                        <TabsContent value="designations" className="mt-4 space-y-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-base font-semibold">Designations</h2>
                                    <p className="text-sm text-muted-foreground">Manage job titles and positions</p>
                                </div>
                                {canCreateDesignations && (
                                    <Button
                                        onClick={() => {
                                            setEditingDesignation(null);
                                            setDesigFormOpen(true);
                                        }}
                                        className="gap-2"
                                    >
                                        <Plus className="h-4 w-4" />
                                        Add Designation
                                    </Button>
                                )}
                            </div>
                            <DesignationTable
                                onEdit={(designation) => {
                                    setEditingDesignation(designation as DesignationRow);
                                    setDesigFormOpen(true);
                                }}
                                onRefresh={() => {
                                    setDesigRefresh((n) => n + 1);
                                    void loadLookups();
                                }}
                                refreshTrigger={desigRefresh}
                            />
                            <DesignationForm
                                open={desigFormOpen}
                                onClose={() => setDesigFormOpen(false)}
                                onSuccess={() => {
                                    setDesigFormOpen(false);
                                    setEditingDesignation(null);
                                    setDesigRefresh((n) => n + 1);
                                    void loadLookups();
                                }}
                                designation={editingDesignation}
                            />
                        </TabsContent>
                    )}

                    {canViewRoles && (
                        <TabsContent value="roles" className="mt-4 space-y-5">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                <StatCard
                                    title="Total Roles"
                                    value={roleStats.total}
                                    description="All roles in the system"
                                    icon={Shield}
                                />
                                <StatCard
                                    title="Permissions"
                                    value={roleStats.permissions_total || permissions.length}
                                    description="Permissions in your plan modules"
                                    icon={Key}
                                />
                            </div>
                            <RoleTable
                                roles={rolesList}
                                rolesLoading={rolesLoading}
                                allPermissions={permissions}
                                permissionModules={permissionModules}
                                onRoleUpdated={() => {
                                    void loadRolesList();
                                    void fetchRoleStats();
                                    void loadLookups();
                                    setRefreshKey((prev) => prev + 1);
                                }}
                            />
                        </TabsContent>
                    )}
                </Tabs>
            </div>

            <Dialog
                open={addOpen}
                onOpenChange={(open) => {
                    setAddOpen(open);
                    if (!open) {
                        setErrors({});
                    }
                }}
            >
                <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Add staff / employee</DialogTitle>
                        <DialogDescription>
                            Create a teammate. Set <strong>Reports to</strong> so they appear under that person on the Org Chart (roles do not build the hierarchy).
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={(e) => void handleCreateStaff(e)} className="space-y-4">
                        <div className="flex items-start space-x-2 rounded-md border p-3">
                            <Checkbox
                                id="hr_managed"
                                checked={createForm.hr_managed}
                                onCheckedChange={(checked) =>
                                    setCreateForm({
                                        ...createForm,
                                        hr_managed: !!checked,
                                    })
                                }
                            />
                            <div className="grid gap-1 leading-none">
                                <Label htmlFor="hr_managed" className="cursor-pointer font-medium">
                                    This person will not use the app (HR-managed)
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                    No email or password needed. HR marks attendance and leave for them.
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="name">
                                    Name <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="name"
                                    value={createForm.name}
                                    onChange={(e) =>
                                        setCreateForm({
                                            ...createForm,
                                            name: e.target.value,
                                        })
                                    }
                                    placeholder="Full name"
                                />
                                {errors.name && (
                                    <p className="text-sm text-destructive">{errors.name[0]}</p>
                                )}
                            </div>

                            {!createForm.hr_managed && (
                                <div className="space-y-2">
                                    <Label htmlFor="email">
                                        Email <span className="text-destructive">*</span>
                                    </Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={createForm.email}
                                        onChange={(e) =>
                                            setCreateForm({
                                                ...createForm,
                                                email: e.target.value,
                                            })
                                        }
                                        placeholder="user@example.com"
                                    />
                                    {errors.email && (
                                        <p className="text-sm text-destructive">{errors.email[0]}</p>
                                    )}
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="phone">Phone</Label>
                                <Input
                                    id="phone"
                                    value={createForm.phone}
                                    onChange={(e) =>
                                        setCreateForm({
                                            ...createForm,
                                            phone: e.target.value,
                                        })
                                    }
                                    placeholder="Phone number"
                                />
                                {errors.phone && (
                                    <p className="text-sm text-destructive">{errors.phone[0]}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="employee_id">Employee ID</Label>
                                <Input
                                    id="employee_id"
                                    value={createForm.employee_id}
                                    onChange={(e) =>
                                        setCreateForm({
                                            ...createForm,
                                            employee_id: e.target.value,
                                        })
                                    }
                                    placeholder="Auto"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Leave blank to auto-assign after create.
                                </p>
                            </div>

                            {!createForm.hr_managed && (
                                <>
                                    <div className="space-y-2">
                                        <Label htmlFor="password">
                                            Password <span className="text-destructive">*</span>
                                        </Label>
                                        <PasswordInput
                                            id="password"
                                            value={createForm.password}
                                            onChange={(e) =>
                                                setCreateForm({
                                                    ...createForm,
                                                    password: e.target.value,
                                                })
                                            }
                                            placeholder="••••••••"
                                        />
                                        {errors.password && (
                                            <p className="text-sm text-destructive">
                                                {errors.password[0]}
                                            </p>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="password_confirmation">
                                            Confirm password <span className="text-destructive">*</span>
                                        </Label>
                                        <PasswordInput
                                            id="password_confirmation"
                                            value={createForm.password_confirmation}
                                            onChange={(e) =>
                                                setCreateForm({
                                                    ...createForm,
                                                    password_confirmation: e.target.value,
                                                })
                                            }
                                            placeholder="••••••••"
                                        />
                                    </div>
                                </>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="status">Status</Label>
                                <Select
                                    value={createForm.status}
                                    onValueChange={(value) =>
                                        setCreateForm({ ...createForm, status: value })
                                    }
                                >
                                    <SelectTrigger id="status">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="active">Active</SelectItem>
                                        <SelectItem value="inactive">Inactive</SelectItem>
                                        <SelectItem value="suspended">Suspended</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Department</Label>
                                <div className="flex gap-2">
                                    <Select
                                        value={createForm.department_id || undefined}
                                        onValueChange={(value) =>
                                            setCreateForm({
                                                ...createForm,
                                                department_id: value,
                                            })
                                        }
                                    >
                                        <SelectTrigger className="flex-1">
                                            <SelectValue placeholder="Select department" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {departments.map((d) => (
                                                <SelectItem key={d.id} value={String(d.id)}>
                                                    {d.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {canCreateDepartments && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            title="Add department"
                                            onClick={() => setQuickDeptOpen(true)}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Designation</Label>
                                <div className="flex gap-2">
                                    <Select
                                        value={createForm.designation_id || undefined}
                                        onValueChange={(value) =>
                                            setCreateForm({
                                                ...createForm,
                                                designation_id: value,
                                            })
                                        }
                                    >
                                        <SelectTrigger className="flex-1">
                                            <SelectValue placeholder="Select designation" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {designations.map((d) => (
                                                <SelectItem key={d.id} value={String(d.id)}>
                                                    {d.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {canCreateDesignations && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            title="Add designation"
                                            onClick={() => setQuickDesigOpen(true)}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Role (app access)</Label>
                                <Select
                                    value={createForm.role_id || undefined}
                                    onValueChange={(value) =>
                                        setCreateForm({ ...createForm, role_id: value })
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Default Employee role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {roleOptions.map((r) => (
                                            <SelectItem key={r.id} value={String(r.id)}>
                                                {r.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    What they can do in the app — not their place on the org chart.
                                </p>
                            </div>

                            <div className="space-y-2 sm:col-span-2">
                                <Label>Reports to</Label>
                                <Select
                                    value={createForm.reporting_manager_id || 'none'}
                                    onValueChange={(value) =>
                                        setCreateForm({
                                            ...createForm,
                                            reporting_manager_id:
                                                value === 'none' ? '' : value,
                                        })
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Who do they report to?" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">
                                            No one (top of chart)
                                        </SelectItem>
                                        {managerOptions.map((m) => (
                                            <SelectItem key={m.id} value={String(m.id)}>
                                                {m.name}
                                                {m.designation?.name
                                                    ? ` (${m.designation.name})`
                                                    : ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    Places this person under that employee on the Org Chart hierarchy.
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 border-t pt-4">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setAddOpen(false)}
                                disabled={creating}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={creating}>
                                {creating ? 'Creating…' : 'Add staff'}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <DepartmentForm
                open={quickDeptOpen}
                onClose={() => setQuickDeptOpen(false)}
                onSuccess={() => void onQuickDeptSuccess()}
                department={null}
            />
            <DesignationForm
                open={quickDesigOpen}
                onClose={() => setQuickDesigOpen(false)}
                onSuccess={() => void onQuickDesigSuccess()}
                designation={null}
            />
        </AppLayout>
    );
}
