import { useNavigate } from 'react-router-dom';
import AppLayout from '@/layouts/app-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, IndianRupee, TrendingUp, Users, Building2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import axios from '@/lib/axios';
import { handleApiError, handleApiResponse } from '@/lib/toast';

interface Deal {
    id: number;
    name: string;
    value: number;
    currency: string;
    probability: number;
    weighted_value: number;
    stage: string;
    stage_order: number;
    expected_close_date: string | null;
    company?: {
        id: number;
        name: string;
    };
    contact?: {
        id: number;
        name: string;
    };
    assigned_to_user?: {
        id: number;
        name: string;
    };
}

interface DealsByStage {
    [stage: string]: Deal[];
}

const STAGES = [
    { key: 'lead', label: 'Lead', color: 'bg-slate-100 dark:bg-slate-800' },
    { key: 'qualified', label: 'Qualified', color: 'bg-blue-100 dark:bg-blue-900' },
    { key: 'proposal', label: 'Proposal', color: 'bg-purple-100 dark:bg-purple-900' },
    { key: 'negotiation', label: 'Negotiation', color: 'bg-orange-100 dark:bg-orange-900' },
    { key: 'won', label: 'Won', color: 'bg-green-100 dark:bg-green-900' },
    { key: 'lost', label: 'Lost', color: 'bg-red-100 dark:bg-red-900' },
];

export default function DealsIndex() {
    const navigate = useNavigate();
    const [dealsByStage, setDealsByStage] = useState<DealsByStage>({});
    const [pipelineValue, setPipelineValue] = useState({ total: 0, weighted: 0 });
    const [loading, setLoading] = useState(true);
    const [draggedDeal, setDraggedDeal] = useState<Deal | null>(null);

    const breadcrumbs = [{ title: 'Deals', href: '/admin/deals' }];

    useEffect(() => {
        fetchDeals();
    }, []);

    const fetchDeals = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/admin/deals/pipeline');
            if (response.data.success) {
                setDealsByStage(response.data.data.dealsByStage || {});
                setPipelineValue(response.data.data.pipelineValue || { total: 0, weighted: 0 });
            }
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const handleDragStart = (deal: Deal) => {
        setDraggedDeal(deal);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = async (stage: string) => {
        if (!draggedDeal || draggedDeal.stage === stage) {
            setDraggedDeal(null);
            return;
        }

        try {
            await axios.post(`/admin/deals/${draggedDeal.id}/stage`, { stage });
            fetchDeals();
        } catch (error) {
            handleApiError(error);
        }

        setDraggedDeal(null);
    };

    const formatCurrency = (value: number, currency: string = 'INR') => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value);
    };

    const getStageTotal = (deals: Deal[]) => {
        return deals.reduce((sum, deal) => sum + (deal.value || 0), 0);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            

            <div className="space-y-6">
                {/* Header */}
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                            Deals Pipeline
                        </h1>
                        <p className="text-gray-600 dark:text-gray-400 mt-1">
                            Visual sales pipeline with drag-and-drop
                        </p>
                    </div>
                    <Button onClick={() => navigate('/admin/deals/create')}>
                        <Plus className="h-4 w-4 mr-2" />
                        New Deal
                    </Button>
                </div>

                {/* Pipeline Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Total Pipeline Value</CardTitle>
                            <IndianRupee className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {formatCurrency(pipelineValue.total)}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Across all open deals
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Weighted Pipeline</CardTitle>
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {formatCurrency(pipelineValue.weighted)}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Probability-adjusted value
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Total Deals</CardTitle>
                            <Users className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {Object.values(dealsByStage).reduce((sum, deals) => sum + deals.length, 0)}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Active opportunities
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Won Deals</CardTitle>
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                                {dealsByStage.won?.length || 0}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {formatCurrency(getStageTotal(dealsByStage.won || []))} closed
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Kanban Board */}
                <div className="grid grid-cols-1 lg:grid-cols-6 gap-4 overflow-x-auto pb-4">
                    {STAGES.map((stage) => {
                        const deals = dealsByStage[stage.key] || [];
                        const stageTotal = getStageTotal(deals);

                        return (
                            <div
                                key={stage.key}
                                className="flex flex-col min-w-[280px]"
                                onDragOver={handleDragOver}
                                onDrop={() => handleDrop(stage.key)}
                            >
                                {/* Stage Header */}
                                <div className={cn('rounded-t-lg p-4', stage.color)}>
                                    <div className="flex justify-between items-center">
                                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                                            {stage.label}
                                        </h3>
                                        <Badge variant="secondary" className="bg-white/50 dark:bg-black/30">
                                            {deals.length}
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                                        {formatCurrency(stageTotal)}
                                    </p>
                                </div>

                                {/* Deals List */}
                                <div className="flex-1 bg-gray-50 dark:bg-gray-900 border border-t-0 border-gray-200 dark:border-gray-700 rounded-b-lg p-2 space-y-2 min-h-[200px]">
                                    {deals.map((deal) => (
                                        <Card
                                            key={deal.id}
                                            draggable
                                            onDragStart={() => handleDragStart(deal)}
                                            className={cn(
                                                'cursor-move hover:shadow-lg transition-shadow',
                                                draggedDeal?.id === deal.id && 'opacity-50'
                                            )}
                                            onClick={() => navigate(`/admin/deals/${deal.id}`)}
                                        >
                                            <CardContent className="p-3 space-y-2">
                                                <div>
                                                    <h4 className="font-medium text-sm text-gray-900 dark:text-white line-clamp-2">
                                                        {deal.name}
                                                    </h4>
                                                    <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                                                        {formatCurrency(deal.value, deal.currency)}
                                                    </p>
                                                </div>

                                                {deal.company && (
                                                    <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                                                        <Building2 className="h-3 w-3" />
                                                        <span className="truncate">{deal.company.name}</span>
                                                    </div>
                                                )}

                                                <div className="flex items-center justify-between text-xs">
                                                    <Badge variant="outline" className="text-xs">
                                                        {deal.probability}% probable
                                                    </Badge>
                                                    {deal.expected_close_date && (
                                                        <span className="text-gray-500 dark:text-gray-400">
                                                            {new Date(deal.expected_close_date).toLocaleDateString()}
                                                        </span>
                                                    )}
                                                </div>

                                                {deal.assigned_to_user && (
                                                    <div className="text-xs text-gray-600 dark:text-gray-400 truncate">
                                                        👤 {deal.assigned_to_user.name}
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    ))}

                                    {deals.length === 0 && (
                                        <div className="text-center text-gray-400 dark:text-gray-600 py-8 text-sm">
                                            No deals
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </AppLayout>
    );
}
