import { useNavigate } from 'react-router-dom';
import axios from '@/lib/axios';
import * as Icons from 'lucide-react';
import { LucideIcon, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import { handleApiResponse, handleApiError } from '@/lib/toast';

interface AppSetting {
    id: number;
    key: string;
    value: string | null;
    type: string;
    description: string | null;
}

const breadcrumbs = [
    { label: 'General Settings' },
];

// Popular Lucide icons for selection
const iconOptions = [
    'Building2',
    'LayoutDashboard',
    'Users',
    'UserCircle',
    'Mail',
    'Phone',
    'Globe',
    'Heart',
    'Star',
    'Zap',
    'Shield',
    'Sparkles',
    'Rocket',
    'Target',
    'TrendingUp',
    'Activity',
    'Award',
    'Briefcase',
    'Calendar',
    'CheckCircle',
    'Circle',
    'Database',
    'FileText',
    'Folder',
    'Gift',
    'Home',
    'Layers',
    'Package',
    'Settings',
    'ShoppingCart',
];

export default function AppSettings() {
    const navigate = useNavigate();
    const [settings, setSettings] = useState<AppSetting[]>([]);
    const [loading, setLoading] = useState(false);
    const [pageLoading, setPageLoading] = useState(true);
    const [logoLoading, setLogoLoading] = useState(false);
    const [formData, setFormData] = useState<Record<string, any>>({});
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);

    // Fetch settings from API on mount
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await axios.get('/admin/settings/app');
                const data: AppSetting[] = res.data?.data ?? res.data ?? [];
                setSettings(data);
                setFormData(
                    data.reduce((acc: Record<string, any>, setting: AppSetting) => {
                        acc[setting.key] = setting.value || '';
                        return acc;
                    }, {} as Record<string, any>),
                );
            } catch {
                // If settings can't be loaded, use empty defaults
                setSettings([]);
                setFormData({});
            } finally {
                setPageLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const handleChange = (key: string, value: any) => {
        setFormData((prev) => ({ ...prev, [key]: value }));
    };

    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setLogoFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setLogoPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleLogoSubmit = async () => {
        if (!logoFile) return;

        setLogoLoading(true);

        try {
            // Send the base64 data URI directly as a setting
            const response = await axios.post('/admin/settings/app', {
                app_logo: logoPreview,
            });

            handleApiResponse(response);

            // Reset logo state and refresh
            setLogoFile(null);
            setLogoPreview(null);
            setTimeout(() => window.location.reload(), 500);
        } catch (error) {
            handleApiError(error);
        } finally {
            setLogoLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Only send non-logo settings
            const settingsData = { ...formData };
            delete settingsData.app_logo;

            const response = await axios.post('/admin/settings/app', settingsData);

            handleApiResponse(response);

            // Refresh page to show updated settings
            setTimeout(() => window.location.reload(), 500);
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const renderField = (setting: AppSetting) => {
        const value = formData[setting.key] || '';

        // Determine field type based on setting type or key pattern
        const isColorField = setting.key.includes('color');
        const isIconField = setting.key === 'app_icon';
        const isBooleanField = setting.type === 'boolean';
        const isTextareaField = setting.type === 'textarea' || setting.key === 'company_address';
        const isPasswordField = setting.type === 'password' || setting.key === 'mail_password' || setting.key === 'msg91_auth_key';
        const isSelectField = setting.key === 'mail_mailer' || setting.key === 'mail_encryption';

        if (isTextareaField) {
            return (
                <div key={setting.key} className="space-y-2">
                    <Label htmlFor={setting.key}>{formatLabel(setting.key)}</Label>
                    {setting.description && (
                        <p className="text-sm text-muted-foreground">{setting.description}</p>
                    )}
                    <Textarea
                        id={setting.key}
                        value={value}
                        onChange={(e) => handleChange(setting.key, e.target.value)}
                        rows={3}
                    />
                </div>
            );
        }

        if (isIconField) {
            const SelectedIcon = (Icons as unknown as Record<string, LucideIcon>)[value] || Icons.Building2;
            return (
                <div key={setting.key} className="space-y-2">
                    <Label htmlFor={setting.key}>{formatLabel(setting.key)}</Label>
                    {setting.description && (
                        <p className="text-sm text-muted-foreground">{setting.description}</p>
                    )}
                    <div className="flex gap-4 items-center">
                        <div className="rounded-lg border border-border bg-muted p-3">
                            <SelectedIcon className="h-8 w-8" />
                        </div>
                        <Select value={value} onValueChange={(v) => handleChange(setting.key, v)}>
                            <SelectTrigger className="w-50">
                                <SelectValue placeholder="Select icon" />
                            </SelectTrigger>
                            <SelectContent>
                                {iconOptions.map((icon) => {
                                    const IconComponent = (Icons as unknown as Record<string, LucideIcon>)[icon];
                                    return (
                                        <SelectItem key={icon} value={icon}>
                                            <div className="flex items-center gap-2">
                                                <IconComponent className="h-4 w-4" />
                                                {icon}
                                            </div>
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            );
        }

        if (isColorField) {
            return (
                <div key={setting.key} className="space-y-2">
                    <Label htmlFor={setting.key}>{formatLabel(setting.key)}</Label>
                    {setting.description && (
                        <p className="text-sm text-muted-foreground">{setting.description}</p>
                    )}
                    <div className="flex gap-4 items-center">
                        <Input
                            id={setting.key}
                            type="color"
                            value={value}
                            onChange={(e) => handleChange(setting.key, e.target.value)}
                            className="w-20 h-10 cursor-pointer"
                        />
                        <Input
                            type="text"
                            value={value}
                            onChange={(e) => handleChange(setting.key, e.target.value)}
                            placeholder="#000000"
                            className="flex-1"
                            maxLength={7}
                        />
                    </div>
                </div>
            );
        }

        if (isBooleanField) {
            return (
                <div key={setting.key} className="space-y-2">
                    <Label htmlFor={setting.key}>{formatLabel(setting.key)}</Label>
                    {setting.description && (
                        <p className="text-sm text-muted-foreground">{setting.description}</p>
                    )}
                    <Select value={value} onValueChange={(v) => handleChange(setting.key, v)}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="true">Enabled</SelectItem>
                            <SelectItem value="false">Disabled</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            );
        }

        if (isSelectField) {
            const options = setting.key === 'mail_mailer'
                ? [{ value: 'smtp', label: 'SMTP' }, { value: 'log', label: 'Log (Development)' }, { value: 'sendmail', label: 'Sendmail' }]
                : [{ value: 'tls', label: 'TLS' }, { value: 'ssl', label: 'SSL' }, { value: 'null', label: 'None' }];

            return (
                <div key={setting.key} className="space-y-2">
                    <Label htmlFor={setting.key}>{formatLabel(setting.key)}</Label>
                    {setting.description && (
                        <p className="text-sm text-muted-foreground">{setting.description}</p>
                    )}
                    <Select value={value} onValueChange={(v) => handleChange(setting.key, v)}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select option" />
                        </SelectTrigger>
                        <SelectContent>
                            {options.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            );
        }

        if (isPasswordField) {
            return (
                <div key={setting.key} className="space-y-2">
                    <Label htmlFor={setting.key}>{formatLabel(setting.key)}</Label>
                    {setting.description && (
                        <p className="text-sm text-muted-foreground">{setting.description}</p>
                    )}
                    <Input
                        id={setting.key}
                        type="password"
                        value={value}
                        onChange={(e) => handleChange(setting.key, e.target.value)}
                        placeholder="Enter password"
                    />
                </div>
            );
        }

        // Default: text input
        return (
            <div key={setting.key} className="space-y-2">
                <Label htmlFor={setting.key}>{formatLabel(setting.key)}</Label>
                {setting.description && (
                    <p className="text-sm text-muted-foreground">{setting.description}</p>
                )}
                <Input
                    id={setting.key}
                    type="text"
                    value={value}
                    onChange={(e) => handleChange(setting.key, e.target.value)}
                />
            </div>
        );
    };

    const formatLabel = (key: string): string => {
        return key
            .split('_')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    // Group settings by category
    const generalSettings = settings.filter((s) =>
        ['app_name', 'app_tagline', 'company_name', 'app_icon', 'copyright_text'].includes(s.key),
    );

    const logoSetting = settings.find((s) => s.key === 'app_logo');

    const contactSettings = settings.filter((s) =>
        ['company_email', 'company_phone', 'whatsapp_number', 'company_address', 'support_email'].includes(s.key),
    );

    const themeSettings = settings.filter((s) =>
        ['theme_primary_color', 'theme_secondary_color'].includes(s.key),
    );

    const socialSettings = settings.filter((s) =>
        ['social_facebook', 'social_twitter', 'social_linkedin'].includes(s.key),
    );

    const featureSettings = settings.filter((s) =>
        ['enable_registration', 'enable_2fa'].includes(s.key),
    );

    const mailSettings = settings.filter((s) =>
        ['mail_mailer', 'mail_host', 'mail_port', 'mail_username', 'mail_password', 'mail_encryption', 'mail_from_address', 'mail_from_name'].includes(s.key),
    );

    const msg91Settings = settings.filter((s) =>
        ['msg91_auth_key', 'msg91_integrated_number', 'msg91_namespace', 'msg91_otp_template_name', 'msg91_payslip_template_name'].includes(s.key),
    );

    const statutorySettings = settings.filter((s) =>
        ['business_location', 'pan_number', 'tan_number', 'professional_tax_number', 'professional_tax_state'].includes(s.key),
    );

    const pfSetting    = settings.find((s) => s.key === 'pf_registered');
    const pfNumSetting = settings.find((s) => s.key === 'pf_number');
    const esiSetting    = settings.find((s) => s.key === 'esi_registered');
    const esiNumSetting = settings.find((s) => s.key === 'esi_number');

    const pfRegistered  = formData['pf_registered'] === 'true';
    const esiRegistered = formData['esi_registered'] === 'true';

    const INDIAN_STATES = [
        'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh',
        'Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka',
        'Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram',
        'Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu',
        'Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
        'Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu',
        'Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry',
    ];

    if (pageLoading) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                <div className="space-y-6">
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#e8f2fd] via-[#d0e4f8] to-[#c4d8f0] dark:from-[#0d1e33] dark:via-[#0a1828] dark:to-[#071220] px-6 py-5 shadow-sm border border-white/60 dark:border-white/10">
                        <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#071b3a]/15 dark:bg-white/10 border border-[#071b3a]/20 dark:border-white/10 shadow-inner">
                                <Settings className="h-6 w-6 text-[#071b3a] dark:text-blue-300" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight text-[#001f3f] dark:text-white">General Settings</h1>
                                <p className="text-sm text-[#1e3a5f]/60 dark:text-blue-200/60 mt-1">Loading settings...</p>
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {[1, 2, 3, 4].map((i) => (
                            <Card key={i} className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/40 dark:border-slate-800 shadow-xl rounded-2xl">
                                <CardHeader>
                                    <div className="h-5 w-40 bg-muted rounded animate-pulse" />
                                    <div className="h-4 w-64 bg-muted rounded animate-pulse mt-2" />
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {[1, 2, 3].map((j) => (
                                        <div key={j} className="space-y-2">
                                            <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                                            <div className="h-10 w-full bg-muted rounded animate-pulse" />
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
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
                                <Settings className="h-6 w-6 text-[#071b3a] dark:text-blue-300" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight text-[#001f3f] dark:text-white">
                                    General Settings
                                </h1>
                                <p className="text-sm text-[#1e3a5f]/60 dark:text-blue-200/60 mt-1">
                                    Configure your application branding and global settings
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Branding & Theme */}
                    {(logoSetting || themeSettings.length > 0) && (
                        <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/40 dark:border-slate-800 shadow-xl rounded-2xl transition-all duration-300 hover:shadow-2xl">
                            <CardHeader>
                                <CardTitle>Branding & Theme</CardTitle>
                                <CardDescription>Customize your application logo and colors</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {/* Logo Upload */}
                                {logoSetting && (
                                    <div className="space-y-3 pb-6 border-b border-border">
                                        <Label>Application Logo</Label>
                                        <div className="flex gap-4 items-start">
                                            {(logoPreview || logoSetting.value) && (
                                                <div className="rounded-lg border border-border bg-muted p-4">
                                                    <img
                                                        src={logoPreview || logoSetting.value || ''}
                                                        alt="App Logo"
                                                        className="h-20 w-20 object-contain"
                                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                    />
                                                </div>
                                            )}
                                            <div className="flex-1 space-y-3">
                                                <div>
                                                    <Input
                                                        id="logo-upload"
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={handleLogoChange}
                                                        className="cursor-pointer"
                                                    />
                                                    <p className="text-xs text-muted-foreground mt-2">
                                                        Recommended: PNG, JPG, or SVG. Max size: 2MB
                                                    </p>
                                                </div>
                                                {logoFile && (
                                                    <Button
                                                        onClick={handleLogoSubmit}
                                                        disabled={logoLoading}
                                                        size="sm"
                                                        type="button"
                                                    >
                                                        {logoLoading ? 'Uploading...' : 'Upload Logo'}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Theme Colors */}
                                {themeSettings.length > 0 && (
                                    <div className="grid grid-cols-1 gap-6">
                                        {themeSettings.map((setting) => renderField(setting))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    <form onSubmit={handleSubmit} className="contents">

                        {/* General Settings */}
                        <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/40 dark:border-slate-800 shadow-xl rounded-2xl transition-all duration-300 hover:shadow-2xl">
                            <CardHeader>
                                <CardTitle>General Settings</CardTitle>
                                <CardDescription>
                                    Basic application information displayed across the platform
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    {generalSettings.map((setting) => renderField(setting))}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Contact Information */}
                        {contactSettings.length > 0 && (
                            <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/40 dark:border-slate-800 shadow-xl rounded-2xl transition-all duration-300 hover:shadow-2xl">
                                <CardHeader>
                                    <CardTitle>Contact Information</CardTitle>
                                    <CardDescription>
                                        Company contact details for customer support
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-1 gap-6">
                                        {contactSettings.map((setting) => renderField(setting))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                        {/* Social Media */}
                        {socialSettings.length > 0 && (
                            <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/40 dark:border-slate-800 shadow-xl rounded-2xl transition-all duration-300 hover:shadow-2xl">
                                <CardHeader>
                                    <CardTitle>Social Media</CardTitle>
                                    <CardDescription>Your company's social media profiles</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-1 gap-6">
                                        {socialSettings.map((setting) => renderField(setting))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Feature Flags */}
                        {featureSettings.length > 0 && (
                            <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/40 dark:border-slate-800 shadow-xl rounded-2xl transition-all duration-300 hover:shadow-2xl">
                                <CardHeader>
                                    <CardTitle>Feature Flags</CardTitle>
                                    <CardDescription>
                                        Enable or disable application features
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-1 gap-6">
                                        {featureSettings.map((setting) => renderField(setting))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Statutory & Compliance */}
                        {(statutorySettings.length > 0 || pfSetting || esiSetting) && (
                            <Card className="lg:col-span-2 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/40 dark:border-slate-800 shadow-xl rounded-2xl transition-all duration-300 hover:shadow-2xl">
                                <CardHeader>
                                    <CardTitle>Statutory & Compliance</CardTitle>
                                    <CardDescription>
                                        Business registration and statutory details used in payroll and payslips
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    {/* Business location, PAN, TAN, PT */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                        {/* Business Location — textarea, full width */}
                                        {statutorySettings.filter(s => s.key === 'business_location').map(s => (
                                            <div key={s.key} className="md:col-span-2 space-y-2">
                                                <Label htmlFor={s.key}>Business Location</Label>
                                                {s.description && <p className="text-sm text-muted-foreground">{s.description}</p>}
                                                <Textarea
                                                    id={s.key}
                                                    value={formData[s.key] || ''}
                                                    onChange={(e) => handleChange(s.key, e.target.value)}
                                                    rows={3}
                                                    placeholder="Registered business address"
                                                />
                                            </div>
                                        ))}

                                        {/* PAN & TAN */}
                                        {statutorySettings.filter(s => ['pan_number','tan_number'].includes(s.key)).map(s => (
                                            <div key={s.key} className="space-y-2">
                                                <Label htmlFor={s.key}>{s.key === 'pan_number' ? 'PAN Number' : 'TAN Number'}</Label>
                                                {s.description && <p className="text-sm text-muted-foreground">{s.description}</p>}
                                                <Input
                                                    id={s.key}
                                                    value={formData[s.key] || ''}
                                                    onChange={(e) => handleChange(s.key, e.target.value.toUpperCase())}
                                                    maxLength={10}
                                                    className="uppercase"
                                                    placeholder={s.key === 'pan_number' ? 'e.g. AAAAA0000A' : 'e.g. AAAA00000A'}
                                                />
                                            </div>
                                        ))}

                                        {/* Professional Tax Number */}
                                        {statutorySettings.filter(s => s.key === 'professional_tax_number').map(s => (
                                            <div key={s.key} className="space-y-2">
                                                <Label htmlFor={s.key}>PT Registration Number</Label>
                                                {s.description && <p className="text-sm text-muted-foreground">{s.description}</p>}
                                                <Input
                                                    id={s.key}
                                                    value={formData[s.key] || ''}
                                                    onChange={(e) => handleChange(s.key, e.target.value)}
                                                    placeholder="e.g. 27550012345P"
                                                />
                                            </div>
                                        ))}

                                        {/* Professional Tax State */}
                                        {statutorySettings.filter(s => s.key === 'professional_tax_state').map(s => (
                                            <div key={s.key} className="space-y-2">
                                                <Label htmlFor={s.key}>PT Registered State</Label>
                                                {s.description && <p className="text-sm text-muted-foreground">{s.description}</p>}
                                                <Select value={formData[s.key] || ''} onValueChange={(v) => handleChange(s.key, v)}>
                                                    <SelectTrigger id={s.key}>
                                                        <SelectValue placeholder="Select state" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {INDIAN_STATES.map((state) => (
                                                            <SelectItem key={state} value={state}>{state}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        ))}
                                    </div>

                                    {/* PF Registration */}
                                    {pfSetting && (
                                        <div className="border-t border-border pt-6 space-y-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="pf_registered">Provident Fund (PF) Registration</Label>
                                                <Select
                                                    value={formData['pf_registered'] || 'false'}
                                                    onValueChange={(v) => handleChange('pf_registered', v)}
                                                >
                                                    <SelectTrigger id="pf_registered">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="true">✅ Registered under EPFO</SelectItem>
                                                        <SelectItem value="false">❌ Not Registered</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            {pfRegistered && pfNumSetting && (
                                                <div className="space-y-2 rounded-lg bg-muted/50 p-4 border border-border">
                                                    <Label htmlFor="pf_number">PF Registration Number</Label>
                                                    <Input
                                                        id="pf_number"
                                                        value={formData['pf_number'] || ''}
                                                        onChange={(e) => handleChange('pf_number', e.target.value)}
                                                        placeholder="e.g. MH/BAN/0012345/000/0000001"
                                                    />
                                                    <p className="text-xs text-muted-foreground">EPFO establishment code / PF registration number</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* ESI Registration */}
                                    {esiSetting && (
                                        <div className="border-t border-border pt-6 space-y-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="esi_registered">Employee State Insurance (ESI) Registration</Label>
                                                <Select
                                                    value={formData['esi_registered'] || 'false'}
                                                    onValueChange={(v) => handleChange('esi_registered', v)}
                                                >
                                                    <SelectTrigger id="esi_registered">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="true">✅ Registered under ESIC</SelectItem>
                                                        <SelectItem value="false">❌ Not Registered</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            {esiRegistered && esiNumSetting && (
                                                <div className="space-y-2 rounded-lg bg-muted/50 p-4 border border-border">
                                                    <Label htmlFor="esi_number">ESI Registration Number</Label>
                                                    <Input
                                                        id="esi_number"
                                                        value={formData['esi_number'] || ''}
                                                        onChange={(e) => handleChange('esi_number', e.target.value)}
                                                        placeholder="e.g. 12-00-123456-000-0001"
                                                    />
                                                    <p className="text-xs text-muted-foreground">ESIC employer code / registration number</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                        {/* Email Settings */}
                        {mailSettings.length > 0 && (
                            <Card className="lg:col-span-2 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/40 dark:border-slate-800 shadow-xl rounded-2xl transition-all duration-300 hover:shadow-2xl">
                                <CardHeader>
                                    <CardTitle>Email Configuration</CardTitle>
                                    <CardDescription>
                                        Configure SMTP settings for sending emails (job application notifications, etc.)
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                        {mailSettings.map((setting) => renderField(setting))}
                                    </div>
                                    <div className="mt-4 p-4 bg-muted/50 rounded-lg border border-border">
                                        <p className="text-sm text-muted-foreground">
                                            <strong>Note:</strong> After updating email settings, restart the Rust backend so it reloads the latest configuration.
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* MSG91 Settings */}
                        {msg91Settings.length > 0 && (
                            <Card className="lg:col-span-2">
                                <CardHeader>
                                    <CardTitle>MSG91 WhatsApp Configuration</CardTitle>
                                    <CardDescription>
                                        Configure MSG91 credentials for sending payslip and WhatsApp notifications
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {msg91Settings.map((setting) => renderField(setting))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        <div className="lg:col-span-2 flex justify-end gap-3">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => navigate('/admin/dashboard')}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={loading}>
                                {loading ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </div>
                    </form>
                </div>
            </div>
        </AppLayout>
    );
}
