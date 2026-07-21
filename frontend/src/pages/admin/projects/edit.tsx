import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppLayout from '@/layouts/app-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, X, Briefcase } from 'lucide-react';
import { handleApiError, handleApiResponse } from '@/lib/toast';
import axios from '@/lib/axios';

interface Project {
    id: number;
    name: string;
    description: string | null;
    status: string;
    priority: string;
    start_date: string | null;
    end_date: string | null;
    budget: string | null;
    progress_percentage: number;
    project_manager_id: number | null;
    team_members?: Array<{
        id: number;
        name: string;
        pivot: { role: string };
    }>;
}

interface User {
    id: number;
    name: string;
}

export default function Edit() {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const [project, setProject] = useState<Project | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [pageLoading, setPageLoading] = useState(true);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        status: 'planning',
        priority: 'medium',
        start_date: '',
        end_date: '',
        budget: '',
        progress_percentage: '0',
        project_manager_id: 'none',
    });
    const [selectedTeamMembers, setSelectedTeamMembers] = useState<
        Array<{ userId: string; role: string }>
    >([]);

    useEffect(() => {
        void loadPage();
    }, [id]);

    const loadPage = async () => {
        if (!id) return;
        setPageLoading(true);
        try {
            const [projectRes, usersRes] = await Promise.all([
                axios.get(`/admin/projects/${id}`),
                axios.get('/admin/users/list'),
            ]);
            const p = (projectRes.data?.data || projectRes.data) as Project;
            setProject(p);
            setFormData({
                name: p.name || '',
                description: p.description || '',
                status: p.status || 'planning',
                priority: p.priority || 'medium',
                start_date: p.start_date || '',
                end_date: p.end_date || '',
                budget: p.budget || '',
                progress_percentage: String(p.progress_percentage ?? 0),
                project_manager_id: p.project_manager_id?.toString() || 'none',
            });
            setSelectedTeamMembers(
                p.team_members?.map((member) => ({
                    userId: member.id.toString(),
                    role: member.pivot?.role || 'member',
                })) || [],
            );
            const userData = usersRes.data?.data;
            setUsers(Array.isArray(userData) ? userData : userData?.data || []);
        } catch (error) {
            handleApiError(error);
        } finally {
            setPageLoading(false);
        }
    };

    const safeUsers = users;

    const breadcrumbs = [
        { label: 'Projects', href: '/admin/projects' },
        { label: 'Edit Project' },
    ];

    const handleChange = (field: string, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors((prev) => {
                const newErrors = { ...prev };
                delete newErrors[field];
                return newErrors;
            });
        }
    };

    const addTeamMember = () => {
        setSelectedTeamMembers([
            ...selectedTeamMembers,
            { userId: '', role: 'member' },
        ]);
    };

    const removeTeamMember = (index: number) => {
        setSelectedTeamMembers(selectedTeamMembers.filter((_, i) => i !== index));
    };

    const updateTeamMember = (
        index: number,
        field: 'userId' | 'role',
        value: string,
    ) => {
        const updated = [...selectedTeamMembers];
        updated[index][field] = value;
        setSelectedTeamMembers(updated);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!project?.id) return;
        setLoading(true);
        setErrors({});

        try {
            const payload = {
                ...formData,
                team_members: selectedTeamMembers
                    .filter((tm) => tm.userId)
                    .map((tm) => tm.userId),
                team_member_roles: selectedTeamMembers
                    .filter((tm) => tm.userId)
                    .map((tm) => tm.role),
            };

            const response = await axios.put(
                `/admin/projects/${project.id}`,
                payload,
            );
            handleApiResponse(response);
            navigate('/admin/projects');
        } catch (error: any) {
            if (error.response?.data?.errors) {
                setErrors(error.response.data.errors);
            }
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    if (pageLoading) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                <div className="p-8 text-muted-foreground">Loading project...</div>
            </AppLayout>
        );
    }

    if (!project) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                <div className="p-8 space-y-4">
                    <p className="text-muted-foreground">Project not found.</p>
                    <Button onClick={() => navigate('/admin/projects')}>Back to Projects</Button>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>

            <div className="space-y-6">
                {/* Hero Header */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#e8f2fd] via-[#d0e4f8] to-[#c4d8f0] dark:from-[#0d1e33] dark:via-[#0a1828] dark:to-[#071220] px-6 py-5 shadow-sm border border-white/60 dark:border-white/10">
                    {/* decorative blob */}
                    <div className="pointer-events-none absolute -top-10 -right-10 w-48 h-48 opacity-20">
                        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                            <path fill="#071b3a" d="M44.7,-76.4C58.4,-69.7,70.3,-58.6,77.9,-44.9C85.5,-31.2,88.7,-15.6,87.4,-0.8C86,14,80,28,72.1,40.5C64.2,53,54.2,64,42.1,71.3C30,78.6,15,82.3,0.1,82.1C-14.8,81.9,-29.6,77.8,-42.7,70.5C-55.8,63.2,-67.3,52.7,-74.5,39.5C-81.7,26.3,-84.7,10.5,-83.1,-4.9C-81.6,-20.3,-75.5,-35.2,-66.3,-47.4C-57.1,-59.6,-44.8,-69.1,-31.6,-76.1C-18.4,-83.1,-4.6,-87.6,8.2,-86.2C21,-84.8,31,-83.1,44.7,-76.4Z" transform="translate(100 100)" />
                        </svg>
                    </div>
                    <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#071b3a]/15 dark:bg-white/10 border border-[#071b3a]/20 dark:border-white/10 shadow-inner">
                                <Briefcase className="h-6 w-6 text-[#071b3a] dark:text-blue-300" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight text-[#001f3f] dark:text-white">
                                    Edit Project
                                </h1>
                                <p className="text-sm text-[#1e3a5f]/60 dark:text-blue-200/60 flex items-center gap-2 mt-1">
                                    Update project information
                                    <span className="opacity-50">•</span>
                                    <Button
                                        variant="link"
                                        size="sm"
                                        className="h-auto p-0 text-[#1e3a5f]/60 dark:text-blue-200/60 hover:text-[#001f3f] dark:hover:text-white"
                                        onClick={() => navigate('/admin/projects')}
                                    >
                                        <ArrowLeft className="mr-1 h-3 w-3" />
                                        Back to Projects
                                    </Button>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Project Information</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">
                                    Project Name{' '}
                                    <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) =>
                                        handleChange('name', e.target.value)
                                    }
                                    placeholder="Enter project name"
                                />
                                {errors.name && (
                                    <p className="text-sm text-destructive">
                                        {errors.name[0]}
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    value={formData.description}
                                    onChange={(e) =>
                                        handleChange('description', e.target.value)
                                    }
                                    placeholder="Enter project description"
                                    rows={4}
                                />
                                {errors.description && (
                                    <p className="text-sm text-destructive">
                                        {errors.description[0]}
                                    </p>
                                )}
                            </div>

                            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="status">
                                        Status{' '}
                                        <span className="text-destructive">*</span>
                                    </Label>
                                    <Select
                                        value={formData.status}
                                        onValueChange={(value) =>
                                            handleChange('status', value)
                                        }
                                    >
                                        <SelectTrigger id="status">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="planning">
                                                Planning
                                            </SelectItem>
                                            <SelectItem value="in_progress">
                                                In Progress
                                            </SelectItem>
                                            <SelectItem value="on_hold">
                                                On Hold
                                            </SelectItem>
                                            <SelectItem value="completed">
                                                Completed
                                            </SelectItem>
                                            <SelectItem value="cancelled">
                                                Cancelled
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {errors.status && (
                                        <p className="text-sm text-destructive">
                                            {errors.status[0]}
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="priority">
                                        Priority{' '}
                                        <span className="text-destructive">*</span>
                                    </Label>
                                    <Select
                                        value={formData.priority}
                                        onValueChange={(value) =>
                                            handleChange('priority', value)
                                        }
                                    >
                                        <SelectTrigger id="priority">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="low">Low</SelectItem>
                                            <SelectItem value="medium">
                                                Medium
                                            </SelectItem>
                                            <SelectItem value="high">High</SelectItem>
                                            <SelectItem value="urgent">
                                                Urgent
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {errors.priority && (
                                        <p className="text-sm text-destructive">
                                            {errors.priority[0]}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="project_manager_id">
                                        Project Manager
                                    </Label>
                                    <Select
                                        value={formData.project_manager_id}
                                        onValueChange={(value) =>
                                            handleChange('project_manager_id', value)
                                        }
                                    >
                                        <SelectTrigger id="project_manager_id">
                                            <SelectValue placeholder="Select manager" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">
                                                No Manager
                                            </SelectItem>
                                            {safeUsers.map((user) => (
                                                <SelectItem
                                                    key={user.id}
                                                    value={user.id.toString()}
                                                >
                                                    {user.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {errors.project_manager_id && (
                                        <p className="text-sm text-destructive">
                                            {errors.project_manager_id[0]}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="start_date">Start Date</Label>
                                    <Input
                                        id="start_date"
                                        type="date"
                                        value={formData.start_date}
                                        onChange={(e) =>
                                            handleChange('start_date', e.target.value)
                                        }
                                    />
                                    {errors.start_date && (
                                        <p className="text-sm text-destructive">
                                            {errors.start_date[0]}
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="end_date">End Date</Label>
                                    <Input
                                        id="end_date"
                                        type="date"
                                        value={formData.end_date}
                                        onChange={(e) =>
                                            handleChange('end_date', e.target.value)
                                        }
                                    />
                                    {errors.end_date && (
                                        <p className="text-sm text-destructive">
                                            {errors.end_date[0]}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="budget">Budget ($)</Label>
                                    <Input
                                        id="budget"
                                        type="number"
                                        step="0.01"
                                        value={formData.budget}
                                        onChange={(e) =>
                                            handleChange('budget', e.target.value)
                                        }
                                        placeholder="0.00"
                                    />
                                    {errors.budget && (
                                        <p className="text-sm text-destructive">
                                            {errors.budget[0]}
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="progress_percentage">
                                        Progress (%)
                                    </Label>
                                    <Input
                                        id="progress_percentage"
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={formData.progress_percentage}
                                        onChange={(e) =>
                                            handleChange(
                                                'progress_percentage',
                                                e.target.value,
                                            )
                                        }
                                    />
                                    {errors.progress_percentage && (
                                        <p className="text-sm text-destructive">
                                            {errors.progress_percentage[0]}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle>Team Members</CardTitle>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={addTeamMember}
                                >
                                    Add Member
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {selectedTeamMembers.length === 0 ? (
                                <p className="text-center text-sm text-muted-foreground">
                                    No team members assigned. Click "Add Member" to
                                    assign team members.
                                </p>
                            ) : (
                                selectedTeamMembers.map((member, index) => (
                                    <div
                                        key={index}
                                        className="flex items-end gap-2"
                                    >
                                        <div className="flex-1 space-y-2">
                                            <Label>Team Member</Label>
                                            <Select
                                                value={member.userId}
                                                onValueChange={(value) =>
                                                    updateTeamMember(
                                                        index,
                                                        'userId',
                                                        value,
                                                    )
                                                }
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select user" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {safeUsers.map((user) => (
                                                        <SelectItem
                                                            key={user.id}
                                                            value={user.id.toString()}
                                                        >
                                                            {user.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="flex-1 space-y-2">
                                            <Label>Role</Label>
                                            <Select
                                                value={member.role}
                                                onValueChange={(value) =>
                                                    updateTeamMember(
                                                        index,
                                                        'role',
                                                        value,
                                                    )
                                                }
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="member">
                                                        Member
                                                    </SelectItem>
                                                    <SelectItem value="lead">
                                                        Lead
                                                    </SelectItem>
                                                    <SelectItem value="contributor">
                                                        Contributor
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => removeTeamMember(index)}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    {/* Actions */}
                    <div className="flex justify-end gap-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => navigate('/admin/projects')}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Updating...' : 'Update Project'}
                        </Button>
                    </div>
                </form>
            </div>
        </AppLayout>
    );
}