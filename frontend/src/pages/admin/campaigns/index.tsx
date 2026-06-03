import { useNavigate } from 'react-router-dom';
import axios from '@/lib/axios';
import {
    Users,
    TrendingUp,
    Pause,
    FileText,
    CheckCircle,
    Plus,
    Search,
} from 'lucide-react';
import { useState, useEffect } from 'react';

import CampaignTable from '@/components/campaigns/campaign-table';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';

interface Stats {
    total: number;
    active: number;
    paused: number;
    draft: number;
    completed: number;
}

export default function CampaignsIndex() {
    const navigate = useNavigate();
    const [stats, setStats] = useState<Stats>({
        total: 0,
        active: 0,
        paused: 0,
        draft: 0,
        completed: 0,
    });
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);


    // Filters and pagination
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [sortBy, setSortBy] = useState('created_at');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [currentPage, setCurrentPage] = useState(1);
    const [perPage, setPerPage] = useState(15);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);

    const breadcrumbs = [
        { title: 'Campaigns', href: '/admin/campaigns' },
    ];

    // Fetch stats
    const fetchStats = async () => {
        try {
            const response = await axios.get('/admin/campaigns/stats');
            setStats(response.data.data);
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    };

    // Fetch campaigns
    const fetchCampaigns = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/admin/campaigns/list', {
                params: {
                    search,
                    status: statusFilter || undefined,
                    sort_by: sortBy,
                    sort_order: sortOrder,
                    page: currentPage,
                    per_page: perPage,
                },
            });

            setCampaigns(Array.isArray(response.data.data) ? response.data.data : (response.data.data?.data || []));
            setCurrentPage((Array.isArray(response.data.data) ? 1 : response.data.data?.current_page));
            setTotalPages((Array.isArray(response.data.data) ? 1 : response.data.data?.last_page));
            setTotalRecords((Array.isArray(response.data.data) ? response.data.data.length : response.data.data?.total));
        } catch (error) {
            console.error('Error fetching campaigns:', error);
        } finally {
            setLoading(false);
        }
    };

    // Initial load
    useEffect(() => {
        fetchStats();
        fetchCampaigns();
    }, []);

    // Refetch when filters change
    useEffect(() => {
        fetchCampaigns();
    }, [search, statusFilter, sortBy, sortOrder, currentPage, perPage]);

    const handleSort = (column: string) => {
        if (sortBy === column) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(column);
            setSortOrder('asc');
        }
    };

    const handleCreateNew = () => {
        navigate('/admin/campaigns/create');
    };

    const handleSuccess = () => {
        fetchStats();
        fetchCampaigns();
    };

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            


            <div className="flex flex-1 flex-col gap-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            Campaigns
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Manage marketing campaigns and lead capture forms
                        </p>
                    </div>
                    <Button onClick={handleCreateNew}>
                        <Plus className="mr-2 h-4 w-4" />
                        New Campaign
                    </Button>
                </div>

                {/* Stats Cards */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
                    <StatCard
                        title="Total Campaigns"
                        value={stats.total}
                        icon={Users}
                        description="All campaigns in the system"
                        iconClassName="text-blue-500"
                    />
                    <StatCard
                        title="Active"
                        value={stats.active}
                        icon={TrendingUp}
                        description="Currently running"
                        iconClassName="text-green-500"
                    />
                    <StatCard
                        title="Paused"
                        value={stats.paused}
                        icon={Pause}
                        description="Temporarily stopped"
                        iconClassName="text-orange-500"
                    />
                    <StatCard
                        title="Draft"
                        value={stats.draft}
                        icon={FileText}
                        description="In progress"
                        iconClassName="text-gray-500"
                    />
                    <StatCard
                        title="Completed"
                        value={stats.completed}
                        icon={CheckCircle}
                        description="Finished campaigns"
                        iconClassName="text-blue-500"
                    />
                </div>

                {/* Table */}
                <CampaignTable onRefresh={handleSuccess} />
            </div>


        </AppLayout>
    );
}
