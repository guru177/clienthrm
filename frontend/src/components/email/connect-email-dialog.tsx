import { useState } from 'react';
import axios from '@/lib/axios';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { handleApiError, handleApiResponse } from '@/lib/toast';

interface ConnectEmailDialogProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function ConnectEmailDialog({
    open,
    onClose,
    onSuccess,
}: ConnectEmailDialogProps) {
    const [loading, setLoading] = useState(false);
    const [testing, setTesting] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        type: 'imap',
        incoming_host: '',
        incoming_port: '993',
        incoming_encryption: 'ssl',
        incoming_username: '',
        incoming_password: '',
        outgoing_host: '',
        outgoing_port: '587',
        outgoing_encryption: 'tls',
        outgoing_username: '',
        outgoing_password: '',
        is_default: false,
        auto_sync: true,
        sync_interval: 5,
    });
    const [errors, setErrors] = useState<Record<string, string>>({});

    const handleChange = (field: string, value: any) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors((prev) => {
                const newErrors = { ...prev };
                delete newErrors[field];
                return newErrors;
            });
        }
    };

    const testConnection = async () => {
        setTesting(true);
        try {
            const response = await axios.post(
                '/admin/email/accounts/test-connection',
                {
                    type: formData.type,
                    host: formData.incoming_host,
                    port: parseInt(formData.incoming_port),
                    encryption: formData.incoming_encryption,
                    username: formData.incoming_username,
                    password: formData.incoming_password,
                }
            );
            handleApiResponse(response);
        } catch (error) {
            handleApiError(error);
        } finally {
            setTesting(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrors({});

        try {
            const response = await axios.post('/admin/email/accounts', {
                ...formData,
                incoming_port: parseInt(formData.incoming_port),
                outgoing_port: parseInt(formData.outgoing_port),
                sync_interval: parseInt(formData.sync_interval.toString()),
            });
            handleApiResponse(response);
            onSuccess();
            onClose();
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
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Connect Email Account</DialogTitle>
                    <DialogDescription>
                        Add your email account to send and receive emails from
                        the CRM
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Basic Info */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold">
                            Account Information
                        </h3>
                        <div className="grid gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="name">Account Name</Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) =>
                                        handleChange('name', e.target.value)
                                    }
                                    placeholder="My Work Email"
                                />
                                {errors.name && (
                                    <p className="text-sm text-destructive">
                                        {errors.name}
                                    </p>
                                )}
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="email">Email Address</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) =>
                                        handleChange('email', e.target.value)
                                    }
                                    placeholder="you@example.com"
                                />
                                {errors.email && (
                                    <p className="text-sm text-destructive">
                                        {errors.email}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Server Settings */}
                    <Tabs defaultValue="incoming" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="incoming">
                                Incoming Server
                            </TabsTrigger>
                            <TabsTrigger value="outgoing">
                                Outgoing Server
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="incoming" className="space-y-4">
                            <div className="grid gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="incoming_host">
                                        Server Address
                                    </Label>
                                    <Input
                                        id="incoming_host"
                                        value={formData.incoming_host}
                                        onChange={(e) =>
                                            handleChange(
                                                'incoming_host',
                                                e.target.value
                                            )
                                        }
                                        placeholder="imap.gmail.com"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="incoming_port">
                                            Port
                                        </Label>
                                        <Input
                                            id="incoming_port"
                                            type="number"
                                            value={formData.incoming_port}
                                            onChange={(e) =>
                                                handleChange(
                                                    'incoming_port',
                                                    e.target.value
                                                )
                                            }
                                        />
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor="incoming_encryption">
                                            Encryption
                                        </Label>
                                        <Select
                                            value={formData.incoming_encryption}
                                            onValueChange={(value) =>
                                                handleChange(
                                                    'incoming_encryption',
                                                    value
                                                )
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">
                                                    None
                                                </SelectItem>
                                                <SelectItem value="ssl">
                                                    SSL
                                                </SelectItem>
                                                <SelectItem value="tls">
                                                    TLS
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="incoming_username">
                                        Username
                                    </Label>
                                    <Input
                                        id="incoming_username"
                                        value={formData.incoming_username}
                                        onChange={(e) =>
                                            handleChange(
                                                'incoming_username',
                                                e.target.value
                                            )
                                        }
                                        placeholder="you@example.com"
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="incoming_password">
                                        Password
                                    </Label>
                                    <Input
                                        id="incoming_password"
                                        type="password"
                                        value={formData.incoming_password}
                                        onChange={(e) =>
                                            handleChange(
                                                'incoming_password',
                                                e.target.value
                                            )
                                        }
                                    />
                                </div>

                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={testConnection}
                                    disabled={testing}
                                >
                                    {testing && (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    )}
                                    Test Connection
                                </Button>
                            </div>
                        </TabsContent>

                        <TabsContent value="outgoing" className="space-y-4">
                            <div className="grid gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="outgoing_host">
                                        Server Address
                                    </Label>
                                    <Input
                                        id="outgoing_host"
                                        value={formData.outgoing_host}
                                        onChange={(e) =>
                                            handleChange(
                                                'outgoing_host',
                                                e.target.value
                                            )
                                        }
                                        placeholder="smtp.gmail.com"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="outgoing_port">
                                            Port
                                        </Label>
                                        <Input
                                            id="outgoing_port"
                                            type="number"
                                            value={formData.outgoing_port}
                                            onChange={(e) =>
                                                handleChange(
                                                    'outgoing_port',
                                                    e.target.value
                                                )
                                            }
                                        />
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor="outgoing_encryption">
                                            Encryption
                                        </Label>
                                        <Select
                                            value={formData.outgoing_encryption}
                                            onValueChange={(value) =>
                                                handleChange(
                                                    'outgoing_encryption',
                                                    value
                                                )
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">
                                                    None
                                                </SelectItem>
                                                <SelectItem value="ssl">
                                                    SSL
                                                </SelectItem>
                                                <SelectItem value="tls">
                                                    TLS
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="outgoing_username">
                                        Username
                                    </Label>
                                    <Input
                                        id="outgoing_username"
                                        value={formData.outgoing_username}
                                        onChange={(e) =>
                                            handleChange(
                                                'outgoing_username',
                                                e.target.value
                                            )
                                        }
                                        placeholder="you@example.com"
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="outgoing_password">
                                        Password
                                    </Label>
                                    <Input
                                        id="outgoing_password"
                                        type="password"
                                        value={formData.outgoing_password}
                                        onChange={(e) =>
                                            handleChange(
                                                'outgoing_password',
                                                e.target.value
                                            )
                                        }
                                    />
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>

                    {/* Form Actions */}
                    <div className="flex justify-end gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Connect Account
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
