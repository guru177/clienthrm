import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/layouts/app-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
    Building2,
    User,
    Calendar,
    IndianRupee,
    TrendingUp,
    FileText,
    Briefcase,
    Mail,
    Flag,
    Edit,
    Trash2,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { handleApiResponse, handleApiError } from '@/lib/toast';
import axios from '@/lib/axios';

interface Deal {
    id: number;
    name: string;
    description: string | null;
    stage: string;
    value: number | null;
    currency: string;
    probability: number;
    weighted_value: number;
    expected_close_date: string | null;
    actual_close_date: string | null;
    loss_reason: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
    company?: {
        id: number;
        name: string;
    };
    contact?: {
        id: number;
        name: string;
        email: string;
    };
    project?: {
        id: number;
        name: string;
    };
    campaign?: {
        id: number;
        name: string;
    };
    lead?: {
        id: number;
        name: string;
    };
    assigned_to_user?: {
        id: number;
        name: string;
    };
    created_by_user?: {
        id: number;
        name: string;
    };
}

const STAGE_BADGES: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    lead: { label: 'Lead', variant: 'secondary' },
    qualified: { label: 'Qualified', variant: 'default' },
    proposal: { label: 'Proposal', variant: 'default' },
    negotiation: { label: 'Negotiation', variant: 'default' },
    won: { label: 'Won', variant: 'default' },
    lost: { label: 'Lost', variant: 'destructive' },
};

export default function ViewDeal() {
    const navigate = useNavigate();
    const { id } = useParams();
    const [deal, setDeal] = useState<Deal | null>(null);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState(false);

    const breadcrumbs = [
        { label: 'Deals', href: '/admin/deals' },
        { label: deal?.name || 'Deal', href: `/admin/deals/${id}` },
    ];

    useEffect(() => {
        fetchDeal();
    }, [id]);

    const fetchDeal = async () => {
        setLoading(true);
        try {
            const response = await axios.get(`/admin/deals/${id}`);
            setDeal(response.data.data || response.data);
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    if (loading || !deal) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                <div className="flex min-h-[60vh] items-center justify-center">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
            </AppLayout>
        );
    }

    const formatCurrency = (value: number | null, currency: string = 'INR') => {
        if (!value) return '-';
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value);
    };

    const formatDate = (date: string | null) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this deal? This action cannot be undone.')) {
            return;
        }

        setDeleting(true);
        try {
            const response = await axios.delete(`/admin/deals/${deal.id}`);
            handleApiResponse(response);
            navigate('/admin/deals');
        } catch (error) {
            handleApiError(error);
            setDeleting(false);
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            

            <div className="max-w-5xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                                {deal.name}
                            </h1>
                            <Badge {...STAGE_BADGES[deal.stage]}>
                                {STAGE_BADGES[deal.stage].label}
                            </Badge>
                        </div>
                        <p className="text-gray-600 dark:text-gray-400 mt-1">
                            Deal ID: #{deal.id}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            onClick={() => navigate(`/admin/deals/${deal.id}/edit`)}
                        >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={deleting}
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {deleting ? 'Deleting...' : 'Delete'}
                        </Button>
                    </div>
                </div>

                {/* Overview Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Deal Value</CardTitle>
                            <IndianRupee className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {formatCurrency(deal.value, deal.currency)}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {deal.currency} currency
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Probability</CardTitle>
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{deal.probability}%</div>
                            <p className="text-xs text-muted-foreground">
                                Weighted: {formatCurrency(deal.weighted_value, deal.currency)}
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Expected Close</CardTitle>
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {deal.expected_close_date
                                    ? new Date(deal.expected_close_date).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                    })
                                    : '-'}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {deal.expected_close_date
                                    ? new Date(deal.expected_close_date).getFullYear()
                                    : 'Not set'}
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Content */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column - Details */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Description */}
                        {deal.description && (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <FileText className="h-5 w-5" />
                                        Description
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                        {deal.description}
                                    </p>
                                </CardContent>
                            </Card>
                        )}

                        {/* Notes */}
                        {deal.notes && (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <FileText className="h-5 w-5" />
                                        Notes
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                        {deal.notes}
                                    </p>
                                </CardContent>
                            </Card>
                        )}

                        {/* Loss Reason */}
                        {deal.stage === 'lost' && deal.loss_reason && (
                            <Card className="border-red-200 dark:border-red-800">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                                        <Flag className="h-5 w-5" />
                                        Loss Reason
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-gray-700 dark:text-gray-300">
                                        {deal.loss_reason}
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* Right Column - Metadata */}
                    <div className="space-y-6">
                        {/* Relationships */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Relationships</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {deal.company && (
                                    <div className="flex items-start gap-3">
                                        <Building2 className="h-5 w-5 text-gray-400 mt-0.5" />
                                        <div className="flex-1">
                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                Company
                                            </p>
                                            <p className="font-medium text-gray-900 dark:text-white">
                                                {deal.company.name}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {deal.contact && (
                                    <div className="flex items-start gap-3">
                                        <User className="h-5 w-5 text-gray-400 mt-0.5" />
                                        <div className="flex-1">
                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                Contact
                                            </p>
                                            <p className="font-medium text-gray-900 dark:text-white">
                                                {deal.contact.name}
                                            </p>
                                            {deal.contact.email && (
                                                <div className="flex items-center gap-1 mt-1">
                                                    <Mail className="h-3 w-3 text-gray-400" />
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                                        {deal.contact.email}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {deal.project && (
                                    <div className="flex items-start gap-3">
                                        <Briefcase className="h-5 w-5 text-gray-400 mt-0.5" />
                                        <div className="flex-1">
                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                Project
                                            </p>
                                            <p className="font-medium text-gray-900 dark:text-white">
                                                {deal.project.name}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {deal.campaign && (
                                    <div className="flex items-start gap-3">
                                        <Flag className="h-5 w-5 text-gray-400 mt-0.5" />
                                        <div className="flex-1">
                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                Campaign
                                            </p>
                                            <p className="font-medium text-gray-900 dark:text-white">
                                                {deal.campaign.name}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {deal.lead && (
                                    <div className="flex items-start gap-3">
                                        <User className="h-5 w-5 text-gray-400 mt-0.5" />
                                        <div className="flex-1">
                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                Lead
                                            </p>
                                            <p className="font-medium text-gray-900 dark:text-white">
                                                {deal.lead.name}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {!deal.company &&
                                    !deal.contact &&
                                    !deal.project &&
                                    !deal.campaign &&
                                    !deal.lead && (
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            No relationships
                                        </p>
                                    )}
                            </CardContent>
                        </Card>

                        {/* Assignment */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Assignment</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {deal.assigned_to_user ? (
                                    <div className="flex items-start gap-3">
                                        <User className="h-5 w-5 text-gray-400 mt-0.5" />
                                        <div className="flex-1">
                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                Assigned to
                                            </p>
                                            <p className="font-medium text-gray-900 dark:text-white">
                                                {deal.assigned_to_user.name}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        Unassigned
                                    </p>
                                )}

                                <Separator />

                                <div className="flex items-start gap-3">
                                    <User className="h-5 w-5 text-gray-400 mt-0.5" />
                                    <div className="flex-1">
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            Created by
                                        </p>
                                        <p className="font-medium text-gray-900 dark:text-white">
                                            {deal.created_by_user?.name || 'Unknown'}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Dates */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Timeline</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
                                    <div className="flex-1">
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            Created
                                        </p>
                                        <p className="font-medium text-gray-900 dark:text-white">
                                            {formatDate(deal.created_at)}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3">
                                    <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
                                    <div className="flex-1">
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            Last Updated
                                        </p>
                                        <p className="font-medium text-gray-900 dark:text-white">
                                            {formatDate(deal.updated_at)}
                                        </p>
                                    </div>
                                </div>

                                {deal.actual_close_date && (
                                    <div className="flex items-start gap-3">
                                        <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
                                        <div className="flex-1">
                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                Closed
                                            </p>
                                            <p className="font-medium text-gray-900 dark:text-white">
                                                {formatDate(deal.actual_close_date)}
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
