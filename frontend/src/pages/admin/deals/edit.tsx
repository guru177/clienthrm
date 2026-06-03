import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/layouts/app-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useState, useEffect } from 'react';
import { handleApiResponse, handleApiError } from '@/lib/toast';
import axios from '@/lib/axios';

interface IdName { id: number; name: string; }

interface Deal {
    id: number;
    name: string;
    description: string | null;
    stage: string;
    value: number | null;
    currency: string;
    probability: number;
    expected_close_date: string | null;
    company_id: number | null;
    contact_id: number | null;
    project_id: number | null;
    campaign_id: number | null;
    lead_id: number | null;
    assigned_to: number | null;
    notes: string | null;
}

export default function EditDeal() {
    const navigate = useNavigate();
    const { id } = useParams();
    const [deal, setDeal] = useState<Deal | null>(null);
    const [pageLoading, setPageLoading] = useState(true);
    const [companies, setCompanies] = useState<IdName[]>([]);
    const [contacts, setContacts] = useState<IdName[]>([]);
    const [projects, setProjects] = useState<IdName[]>([]);
    const [campaigns, setCampaigns] = useState<IdName[]>([]);
    const [leads, setLeads] = useState<IdName[]>([]);
    const [users, setUsers] = useState<IdName[]>([]);

    const breadcrumbs = [
        { label: 'Deals', href: '/admin/deals' },
        { label: 'Edit', href: `/admin/deals/${id}/edit` },
    ];

    useEffect(() => {
        const fetchAll = async () => {
            setPageLoading(true);
            try {
                const [dealRes, compRes, contRes, projRes, campRes, leadRes, userRes] = await Promise.allSettled([
                    axios.get(`/admin/deals/${id}`),
                    axios.get('/admin/contacts/companies'),
                    axios.get('/admin/contacts/list'),
                    axios.get('/admin/projects/list'),
                    axios.get('/admin/campaigns/list'),
                    axios.get('/admin/leads/list'),
                    axios.get('/admin/users/list'),
                ]);
                const extract = (r: PromiseSettledResult<any>) => {
                    if (r.status !== 'fulfilled') return [];
                    const d = r.value.data.data;
                    return Array.isArray(d) ? d : (d?.data || []);
                };
                if (dealRes.status === 'fulfilled') {
                    const d = dealRes.value.data.data || dealRes.value.data;
                    setDeal(d);
                    setFormData({
                        name: d.name,
                        description: d.description || '',
                        stage: d.stage,
                        value: d.value?.toString() || '',
                        currency: d.currency,
                        probability: d.probability.toString(),
                        expected_close_date: d.expected_close_date || '',
                        company_id: d.company_id?.toString() || 'none',
                        contact_id: d.contact_id?.toString() || 'none',
                        project_id: d.project_id?.toString() || 'none',
                        campaign_id: d.campaign_id?.toString() || 'none',
                        lead_id: d.lead_id?.toString() || 'none',
                        assigned_to: d.assigned_to?.toString() || 'none',
                        notes: d.notes || '',
                    });
                }
                setCompanies(extract(compRes));
                setContacts(extract(contRes));
                setProjects(extract(projRes));
                setCampaigns(extract(campRes));
                setLeads(extract(leadRes));
                setUsers(extract(userRes));
            } catch (error) {
                handleApiError(error);
            } finally {
                setPageLoading(false);
            }
        };
        fetchAll();
    }, [id]);

    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        stage: 'lead',
        value: '',
        currency: 'INR',
        probability: '0',
        expected_close_date: '',
        company_id: 'none',
        contact_id: 'none',
        project_id: 'none',
        campaign_id: 'none',
        lead_id: 'none',
        assigned_to: 'none',
        notes: '',
    });

    if (pageLoading || !deal) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                <div className="flex min-h-[60vh] items-center justify-center">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
            </AppLayout>
        );
    }

    const handleChange = (field: string, value: string | number | null) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        // Clear error for this field
        if (errors[field]) {
            setErrors((prev) => {
                const newErrors = { ...prev };
                delete newErrors[field];
                return newErrors;
            });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrors({});

        try {
            // Convert 'none' to null for optional fields
            const submitData = {
                ...formData,
                company_id: formData.company_id === 'none' ? null : formData.company_id,
                contact_id: formData.contact_id === 'none' ? null : formData.contact_id,
                project_id: formData.project_id === 'none' ? null : formData.project_id,
                campaign_id: formData.campaign_id === 'none' ? null : formData.campaign_id,
                lead_id: formData.lead_id === 'none' ? null : formData.lead_id,
                assigned_to: formData.assigned_to === 'none' ? null : formData.assigned_to,
                value: formData.value ? parseFloat(formData.value) : null,
                probability: parseInt(formData.probability),
                _method: 'PUT',
            };

            const response = await axios.post(`/admin/deals/${deal.id}`, submitData);
            handleApiResponse(response);

            // Redirect to deals index
            navigate('/admin/deals');
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
        <AppLayout breadcrumbs={breadcrumbs}>

            <div className="max-w-4xl mx-auto space-y-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        Edit Deal
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                        Update deal information
                    </p>
                </div>

                <form onSubmit={handleSubmit}>
                    <Card>
                        <CardHeader>
                            <CardTitle>Deal Information</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Basic Info */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">
                                        Deal Name <span className="text-red-500">*</span>
                                    </Label>
                                    <Input
                                        id="name"
                                        value={formData.name}
                                        onChange={(e) => handleChange('name', e.target.value)}
                                        placeholder="e.g., Website Redesign Project"
                                    />
                                    {errors.name && (
                                        <span className="text-sm text-red-500">
                                            {errors.name[0]}
                                        </span>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="stage">Pipeline Stage</Label>
                                    <Select
                                        value={formData.stage}
                                        onValueChange={(value) => handleChange('stage', value)}
                                    >
                                        <SelectTrigger id="stage">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="lead">Lead</SelectItem>
                                            <SelectItem value="qualified">Qualified</SelectItem>
                                            <SelectItem value="proposal">Proposal</SelectItem>
                                            <SelectItem value="negotiation">Negotiation</SelectItem>
                                            <SelectItem value="won">Won</SelectItem>
                                            <SelectItem value="lost">Lost</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Description */}
                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    value={formData.description}
                                    onChange={(e) => handleChange('description', e.target.value)}
                                    placeholder="Describe the opportunity..."
                                    rows={3}
                                />
                            </div>

                            {/* Financial Info */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="value">Deal Value</Label>
                                    <Input
                                        id="value"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={formData.value}
                                        onChange={(e) => handleChange('value', e.target.value)}
                                        placeholder="0.00"
                                    />
                                    {errors.value && (
                                        <span className="text-sm text-red-500">
                                            {errors.value[0]}
                                        </span>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="currency">Currency</Label>
                                    <Select
                                        value={formData.currency}
                                        onValueChange={(value) => handleChange('currency', value)}
                                    >
                                        <SelectTrigger id="currency">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="USD">USD ($)</SelectItem>
                                            <SelectItem value="EUR">EUR (€)</SelectItem>
                                            <SelectItem value="GBP">GBP (£)</SelectItem>
                                            <SelectItem value="INR">INR (₹)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="probability">
                                        Probability (%) <span className="text-red-500">*</span>
                                    </Label>
                                    <Input
                                        id="probability"
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={formData.probability}
                                        onChange={(e) => handleChange('probability', e.target.value)}
                                    />
                                    {errors.probability && (
                                        <span className="text-sm text-red-500">
                                            {errors.probability[0]}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Dates */}
                            <div className="space-y-2">
                                <Label htmlFor="expected_close_date">Expected Close Date</Label>
                                <Input
                                    id="expected_close_date"
                                    type="date"
                                    value={formData.expected_close_date}
                                    onChange={(e) =>
                                        handleChange('expected_close_date', e.target.value)
                                    }
                                />
                            </div>

                            {/* Relationships */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="company_id">Company</Label>
                                    <Select
                                        value={formData.company_id}
                                        onValueChange={(value) => handleChange('company_id', value)}
                                    >
                                        <SelectTrigger id="company_id">
                                            <SelectValue placeholder="Select company" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">-- None --</SelectItem>
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

                                <div className="space-y-2">
                                    <Label htmlFor="contact_id">Contact</Label>
                                    <Select
                                        value={formData.contact_id}
                                        onValueChange={(value) => handleChange('contact_id', value)}
                                    >
                                        <SelectTrigger id="contact_id">
                                            <SelectValue placeholder="Select contact" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">-- None --</SelectItem>
                                            {contacts.map((contact) => (
                                                <SelectItem
                                                    key={contact.id}
                                                    value={contact.id.toString()}
                                                >
                                                    {contact.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="project_id">Project</Label>
                                    <Select
                                        value={formData.project_id}
                                        onValueChange={(value) => handleChange('project_id', value)}
                                    >
                                        <SelectTrigger id="project_id">
                                            <SelectValue placeholder="Select project" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">-- None --</SelectItem>
                                            {projects.map((project) => (
                                                <SelectItem
                                                    key={project.id}
                                                    value={project.id.toString()}
                                                >
                                                    {project.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="campaign_id">Campaign</Label>
                                    <Select
                                        value={formData.campaign_id}
                                        onValueChange={(value) => handleChange('campaign_id', value)}
                                    >
                                        <SelectTrigger id="campaign_id">
                                            <SelectValue placeholder="Select campaign" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">-- None --</SelectItem>
                                            {campaigns.map((campaign) => (
                                                <SelectItem
                                                    key={campaign.id}
                                                    value={campaign.id.toString()}
                                                >
                                                    {campaign.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="lead_id">Lead</Label>
                                    <Select
                                        value={formData.lead_id}
                                        onValueChange={(value) => handleChange('lead_id', value)}
                                    >
                                        <SelectTrigger id="lead_id">
                                            <SelectValue placeholder="Select lead" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">-- None --</SelectItem>
                                            {leads.map((lead) => (
                                                <SelectItem
                                                    key={lead.id}
                                                    value={lead.id.toString()}
                                                >
                                                    {lead.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="assigned_to">Assign To</Label>
                                    <Select
                                        value={formData.assigned_to}
                                        onValueChange={(value) => handleChange('assigned_to', value)}
                                    >
                                        <SelectTrigger id="assigned_to">
                                            <SelectValue placeholder="Select user" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">-- Unassigned --</SelectItem>
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
                            </div>

                            {/* Notes */}
                            <div className="space-y-2">
                                <Label htmlFor="notes">Notes</Label>
                                <Textarea
                                    id="notes"
                                    value={formData.notes}
                                    onChange={(e) => handleChange('notes', e.target.value)}
                                    placeholder="Additional notes about this deal..."
                                    rows={4}
                                />
                            </div>

                            {/* Actions */}
                            <div className="flex justify-end gap-3 pt-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => navigate('/admin/deals')}
                                    disabled={loading}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={loading}>
                                    {loading ? 'Updating...' : 'Update Deal'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </form>
            </div>
        </AppLayout>
    );
}