// Head removed - use document.title instead
import axios from '@/lib/axios';
import { useAuth } from '@/contexts/AuthContext';
import { Search, Eye, Trash2, FileText, MoreHorizontal, RefreshCw, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, ExternalLink, Send, CheckCircle2, XCircle, Loader2, Settings, Sparkles, ArrowUp, ArrowDown } from 'lucide-react';
import { useState, useEffect } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import { handleApiError, handleApiResponse } from '@/lib/toast';
import { type BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Applications', href: '/admin/job-applications' },
];

interface InterviewLocation {
    address_line1: string;
    address_line2: string;
    place: string;
    city: string;
    state: string;
    pincode: string;
}

interface Career {
    id: number;
    title: string;
    job_type: string;
}

interface Application {
    id: number;
    tracking_number: string;
    career_id: number;
    career?: Career;
    name: string;
    email: string;
    phone: string;
    resume_url: string | null;
    cover_letter: string | null;
    linkedin_url: string | null;
    portfolio_url: string | null;
    experience_years: number | null;
    current_company: string | null;
    current_position: string | null;
    expected_salary: string | null;
    dob: string | null;
    notice_period: string | null;
    status: string;
    notes: string | null;
    interview_date: string | null;
    interview_center_id?: string | null;
    interview_location: InterviewLocation | null;
    applied_position: string | null;
    ats_score: number | null;
    ats_feedback: string | null;
    parsed_skills: string | null;
    source: string | null;
    created_at: string;
    updated_at: string;
}

interface PaginationData {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number;
    to: number;
}

export default function JobApplicationsIndex() {
    const [applications, setApplications] = useState<Application[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [experienceFilter, setExperienceFilter] = useState('all');
    const [careerFilter, setCareerFilter] = useState('all');
    const [sortBy, setSortBy] = useState('created_at');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [perPage, setPerPage] = useState(15);
    const [currentPage, setCurrentPage] = useState(1);
    const [pagination, setPagination] = useState<PaginationData | null>(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [updatingStatus, setUpdatingStatus] = useState<number | null>(null);
    const [resumeUrl, setResumeUrl] = useState<string | null>(null);
    const [resumeName, setResumeName] = useState<string>('');

    // Email form state
    const [emailTemplate, setEmailTemplate] = useState('custom');
    const [emailSubject, setEmailSubject] = useState('');
    const [emailBody, setEmailBody] = useState('');
    const [sendingEmail, setSendingEmail] = useState(false);
    const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
    const [emailErrorMsg, setEmailErrorMsg] = useState('');
    const [showEmailPreview, setShowEmailPreview] = useState(false);

    // Config state
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [savingConfig, setSavingConfig] = useState(false);
    const [configData, setConfigData] = useState({
        smtp_host: '',
        smtp_port: '587',
        smtp_user: '',
        smtp_pass: '',
        smtp_from: '',
        ai_api_key: ''
    });

    const { settings } = useAuth();
    const appName = settings?.app_name || "Raintech HRM";
    const appLogo = settings?.app_logo 
        ? (settings.app_logo.startsWith('http') || settings.app_logo.startsWith('data:') ? settings.app_logo : `/storage/${settings.app_logo.replace(/^\/+/, '')}`) 
        : "/images/logo.webp";



    const openResumeModal = (application: Application) => {
        const url = application.resume_url
            ? application.resume_url.startsWith('http://') || application.resume_url.startsWith('https://')
                ? application.resume_url
                : `/storage/${application.resume_url.replace(/^\/+/, '')}`
            : null;
        setResumeUrl(url);
        setResumeName(application.name);
    };

    const fetchApplications = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/admin/job-applications/list', {
                params: {
                    search,
                    status: statusFilter !== 'all' ? statusFilter : undefined,
                    experience: experienceFilter !== 'all' ? experienceFilter : undefined,
                    career_id: careerFilter !== 'all' ? careerFilter : undefined,
                    sort_by: sortBy,
                    sort_order: sortOrder,
                    per_page: perPage,
                    page: currentPage,
                },
            });
            setApplications(Array.isArray(response.data.data) ? response.data.data : (response.data.data?.data || []));
            setPagination({
                current_page: (Array.isArray(response.data.data) ? 1 : response.data.data?.current_page),
                last_page: (Array.isArray(response.data.data) ? 1 : response.data.data?.last_page),
                per_page: response.data.data.per_page,
                total: (Array.isArray(response.data.data) ? response.data.data.length : response.data.data?.total),
                from: (Array.isArray(response.data.data) ? 1 : response.data.data?.from),
                to: (Array.isArray(response.data.data) ? response.data.data.length : response.data.data?.to),
            });
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchApplications();
    }, [search, statusFilter, experienceFilter, careerFilter, sortBy, sortOrder, perPage, currentPage]);

    const handleSort = (column: string) => {
        if (sortBy === column) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(column);
            setSortOrder('asc');
        }
    };

    const handleDelete = async (id: number) => {
        setDeleting(true);
        try {
            const response = await axios.delete(`/admin/job-applications/${id}`);
            handleApiResponse(response);
            setDeleteId(null);
            fetchApplications();
        } catch (error) {
            handleApiError(error);
        } finally {
            setDeleting(false);
        }
    };

    const openDetailsModal = (application: Application) => {
        setSelectedApplication(application);
        setShowDetailsModal(true);
        // Reset email form
        setEmailTemplate('custom');
        setEmailSubject('');
        setEmailBody('');
        setEmailStatus('idle');
        setEmailErrorMsg('');
    };

    const handleTemplateSelection = (template: string, applicantName: string) => {
        setEmailTemplate(template);
        if (template === 'interview') {
            setEmailSubject(`Interview Invitation - ${appName}`);
            setEmailBody(`Dear ${applicantName},\n\nWe are pleased to invite you for an interview for the position you applied for. \n\nPlease let us know your availability for this week.\n\nBest regards,\nHR Team`);
        } else if (template === 'rejection') {
            setEmailSubject('Update on your application');
            setEmailBody(`Dear ${applicantName},\n\nThank you for applying to ${appName}. After careful consideration, we have decided to move forward with other candidates whose skills better match our current needs.\n\nWe wish you the best in your job search.\n\nBest regards,\nHR Team`);
        } else if (template === 'shortlist') {
            setEmailSubject('Congratulations! You have been shortlisted');
            setEmailBody(`Dear ${applicantName},\n\nWe are excited to inform you that your application has been shortlisted. We will be reaching out soon with the next steps.\n\nBest regards,\nHR Team`);
        } else {
            setEmailSubject('');
            setEmailBody('');
        }
    };

    const handleUpdateStatus = async (applicationId: number, newStatus: string) => {
        setUpdatingStatus(applicationId);
        try {
            const response = await axios.post(
                `/admin/job-applications/${applicationId}/update-status`,
                { status: newStatus }
            );
            handleApiResponse(response);
            fetchApplications();
        } catch (error) {
            handleApiError(error);
        } finally {
            setUpdatingStatus(null);
        }
    };

    const getStatusColor = (status: string) => {
        const colors: Record<string, string> = {
            pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
            reviewing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
            shortlisted: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
            rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
            hired: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
        };
        return colors[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
    };

    const handleSendEmail = async () => {
        if (!selectedApplication || !emailSubject || !emailBody) return;
        setSendingEmail(true);
        setEmailStatus('sending');

        const headerColor = emailTemplate === 'rejection' ? '#dc2626' : emailTemplate === 'shortlist' ? '#16a34a' : '#0f172a';
        const absoluteLogoUrl = appLogo.startsWith('http') || appLogo.startsWith('data:') 
            ? appLogo 
            : `${window.location.origin}${appLogo}`;

        const htmlBody = `
            <div style="max-w: 600px; margin: 0 auto; font-family: sans-serif; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background-color: #ffffff;">
                <div style="background-color: ${headerColor}; padding: 20px; text-align: center;">
                    <h2 style="color: white; margin: 0; font-size: 24px;">${appName}</h2>
                </div>
                <div style="position: relative; padding: 40px 30px; min-height: 200px;">
                    <div style="position: relative; z-index: 10; color: #334155; line-height: 1.7; white-space: pre-wrap;">${emailBody.replace(/\n/g, '<br>')}</div>
                </div>
                <div style="background-color: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
                    <p style="margin: 0;">&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
                    <p style="margin: 5px 0 0 0;">Please do not reply to this automated email.</p>
                </div>
            </div>
        `;

        try {
            const response = await axios.post(`/admin/job-applications/${selectedApplication.id}/send-email`, {
                subject: emailSubject,
                body: emailBody,
                html_body: htmlBody
            });
            handleApiResponse(response);
            setEmailStatus('success');
            setTimeout(() => {
                setShowDetailsModal(false);
                setTimeout(() => {
                    setEmailStatus('idle');
                    setEmailSubject('');
                    setEmailBody('');
                    setEmailTemplate('custom');
                }, 300);
            }, 2500);
        } catch (error: any) {
            handleApiError(error);
            setEmailStatus('error');
            setEmailErrorMsg(error.response?.data?.message || 'Failed to send email');
        } finally {
            setSendingEmail(false);
        }
    };

    const fetchConfig = async () => {
        try {
            const res = await axios.get('/admin/settings/app');
            const data = res.data.data;
            const newConfig = { ...configData };
            data.forEach((item: any) => {
                if (item.key in newConfig) {
                    newConfig[item.key as keyof typeof newConfig] = item.value || '';
                }
            });
            setConfigData(newConfig);
        } catch (error) {
            console.error('Failed to fetch config', error);
        }
    };

    useEffect(() => {
        if (showConfigModal) fetchConfig();
    }, [showConfigModal]);

    const handleSaveConfig = async () => {
        setSavingConfig(true);
        try {
            const res = await axios.put('/admin/settings', configData);
            handleApiResponse(res);
            setShowConfigModal(false);
        } catch (error) {
            handleApiError(error);
        } finally {
            setSavingConfig(false);
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            

            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Job Applications</h1>
                        <p className="text-muted-foreground">Review and manage applications</p>
                    </div>
                    <div>
                        <Button variant="outline" onClick={() => setShowConfigModal(true)}>
                            <Settings className="w-4 h-4 mr-2" />
                            API Configuration
                        </Button>
                    </div>
                </div>

                {/* Table Card */}
                <Card>
                    <CardHeader>
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <CardTitle>Applications</CardTitle>
                            <div className="flex flex-wrap items-center gap-2">
                                {/* Search */}
                                <div className="relative w-full sm:w-64">
                                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        placeholder="Search applications..."
                                        value={search}
                                        onChange={(e) => {
                                            setSearch(e.target.value);
                                            setCurrentPage(1);
                                        }}
                                        className="pl-9"
                                    />
                                </div>

                                {/* Experience Filter */}
                                <Select
                                    value={experienceFilter}
                                    onValueChange={(value) => {
                                        setExperienceFilter(value);
                                        setCurrentPage(1);
                                    }}
                                >
                                    <SelectTrigger className="w-full sm:w-40">
                                        <SelectValue placeholder="Experience" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Experience</SelectItem>
                                        <SelectItem value="0-2">0 - 2 Years</SelectItem>
                                        <SelectItem value="3-5">3 - 5 Years</SelectItem>
                                        <SelectItem value="6+">6+ Years</SelectItem>
                                    </SelectContent>
                                </Select>

                                {/* Status Filter */}
                                <Select
                                    value={statusFilter}
                                    onValueChange={(value) => {
                                        setStatusFilter(value);
                                        setCurrentPage(1);
                                    }}
                                >
                                    <SelectTrigger className="w-full sm:w-40">
                                        <SelectValue placeholder="Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Status</SelectItem>
                                        <SelectItem value="pending">Pending</SelectItem>
                                        <SelectItem value="reviewing">Reviewing</SelectItem>
                                        <SelectItem value="shortlisted">Shortlisted</SelectItem>
                                        <SelectItem value="rejected">Rejected</SelectItem>
                                        <SelectItem value="hired">Hired</SelectItem>
                                    </SelectContent>
                                </Select>
                                
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={fetchApplications}
                                    title="Refresh"
                                >
                                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead
                                            className="hover:bg-muted/50 cursor-pointer select-none"
                                            onClick={() => handleSort('id')}
                                        >
                                            <div className="flex items-center gap-1">
                                                ID
                                                {sortBy === 'id' && (
                                                    <span className="text-xs">
                                                        {sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 inline" /> : <ArrowDown className="w-3 h-3 inline" />}
                                                    </span>
                                                )}
                                            </div>
                                        </TableHead>
                                        <TableHead>Tracking Number</TableHead>
                                        <TableHead
                                            className="hover:bg-muted/50 cursor-pointer select-none"
                                            onClick={() => handleSort('name')}
                                        >
                                            <div className="flex items-center gap-1">
                                                Name
                                                {sortBy === 'name' && (
                                                    <span className="text-xs">
                                                        {sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 inline" /> : <ArrowDown className="w-3 h-3 inline" />}
                                                    </span>
                                                )}
                                            </div>
                                        </TableHead>
                                        <TableHead>Job Position</TableHead>
                                        <TableHead
                                            className="hover:bg-muted/50 cursor-pointer select-none"
                                            onClick={() => handleSort('ats_score')}
                                        >
                                            <div className="flex items-center gap-1">
                                                ATS Score
                                                {sortBy === 'ats_score' && (
                                                    <span className="text-xs">
                                                        {sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 inline" /> : <ArrowDown className="w-3 h-3 inline" />}
                                                    </span>
                                                )}
                                            </div>
                                        </TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Phone</TableHead>
                                        <TableHead>Experience</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead
                                            className="hover:bg-muted/50 cursor-pointer select-none"
                                            onClick={() => handleSort('created_at')}
                                        >
                                            <div className="flex items-center gap-1">
                                                Applied
                                                {sortBy === 'created_at' && (
                                                    <span className="text-xs">
                                                        {sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 inline" /> : <ArrowDown className="w-3 h-3 inline" />}
                                                    </span>
                                                )}
                                            </div>
                                        </TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={12} className="text-center py-8">
                                                Loading...
                                            </TableCell>
                                        </TableRow>
                                    ) : applications.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={12} className="text-center py-8">
                                                No applications found
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        applications.map((application) => (
                                            <TableRow key={application.id}>
                                                <TableCell className="font-medium">{application.id}</TableCell>
                                                <TableCell>
                                                    <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                                                        {application.tracking_number}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="font-medium">{application.name}</TableCell>
                                                <TableCell>
                                                    {application.applied_position || 'N/A'}
                                                </TableCell>
                                                <TableCell>
                                                    {application.ats_score !== null ? (
                                                        <Badge variant={application.ats_score >= 80 ? 'default' : (application.ats_score >= 50 ? 'secondary' : 'destructive')}>
                                                            {application.ats_score}%
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-muted-foreground text-xs">N/A</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>{application.email}</TableCell>
                                                <TableCell>{application.phone}</TableCell>
                                                <TableCell>
                                                    {application.experience_years ? `${application.experience_years} years` : 'N/A'}
                                                </TableCell>
                                                <TableCell>
                                                    <Select
                                                        value={application.status}
                                                        onValueChange={(value) => handleUpdateStatus(application.id, value)}
                                                        disabled={updatingStatus === application.id}
                                                    >
                                                        <SelectTrigger className="w-32">
                                                            <Badge className={getStatusColor(application.status)} variant="secondary">
                                                                {application.status}
                                                            </Badge>
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="pending">
                                                                <Badge className={getStatusColor('pending')} variant="secondary">
                                                                    Pending
                                                                </Badge>
                                                            </SelectItem>
                                                            <SelectItem value="reviewing">
                                                                <Badge className={getStatusColor('reviewing')} variant="secondary">
                                                                    Reviewing
                                                                </Badge>
                                                            </SelectItem>
                                                            <SelectItem value="shortlisted">
                                                                <Badge className={getStatusColor('shortlisted')} variant="secondary">
                                                                    Shortlisted
                                                                </Badge>
                                                            </SelectItem>
                                                            <SelectItem value="rejected">
                                                                <Badge className={getStatusColor('rejected')} variant="secondary">
                                                                    Rejected
                                                                </Badge>
                                                            </SelectItem>
                                                            <SelectItem value="hired">
                                                                <Badge className={getStatusColor('hired')} variant="secondary">
                                                                    Hired
                                                                </Badge>
                                                            </SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </TableCell>
                                                <TableCell>
                                                    {new Date(application.created_at).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                                <span className="sr-only">Open menu</span>
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                            <DropdownMenuItem onClick={() => openDetailsModal(application)}>
                                                                <Eye className="mr-2 h-4 w-4" />
                                                                View Details
                                                            </DropdownMenuItem>
                                                            {application.resume_url && (
                                                                <DropdownMenuItem onClick={() => openResumeModal(application)}>
                                                                    <FileText className="mr-2 h-4 w-4" />
                                                                    View Resume
                                                                </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                onClick={() => setDeleteId(application.id)}
                                                                className="text-destructive"
                                                            >
                                                                <Trash2 className="mr-2 h-4 w-4" />
                                                                Delete
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Pagination */}
                        {pagination && (
                            <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-2">
                                    <p className="text-sm text-muted-foreground">
                                        Showing {pagination.from} to {pagination.to} of {pagination.total} results
                                    </p>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Select
                                        value={perPage.toString()}
                                        onValueChange={(value) => {
                                            setPerPage(Number(value));
                                            setCurrentPage(1);
                                        }}
                                    >
                                        <SelectTrigger className="w-32">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="10">10 per page</SelectItem>
                                            <SelectItem value="25">25 per page</SelectItem>
                                            <SelectItem value="50">50 per page</SelectItem>
                                            <SelectItem value="100">100 per page</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={() => setCurrentPage(1)}
                                            disabled={currentPage === 1}
                                        >
                                            <ChevronsLeft className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                            disabled={currentPage === 1}
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <span className="text-sm px-2">
                                            Page {currentPage} of {pagination.last_page}
                                        </span>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={() => setCurrentPage((p) => Math.min(pagination.last_page, p + 1))}
                                            disabled={currentPage === pagination.last_page}
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={() => setCurrentPage(pagination.last_page)}
                                            disabled={currentPage === pagination.last_page}
                                        >
                                            <ChevronsRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Details Modal */}
            <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Application Details</DialogTitle>
                    </DialogHeader>
                    {selectedApplication && (
                        <div className="space-y-4">
                            {/* AI ATS Section */}
                            {(selectedApplication.ats_score !== null || selectedApplication.ats_feedback) && (
                                <div className="bg-primary/5 p-4 rounded-lg border border-primary/20 space-y-3">
                                    <div className="flex items-center gap-3">
                                        <h3 className="text-lg font-semibold flex items-center gap-2 text-primary">
                                            <Sparkles className="h-5 w-5" />
                                            <span>AI ATS Analysis</span>
                                        </h3>
                                        {selectedApplication.ats_score !== null && (
                                            <Badge variant={selectedApplication.ats_score >= 80 ? 'default' : (selectedApplication.ats_score >= 50 ? 'secondary' : 'destructive')} className="text-sm">
                                                Score: {selectedApplication.ats_score}%
                                            </Badge>
                                        )}
                                    </div>
                                    {selectedApplication.parsed_skills && (
                                        <div className="pt-2">
                                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Parsed Key Skills</label>
                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                {(() => {
                                                    try {
                                                        const skills = JSON.parse(selectedApplication.parsed_skills);
                                                        if (Array.isArray(skills)) {
                                                            return skills.map((s, i) => (
                                                                <Badge key={i} variant="outline" className="bg-background shadow-sm border-primary/20">{s}</Badge>
                                                            ));
                                                        }
                                                        return <span className="text-sm">{selectedApplication.parsed_skills}</span>;
                                                    } catch (e) {
                                                        return <span className="text-sm">{selectedApplication.parsed_skills}</span>;
                                                    }
                                                })()}
                                            </div>
                                        </div>
                                    )}
                                    {selectedApplication.ats_feedback && (
                                        <div className="pt-4 border-t border-primary/10 mt-2">
                                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Detailed AI Insights</label>
                                            <div className="bg-white dark:bg-slate-900 rounded-md p-4 shadow-sm border border-primary/10">
                                                <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed font-medium">
                                                    {selectedApplication.ats_feedback}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}



                            {/* â”€â”€ Direct Email â”€â”€ */}
                            <Separator />
                            <div className="space-y-4 relative min-h-[300px]">
                                <p className="text-sm font-semibold">Send Direct Email</p>

                                {emailStatus !== 'idle' && (
                                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm rounded-md border shadow-sm">
                                        {emailStatus === 'sending' && (
                                            <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
                                                <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
                                                <h3 className="text-lg font-semibold">Sending Email...</h3>
                                                <p className="text-muted-foreground mt-1 text-sm">Please wait while we securely dispatch the email.</p>
                                            </div>
                                        )}
                                        {emailStatus === 'success' && (
                                            <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
                                                <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/30 mb-4">
                                                    <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400" />
                                                </div>
                                                <h3 className="text-xl font-semibold">Email Sent Successfully!</h3>
                                                <p className="text-muted-foreground mt-1 text-sm text-center">The candidate has been notified.</p>
                                            </div>
                                        )}
                                        {emailStatus === 'error' && (
                                            <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300 p-6 text-center">
                                                <div className="rounded-full bg-red-100 p-3 dark:bg-red-900/30 mb-4">
                                                    <XCircle className="h-12 w-12 text-red-600 dark:text-red-400" />
                                                </div>
                                                <h3 className="text-xl font-semibold text-destructive">Failed to Send</h3>
                                                <p className="text-muted-foreground mt-2 max-w-sm text-sm">{emailErrorMsg}</p>
                                                <Button variant="outline" className="mt-6" onClick={() => setEmailStatus('idle')}>
                                                    Try Again
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className={`space-y-4 ${emailStatus !== 'idle' ? 'opacity-0 pointer-events-none' : 'opacity-100'} transition-opacity duration-300`}>
                                    {/* Template Selector */}
                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">Email Template</label>
                                    <Select value={emailTemplate} onValueChange={(v) => handleTemplateSelection(v, selectedApplication.name)}>
                                        <SelectTrigger className="mt-1">
                                            <SelectValue placeholder="Select a template" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="custom">Custom Email</SelectItem>
                                            <SelectItem value="interview">Interview Invitation</SelectItem>
                                            <SelectItem value="shortlist">Shortlisted Notification</SelectItem>
                                            <SelectItem value="rejection">Rejection</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Subject */}
                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">Subject <span className="text-destructive">*</span></label>
                                    <Input
                                        placeholder="Email Subject"
                                        className="mt-1"
                                        value={emailSubject}
                                        onChange={(e) => setEmailSubject(e.target.value)}
                                    />
                                </div>

                                {/* Body & Preview Toggle */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-medium text-muted-foreground">Message <span className="text-destructive">*</span></label>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 px-2 text-xs"
                                            onClick={() => setShowEmailPreview(!showEmailPreview)}
                                        >
                                            {showEmailPreview ? 'Edit Message' : 'Preview Design'}
                                        </Button>
                                    </div>
                                    
                                    {showEmailPreview ? (
                                        <div className="border rounded-md p-6 bg-slate-50 dark:bg-slate-900/50 min-h-[200px]">
                                            <div className="max-w-md mx-auto bg-white dark:bg-slate-950 rounded-lg shadow-sm overflow-hidden border border-slate-200 dark:border-slate-800">
                                                <div className={`${
                                                    emailTemplate === 'rejection' ? 'bg-red-600' :
                                                    emailTemplate === 'shortlist' ? 'bg-green-600' :
                                                    'bg-primary'
                                                } px-6 py-4 text-center`}>
                                                    <h2 className="text-white font-bold text-xl">{appName}</h2>
                                                </div>
                                                <div className="relative p-6 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-sans min-h-[300px]">
                                                    <div className="relative z-10">
                                                        {emailBody || 'Your message will appear here...'}
                                                    </div>
                                                </div>
                                                <div className="bg-slate-100 dark:bg-slate-900 p-4 text-center text-xs text-slate-500">
                                                    <p>&copy; {new Date().getFullYear()} {appName}. All rights reserved.</p>
                                                    <p className="mt-1">Please do not reply to this automated email.</p>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <Textarea
                                            className="mt-1"
                                            rows={8}
                                            placeholder="Type your message here..."
                                            value={emailBody}
                                            onChange={(e) => setEmailBody(e.target.value)}
                                        />
                                    )}
                                </div>

                                <Button
                                    className="w-full"
                                    disabled={!emailSubject || !emailBody || sendingEmail}
                                    onClick={handleSendEmail}
                                >
                                    <Send className="mr-2 h-4 w-4" />
                                    {sendingEmail ? 'Sendingâ€¦' : 'Send Email'}
                                </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Resume Viewer Modal */}
            <Dialog open={resumeUrl !== null} onOpenChange={() => setResumeUrl(null)}>
                <DialogContent className="!w-[95vw] !max-w-[95vw] sm:!max-w-[95vw] h-[90vh] flex flex-col p-0">
                    <DialogHeader className="px-6 pt-6 pb-3 flex-shrink-0">
                        <div className="flex items-center justify-between">
                            <DialogTitle className="text-base">
                                Resume - {resumeName}
                            </DialogTitle>
                        </div>
                    </DialogHeader>
                    <div className="flex-1 overflow-hidden px-6 pb-6">
                        {resumeUrl && (() => {
                            const isPdf = resumeUrl.toLowerCase().includes('.pdf') || !resumeUrl.match(/\.(doc|docx)$/i);
                            return isPdf ? (
                                <iframe
                                    src={resumeUrl}
                                    className="w-full h-full rounded border"
                                    title="Resume"
                                />
                            ) : (
                                <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                                    <FileText className="h-16 w-16 text-muted-foreground/40" />
                                    <div>
                                        <p className="font-medium">Word Document</p>
                                        <p className="text-sm text-muted-foreground mt-1">This file type cannot be previewed in the browser.</p>
                                    </div>
                                    <a
                                        href={resumeUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        download
                                        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                        Download to view
                                    </a>
                                </div>
                            );
                        })()}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the application.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deleteId && handleDelete(deleteId)}
                            disabled={deleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleting ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* API Config Dialog */}
            <Dialog open={showConfigModal} onOpenChange={setShowConfigModal}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>API Configuration</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">SMTP Host</label>
                                <Input 
                                    value={configData.smtp_host} 
                                    onChange={(e) => setConfigData({...configData, smtp_host: e.target.value})} 
                                    placeholder="smtp.example.com" 
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">SMTP Port</label>
                                <Input 
                                    value={configData.smtp_port} 
                                    onChange={(e) => setConfigData({...configData, smtp_port: e.target.value})} 
                                    placeholder="587" 
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">SMTP User</label>
                            <Input 
                                value={configData.smtp_user} 
                                onChange={(e) => setConfigData({...configData, smtp_user: e.target.value})} 
                                placeholder="user@example.com" 
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">SMTP Password</label>
                            <Input 
                                type="password"
                                value={configData.smtp_pass} 
                                onChange={(e) => setConfigData({...configData, smtp_pass: e.target.value})} 
                                placeholder="••••••••" 
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">SMTP From Address</label>
                            <Input 
                                value={configData.smtp_from} 
                                onChange={(e) => setConfigData({...configData, smtp_from: e.target.value})} 
                                placeholder="no-reply@example.com" 
                            />
                        </div>
                        <Separator />
                        <div className="space-y-2">
                            <label className="text-sm font-medium">AI API Key</label>
                            <Input 
                                type="password"
                                value={configData.ai_api_key} 
                                onChange={(e) => setConfigData({...configData, ai_api_key: e.target.value})} 
                                placeholder="Enter API Key" 
                            />
                            <p className="text-xs text-muted-foreground">Used for AI ATS parsing and email generation.</p>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setShowConfigModal(false)}>Cancel</Button>
                        <Button onClick={handleSaveConfig} disabled={savingConfig}>
                            {savingConfig ? 'Saving...' : 'Save Configuration'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
