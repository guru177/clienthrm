import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, X, FolderPlus } from 'lucide-react';
import { handleApiError, handleApiResponse } from '@/lib/toast';
import axios from '@/lib/axios';

interface User {
    id: number;
    name: string;
}

export default function Create() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [users, setUsers] = useState<User[]>([]);
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
        void loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            const res = await axios.get('/admin/users/list');
            const data = res.data?.data;
            setUsers(Array.isArray(data) ? data : data?.data || []);
        } catch (error) {
            handleApiError(error);
        }
    };

    const breadcrumbs = [
        { label: 'Projects', href: '/admin/projects' },
        { label: 'Create Project' },
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
        setLoading(true);
        setErrors({});

        try {
            const payload = {
                ...formData,
                project_manager_id: formData.project_manager_id === 'none' ? '' : formData.project_manager_id,
                team_members: selectedTeamMembers
                    .filter((tm) => tm.userId)
                    .map((tm) => tm.userId),
                team_member_roles: selectedTeamMembers
                    .filter((tm) => tm.userId)
                    .map((tm) => tm.role),
            };

            const response = await axios.post('/admin/projects', payload);
            handleApiResponse(response);
            navigate('/admin/projects');
        } catch (error) {
            if ((error as any)?.response?.data?.errors) {
                setErrors((error as any).response.data.errors);
            }
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            

            <div className="space-y-6">
                {/* Header */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#e8f2fd] via-[#d0e4f8] to-[#c4d8f0] dark:from-[#0d1e33] dark:via-[#0a1828] dark:to-[#071220] px-4 sm:px-6 py-4 sm:py-5 border border-white/60 dark:border-white/10 shadow-sm">
                    <div className="pointer-events-none absolute -top-12 -right-12 w-56 h-56 opacity-15">
                        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                            <path fill="#071b3a" d="M44.7,-76.4C58.4,-69.7,70.3,-58.6,77.9,-44.9C85.5,-31.2,88.7,-15.6,87.4,-0.8C86,14,80,28,72.1,40.5C64.2,53,54.2,64,42.1,71.3C30,78.6,15,82.3,0.1,82.1C-14.8,81.9,-29.6,77.8,-42.7,70.5C-55.8,63.2,-67.3,52.7,-74.5,39.5C-81.7,26.3,-84.7,10.5,-83.1,-4.9C-81.6,-20.3,-75.5,-35.2,-66.3,-47.4C-57.1,-59.6,-44.8,-69.1,-31.6,-76.1C-18.4,-83.1,-4.6,-87.6,8.2,-86.2C21,-84.8,31,-83.1,44.7,-76.4Z" transform="translate(100 100)" />
                        </svg>
                    </div>
                    <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => navigate('/admin/projects')}
                                className="h-10 w-10 shrink-0 rounded-xl bg-white/50 hover:bg-white border-white/60 dark:bg-slate-900/50 dark:hover:bg-slate-900 dark:border-slate-700 backdrop-blur-sm transition-all"
                            >
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-[#071b3a]/15 dark:bg-white/10 border border-[#071b3a]/20 dark:border-white/10">
                                <FolderPlus className="h-5 w-5 sm:h-6 sm:w-6 text-[#071b3a] dark:text-blue-300" />
                            </div>
                            <div>
                                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[#001f3f] dark:text-white">
                                    Create New Project
                                </h1>
                                <p className="text-sm text-[#1e3a5f]/60 dark:text-blue-200/60">
                                    Add a new project to your portfolio
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
                                            {users.map((user) => (
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
                                <CardTitle>Team Members (Optional)</CardTitle>
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
                                    No team members added yet. Click "Add Member" to
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
                                                    {users.map((user) => (
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
                            {loading ? 'Creating...' : 'Create Project'}
                        </Button>
                    </div>
                </form>
            </div>
        </AppLayout>
    );
}
