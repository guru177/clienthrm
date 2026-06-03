// Head removed - use document.title instead
import {
    Mail,
    Send,
    Inbox,
    Star,
    Trash2,
    Archive,
    Plus,
    RefreshCw,
    X,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import axios from '@/lib/axios';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConnectEmailDialog } from '@/components/email/connect-email-dialog';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { handleApiError, handleApiResponse } from '@/lib/toast';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Communication',
        href: '/admin/email',
    },
];

export default function EmailInbox() {
    const [selectedFolder, setSelectedFolder] = useState('inbox');
    const [showConnectDialog, setShowConnectDialog] = useState(false);
    const [emailAccounts, setEmailAccounts] = useState<any[]>([]);
    const [emails, setEmails] = useState<any[]>([]);
    const [selectedEmail, setSelectedEmail] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [loadingEmails, setLoadingEmails] = useState(false);

    const fetchEmailAccounts = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/admin/email/accounts');
            setEmailAccounts(response.data.data || []);
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const fetchEmails = async (folder = 'inbox') => {
        setLoadingEmails(true);
        try {
            const response = await axios.get('/admin/email/messages', {
                params: { folder },
            });
            setEmails(Array.isArray(response.data.data) ? response.data.data : (response.data.data?.data || []));
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoadingEmails(false);
        }
    };

    const syncEmails = async () => {
        if (emailAccounts.length === 0) return;

        setSyncing(true);
        try {
            const defaultAccount =
                emailAccounts.find((acc) => acc.is_default) ||
                emailAccounts[0];
            const response = await axios.post(
                `/admin/email/accounts/${defaultAccount.id}/sync`
            );
            handleApiResponse(response);
            fetchEmails(selectedFolder);
        } catch (error) {
            handleApiError(error);
        } finally {
            setSyncing(false);
        }
    };

    const handleEmailClick = async (email: any) => {
        try {
            const response = await axios.get(`/admin/email/messages/${email.id}`);
            setSelectedEmail(response.data.data);

            // Update local state to mark as read
            setEmails(emails.map(e =>
                e.id === email.id ? { ...e, is_read: true } : e
            ));
        } catch (error) {
            handleApiError(error);
        }
    };

    useEffect(() => {
        fetchEmailAccounts();
    }, []);

    useEffect(() => {
        if (emailAccounts.length > 0) {
            fetchEmails(selectedFolder);
        }
    }, [emailAccounts, selectedFolder]);

    const folders = [
        { id: 'inbox', label: 'Inbox', icon: Inbox, count: 12 },
        { id: 'sent', label: 'Sent', icon: Send, count: 45 },
        { id: 'starred', label: 'Starred', icon: Star, count: 3 },
        { id: 'drafts', label: 'Drafts', icon: Mail, count: 2 },
        { id: 'archive', label: 'Archive', icon: Archive, count: 156 },
        { id: 'trash', label: 'Trash', icon: Trash2, count: 8 },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            

            <div className="flex h-full flex-col gap-6 p-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">
                            Email Communication
                        </h1>
                        <p className="text-muted-foreground">
                            Manage your email conversations
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            onClick={syncEmails}
                            disabled={
                                syncing ||
                                loading ||
                                emailAccounts.length === 0
                            }
                        >
                            <RefreshCw
                                className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`}
                            />
                            Sync Emails
                        </Button>
                        <Button>
                            <Mail className="mr-2 h-4 w-4" />
                            Compose
                        </Button>
                    </div>
                </div>

                {/* Email Interface */}
                <div className="grid flex-1 gap-4 md:grid-cols-[240px_1fr]">
                    {/* Sidebar */}
                    <Card className="p-4">
                        <div className="space-y-1">
                            {folders.map((folder) => {
                                const Icon = folder.icon;
                                return (
                                    <button
                                        key={folder.id}
                                        onClick={() =>
                                            setSelectedFolder(folder.id)
                                        }
                                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${selectedFolder === folder.id
                                            ? 'bg-primary text-primary-foreground'
                                            : 'hover:bg-muted'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <Icon className="h-4 w-4" />
                                            <span>{folder.label}</span>
                                        </div>
                                        {folder.count > 0 && (
                                            <span
                                                className={`text-xs ${selectedFolder === folder.id
                                                    ? 'text-primary-foreground/80'
                                                    : 'text-muted-foreground'
                                                    }`}
                                            >
                                                {folder.count}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </Card>

                    {/* Email List */}
                    <Card className="p-6">
                        {loading ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-center text-muted-foreground">
                                    Loading...
                                </div>
                            </div>
                        ) : emailAccounts.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                <div className="text-center">
                                    <Mail className="mx-auto h-12 w-12 mb-4 opacity-50" />
                                    <h3 className="text-lg font-semibold mb-2">
                                        Email module is ready!
                                    </h3>
                                    <p className="text-sm mb-4">
                                        Connect your email account to start
                                        managing conversations
                                    </p>
                                    <Button
                                        onClick={() =>
                                            setShowConnectDialog(true)
                                        }
                                    >
                                        <Plus className="mr-2 h-4 w-4" />
                                        Connect Email Account
                                    </Button>
                                </div>
                            </div>
                        ) : loadingEmails ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-center text-muted-foreground">
                                    Loading emails...
                                </div>
                            </div>
                        ) : emails.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                <div className="text-center">
                                    <Inbox className="mx-auto h-12 w-12 mb-4 opacity-50" />
                                    <h3 className="text-lg font-semibold mb-2">
                                        No emails yet
                                    </h3>
                                    <p className="text-sm mb-4">
                                        Click "Sync Emails" to fetch your
                                        messages
                                    </p>
                                    <Button
                                        onClick={syncEmails}
                                        disabled={syncing}
                                    >
                                        <RefreshCw
                                            className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`}
                                        />
                                        Sync Emails
                                    </Button>
                                </div>
                            </div>
                        ) : selectedEmail ? (
                            <div className="h-full flex flex-col">
                                <div className="flex items-center justify-between border-b pb-4 mb-4">
                                    <h2 className="text-lg font-semibold truncate">
                                        {selectedEmail.subject}
                                    </h2>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setSelectedEmail(null)}
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                                <div className="space-y-3 mb-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium">From:</span>
                                        <span className="text-sm">{selectedEmail.from_name || selectedEmail.from_email}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium">To:</span>
                                        <span className="text-sm">{selectedEmail.to}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium">Date:</span>
                                        <span className="text-sm">
                                            {new Date(selectedEmail.sent_at).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto border-t pt-4">
                                    <div className="prose prose-sm max-w-none dark:prose-invert">
                                        {selectedEmail.body_html ? (
                                            <div dangerouslySetInnerHTML={{ __html: selectedEmail.body_html }} />
                                        ) : (
                                            <pre className="whitespace-pre-wrap font-sans">
                                                {selectedEmail.body_text}
                                            </pre>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {emails.map((email) => (
                                    <div
                                        key={email.id}
                                        onClick={() => handleEmailClick(email)}
                                        className={`flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer ${email.is_read
                                            ? 'bg-background'
                                            : 'bg-muted/30'
                                            }`}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span
                                                    className={`font-medium truncate ${!email.is_read
                                                        ? 'font-semibold'
                                                        : ''
                                                        }`}
                                                >
                                                    {email.from_name ||
                                                        email.from_email}
                                                </span>
                                                {email.is_starred && (
                                                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                                )}
                                            </div>
                                            <div
                                                className={`text-sm mb-1 truncate ${!email.is_read
                                                    ? 'font-semibold'
                                                    : ''
                                                    }`}
                                            >
                                                {email.subject}
                                            </div>
                                            <div className="text-sm text-muted-foreground truncate">
                                                {email.body_text?.substring(
                                                    0,
                                                    100
                                                ) || '(No content)'}
                                                ...
                                            </div>
                                        </div>
                                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                                            {new Date(
                                                email.received_at
                                            ).toLocaleDateString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>
            </div>

            <ConnectEmailDialog
                open={showConnectDialog}
                onClose={() => setShowConnectDialog(false)}
                onSuccess={() => {
                    fetchEmailAccounts();
                }}
            />
        </AppLayout>
    );
}
