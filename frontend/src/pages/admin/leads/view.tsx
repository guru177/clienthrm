import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import axios from '@/lib/axios';
import {
    User,
    Mail,
    Phone,
    Calendar,
    Tag,
    Building2,
    UserCheck,
    ArrowLeft,
    Edit,
    Check,
    X,
    Activity,
    Save,
} from 'lucide-react';
import { useState, useEffect } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import { handleApiResponse, handleApiError } from '@/lib/toast';

interface Admin {
    id: number;
    name: string;
    email: string;
}

interface Campaign {
    id: number;
    name: string;
    status: string;
}

interface AssignedTo {
    id: number;
    name: string;
    email: string;
}

interface Lead {
    id: number;
    first_name: string;
    last_name: string;
    full_name: string;
    email: string;
    phone: string;
    mobile?: string;
    campaign_id: number;
    campaign?: Campaign;
    assigned_to?: number;
    assignedTo?: AssignedTo;
    status: string;
    custom_fields?: Record<string, any>;
    notes?: string;
    converted_contact_id?: number;
    converted_at?: string;
    created_at: string;
    updated_at: string;
}

interface LeadActivity {
    id: number;
    type: string;
    description: string;
    user: {
        id: number;
        name: string;
    } | null;
    metadata?: Record<string, any>;
    created_at: string;
}

export default function ViewLead() {
    const navigate = useNavigate();
    const { id } = useParams();
    const [lead, setLead] = useState<Lead | null>(null);
    const [admins, setAdmins] = useState<Admin[]>([]);
    const [pageLoading, setPageLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        mobile: '',
    });
    const [activities, setActivities] = useState<LeadActivity[]>([]);
    const [loadingActivities, setLoadingActivities] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [newNote, setNewNote] = useState('');
    const [addingNote, setAddingNote] = useState(false);

    const breadcrumbs = [
        { title: 'Leads', href: '/admin/leads' },
        { title: lead?.full_name || 'Lead' },
    ];

    useEffect(() => {
        fetchLead();
        fetchActivities();
        fetchAdmins();
    }, [id]);

    const fetchLead = async () => {
        setPageLoading(true);
        try {
            const response = await axios.get(`/admin/leads/${id}`);
            const data = response.data.data || response.data;
            setLead(data);
            setEditForm({
                first_name: data.first_name || '',
                last_name: data.last_name || '',
                email: data.email || '',
                phone: data.phone || '',
                mobile: data.mobile || '',
            });
        } catch (error) {
            handleApiError(error);
        } finally {
            setPageLoading(false);
        }
    };

    const fetchAdmins = async () => {
        try {
            const response = await axios.get('/admin/users/list');
            const data = response.data.data;
            setAdmins(Array.isArray(data) ? data : (data?.data || []));
        } catch (error) {
            // Non-critical, admins dropdown will be empty
        }
    };

    const fetchActivities = async () => {
        try {
            setLoadingActivities(true);
            const response = await axios.get(`/admin/leads/${id}/activities`);
            if (response.data.success) {
                setActivities(response.data.data);
            }
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoadingActivities(false);
        }
    };

    if (pageLoading || !lead) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                <div className="flex min-h-[60vh] items-center justify-center">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
            </AppLayout>
        );
    }

    const handleAssign = async (adminId: string) => {
        setUpdating(true);
        try {
            const response = await axios.put(`/admin/leads/${lead.id}`, {
                assigned_to: adminId === 'unassign' ? null : parseInt(adminId),
            });
            handleApiResponse(response);
            if (response.data.success) {
                setLead(response.data.data);
                fetchActivities(); // Refresh activities
            }
        } catch (error) {
            handleApiError(error);
        } finally {
            setUpdating(false);
        }
    };

    const handleStatusChange = async (status: string) => {
        setUpdating(true);
        try {
            const response = await axios.put(`/admin/leads/${lead.id}`, { status });
            handleApiResponse(response);
            if (response.data.success) {
                setLead(response.data.data);
                fetchActivities(); // Refresh activities
            }
        } catch (error) {
            handleApiError(error);
        } finally {
            setUpdating(false);
        }
    };

    const handleAddNote = async () => {
        if (!newNote.trim()) return;

        setAddingNote(true);
        try {
            const response = await axios.post(`/admin/leads/${lead.id}/notes`, {
                note: newNote,
            });
            handleApiResponse(response);
            if (response.data.success) {
                setNewNote('');
                fetchActivities(); // Refresh activities
            }
        } catch (error) {
            handleApiError(error);
        } finally {
            setAddingNote(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            const response = await axios.delete(`/admin/leads/${lead.id}`);
            handleApiResponse(response);
            navigate('/admin/leads');
        } catch (error) {
            handleApiError(error);
            setDeleting(false);
        }
    };

    const handleSaveEdit = async () => {
        setUpdating(true);
        try {
            const response = await axios.put(`/admin/leads/${lead.id}`, editForm);
            handleApiResponse(response);
            if (response.data.success) {
                setLead(response.data.data);
                setIsEditing(false);
                fetchActivities(); // Refresh activities
            }
        } catch (error) {
            handleApiError(error);
        } finally {
            setUpdating(false);
        }
    };

    const handleCancelEdit = () => {
        setEditForm({
            first_name: lead.first_name,
            last_name: lead.last_name,
            email: lead.email,
            phone: lead.phone,
            mobile: lead.mobile || '',
        });
        setIsEditing(false);
    };

    const getStatusBadge = (status: string) => {
        const variants: Record<string, any> = {
            new: { variant: 'default', label: 'New' },
            in_progress: { variant: 'warning', label: 'In Progress' },
            qualified: { variant: 'success', label: 'Qualified' },
            contacted: { variant: 'secondary', label: 'Contacted' },
            converted: { variant: 'success', label: 'Converted' },
            rejected: { variant: 'destructive', label: 'Rejected' },
        };
        const config = variants[status] || variants.new;
        return <Badge variant={config.variant}>{config.label}</Badge>;
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>

            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => navigate('/admin/leads')}
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">{lead.full_name}</h1>
                            <p className="text-muted-foreground">
                                Lead #{lead.id} • Created{' '}
                                {new Date(lead.created_at).toLocaleDateString()}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {isEditing ? (
                            <>
                                <Button onClick={handleSaveEdit} disabled={updating}>
                                    <Save className="mr-2 h-4 w-4" />
                                    {updating ? 'Saving...' : 'Save'}
                                </Button>
                                <Button variant="outline" onClick={handleCancelEdit} disabled={updating}>
                                    <X className="mr-2 h-4 w-4" />
                                    Cancel
                                </Button>
                            </>
                        ) : (
                            <Button variant="outline" onClick={() => setIsEditing(true)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                            </Button>
                        )}
                    </div>
                </div>

                <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {/* Main Info */}
                    <div className="md:col-span-2 space-y-6">
                        {/* Lead Details */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Lead Information</CardTitle>
                                <CardDescription>
                                    Contact details and basic information
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="flex items-start gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                            <User className="h-5 w-5 text-primary" />
                                        </div>
                                        <div className="flex-1">
                                            <Label className="text-sm text-muted-foreground">First Name</Label>
                                            {isEditing ? (
                                                <Input
                                                    value={editForm.first_name}
                                                    onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                                                    className="mt-1"
                                                />
                                            ) : (
                                                <p className="font-medium mt-1">{lead.first_name}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                            <User className="h-5 w-5 text-primary" />
                                        </div>
                                        <div className="flex-1">
                                            <Label className="text-sm text-muted-foreground">Last Name</Label>
                                            {isEditing ? (
                                                <Input
                                                    value={editForm.last_name}
                                                    onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                                                    className="mt-1"
                                                />
                                            ) : (
                                                <p className="font-medium mt-1">{lead.last_name}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                            <Mail className="h-5 w-5 text-primary" />
                                        </div>
                                        <div className="flex-1">
                                            <Label className="text-sm text-muted-foreground">Email</Label>
                                            {isEditing ? (
                                                <Input
                                                    type="email"
                                                    value={editForm.email}
                                                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                                    className="mt-1"
                                                />
                                            ) : (
                                                <a
                                                    href={`mailto:${lead.email}`}
                                                    className="font-medium text-primary hover:underline mt-1 block"
                                                >
                                                    {lead.email}
                                                </a>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                            <Phone className="h-5 w-5 text-primary" />
                                        </div>
                                        <div className="flex-1">
                                            <Label className="text-sm text-muted-foreground">Phone</Label>
                                            {isEditing ? (
                                                <Input
                                                    value={editForm.phone}
                                                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                                                    className="mt-1"
                                                />
                                            ) : (
                                                <a
                                                    href={`tel:${lead.phone}`}
                                                    className="font-medium text-primary hover:underline mt-1 block"
                                                >
                                                    {lead.phone}
                                                </a>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                            <Phone className="h-5 w-5 text-primary" />
                                        </div>
                                        <div className="flex-1">
                                            <Label className="text-sm text-muted-foreground">Mobile</Label>
                                            {isEditing ? (
                                                <Input
                                                    value={editForm.mobile}
                                                    onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value })}
                                                    className="mt-1"
                                                    placeholder="Optional"
                                                />
                                            ) : lead.mobile ? (
                                                <a
                                                    href={`tel:${lead.mobile}`}
                                                    className="font-medium text-primary hover:underline mt-1 block"
                                                >
                                                    {lead.mobile}
                                                </a>
                                            ) : (
                                                <p className="text-sm text-muted-foreground mt-1">Not provided</p>
                                            )}
                                        </div>
                                    </div>

                                    {lead.campaign && (
                                        <div className="flex items-start gap-3">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                                <Building2 className="h-5 w-5 text-primary" />
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-sm text-muted-foreground">Campaign</p>
                                                <p className="font-medium">{lead.campaign.name}</p>
                                                <Badge variant="outline" className="mt-1">
                                                    {lead.campaign.status}
                                                </Badge>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {lead.custom_fields && Object.keys(lead.custom_fields).length > 0 && (
                                    <>
                                        <Separator />
                                        <div>
                                            <h4 className="font-medium mb-3">Custom Fields</h4>
                                            <div className="grid gap-3 sm:grid-cols-2">
                                                {Object.entries(lead.custom_fields).map(([key, value]) => (
                                                    <div key={key} className="rounded-lg border p-3">
                                                        <p className="text-sm text-muted-foreground capitalize">
                                                            {key.replace(/_/g, ' ')}
                                                        </p>
                                                        <p className="font-medium">{String(value)}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>

                        {/* Notes */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Add Note</CardTitle>
                                <CardDescription>Add internal notes about this lead</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <Textarea
                                    placeholder="Add a new note..."
                                    value={newNote}
                                    onChange={(e) => setNewNote(e.target.value)}
                                    rows={3}
                                />
                                <Button onClick={handleAddNote} disabled={!newNote.trim() || addingNote}>
                                    {addingNote ? 'Adding...' : 'Add Note'}
                                </Button>
                            </CardContent>
                        </Card>

                        {/* Activity History */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Activity className="h-5 w-5" />
                                    Activity History
                                </CardTitle>
                                <CardDescription>
                                    All activities and changes for this lead
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {loadingActivities ? (
                                    <div className="flex items-center justify-center py-8">
                                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                                    </div>
                                ) : activities.length === 0 ? (
                                    <p className="text-center py-8 text-muted-foreground">
                                        No activity history yet
                                    </p>
                                ) : (
                                    <div className="space-y-4">
                                        {activities.map((activity) => (
                                            <div
                                                key={activity.id}
                                                className="flex gap-3 pb-4 border-b last:border-0"
                                            >
                                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 shrink-0">
                                                    {activity.type === 'note_added' ? (
                                                        <Calendar className="h-4 w-4 text-primary" />
                                                    ) : activity.type === 'status_changed' ? (
                                                        <Tag className="h-4 w-4 text-primary" />
                                                    ) : activity.type === 'assigned' ? (
                                                        <UserCheck className="h-4 w-4 text-primary" />
                                                    ) : activity.type === 'info_updated' ? (
                                                        <Edit className="h-4 w-4 text-primary" />
                                                    ) : (
                                                        <Activity className="h-4 w-4 text-primary" />
                                                    )}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-sm font-medium mb-1">
                                                        {activity.type === 'note_added' && 'Note Added'}
                                                        {activity.type === 'status_changed' && 'Status Changed'}
                                                        {activity.type === 'assigned' && 'Assignment Changed'}
                                                        {activity.type === 'info_updated' && 'Information Updated'}
                                                    </p>
                                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                                        {activity.description}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                                                        {activity.user && (
                                                            <>
                                                                <span>{activity.user.name}</span>
                                                                <span>•</span>
                                                            </>
                                                        )}
                                                        <span>
                                                            {new Date(activity.created_at).toLocaleString()}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        {/* Status */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Status</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <Tag className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm">Current Status:</span>
                                    {getStatusBadge(lead.status)}
                                </div>
                                <Separator />
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Change Status</label>
                                    <Select
                                        value={lead.status}
                                        onValueChange={handleStatusChange}
                                        disabled={updating}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="new">New</SelectItem>
                                            <SelectItem value="contacted">Contacted</SelectItem>
                                            <SelectItem value="in_progress">In Progress</SelectItem>
                                            <SelectItem value="qualified">Qualified</SelectItem>
                                            <SelectItem value="converted">Converted</SelectItem>
                                            <SelectItem value="rejected">Rejected</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Assignment */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Assignment</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {lead.assignedTo ? (
                                    <div className="flex items-start gap-3 rounded-lg border p-3 bg-muted/50">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                            <UserCheck className="h-5 w-5 text-primary" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-medium">{lead.assignedTo.name}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {lead.assignedTo.email}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <X className="h-4 w-4" />
                                        <span className="text-sm">Not assigned</span>
                                    </div>
                                )}
                                <Separator />
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Assign To</label>
                                    <Select
                                        value={lead.assigned_to?.toString() || 'unassign'}
                                        onValueChange={handleAssign}
                                        disabled={updating}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select admin..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="unassign">Unassigned</SelectItem>
                                            {admins.map((admin) => (
                                                <SelectItem key={admin.id} value={admin.id.toString()}>
                                                    {admin.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Timestamps */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Timeline</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex items-start gap-3">
                                    <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                                    <div className="flex-1">
                                        <p className="text-sm font-medium">Created</p>
                                        <p className="text-sm text-muted-foreground">
                                            {new Date(lead.created_at).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                                    <div className="flex-1">
                                        <p className="text-sm font-medium">Last Updated</p>
                                        <p className="text-sm text-muted-foreground">
                                            {new Date(lead.updated_at).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                                {lead.converted_at && (
                                    <div className="flex items-start gap-3">
                                        <Check className="h-4 w-4 text-green-600 mt-0.5" />
                                        <div className="flex-1">
                                            <p className="text-sm font-medium">Converted</p>
                                            <p className="text-sm text-muted-foreground">
                                                {new Date(lead.converted_at).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}