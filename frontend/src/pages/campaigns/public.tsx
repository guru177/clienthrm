// Head removed - use document.title instead
import axios from '@/lib/axios';
import { CheckCircle, LucideIcon } from 'lucide-react';
import * as Icons from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import PublicLayout from '@/layouts/public-layout';
import { handleApiError } from '@/lib/toast';

interface FormField {
    id: string;
    name: string;
    type: string;
    label: string;
    required: boolean;
    options?: string[];
    placeholder?: string;
}

interface CampaignData {
    id: number;
    name: string;
    description: string;
    slug: string;
    success_message: string;
    redirect_url: string;
    form_fields: FormField[];
}

interface AppSettings {
    app_name: string;
    app_icon: string;
    app_logo?: string;
    copyright_text: string;
}

interface PageProps {
    campaign: {
        data: CampaignData;
    };
    appSettings: AppSettings;
}

export default function PublicCampaign({ campaign, appSettings }: PageProps) {
    const campaignData = campaign.data;

    // Get dynamic icon from Lucide
    const iconName = appSettings.app_icon || 'Building2';
    const DynamicIcon = (Icons as unknown as Record<string, LucideIcon>)[iconName] || Icons.Building2;
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [formData, setFormData] = useState<Record<string, any>>({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
    });

    const handleChange = (field: string, value: any) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors((prev) => ({ ...prev, [field]: [] }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrors({});

        try {
            const response = await axios.post(`/api/campaigns/${campaignData.slug}/submit`, formData);

            setSubmitted(true);

            // Redirect if URL is provided
            if (campaignData.redirect_url) {
                setTimeout(() => {
                    window.location.href = campaignData.redirect_url;
                }, 2000);
            }
        } catch (error: any) {
            if (error.response?.data?.errors) {
                setErrors(error.response.data.errors);
            }
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const renderFormField = (field: FormField) => {
        const value = formData[field.name] || '';

        switch (field.type) {
            case 'textarea':
                return (
                    <Textarea
                        id={field.name}
                        value={value}
                        onChange={(e) => handleChange(field.name, e.target.value)}
                        placeholder={field.placeholder}
                        required={field.required}
                        className={errors[field.name] ? 'border-red-500' : ''}
                    />
                );
            case 'select':
                return (
                    <Select
                        value={value}
                        onValueChange={(val) => handleChange(field.name, val)}
                        required={field.required}
                    >
                        <SelectTrigger className={errors[field.name] ? 'border-red-500' : ''}>
                            <SelectValue placeholder={field.placeholder || 'Select an option'} />
                        </SelectTrigger>
                        <SelectContent>
                            {field.options?.map((option) => (
                                <SelectItem key={option} value={option}>
                                    {option}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                );
            case 'checkbox':
                return (
                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id={field.name}
                            checked={value}
                            onCheckedChange={(checked) =>
                                handleChange(field.name, checked === true)
                            }
                            required={field.required}
                        />
                        <label
                            htmlFor={field.name}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                            {field.label}
                        </label>
                    </div>
                );
            default:
                return (
                    <Input
                        id={field.name}
                        type={field.type}
                        value={value}
                        onChange={(e) => handleChange(field.name, e.target.value)}
                        placeholder={field.placeholder}
                        required={field.required}
                        className={errors[field.name] ? 'border-red-500' : ''}
                    />
                );
        }
    };

    if (submitted) {
        return (

            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
                <Card className="w-full max-w-2xl">
                    <CardContent className="pt-12 pb-12 text-center">
                        <div className="flex justify-center mb-6">
                            <div className="rounded-full bg-green-100 dark:bg-green-900 p-6">
                                <CheckCircle className="h-16 w-16 text-green-600 dark:text-green-400" />
                            </div>
                        </div>
                        <h2 className="text-3xl font-bold mb-4">Thank You!</h2>
                        <p className="text-lg text-muted-foreground mb-6">
                            {campaignData.success_message || 'Your submission has been received successfully.'}
                        </p>
                        {campaignData.redirect_url && (
                            <p className="text-sm text-muted-foreground">
                                Redirecting you shortly...
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
            {/* Left Side - Branded Section */}
            <div className="relative hidden lg:flex flex-col justify-between bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-12 text-white overflow-hidden">
                {/* Background Pattern */}
                <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:60px_60px]"></div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>

                {/* Content */}
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-2">
                        {appSettings.app_logo ? (
                            <img
                                src={appSettings.app_logo}
                                alt={appSettings.app_name}
                                className="h-10 w-10 object-contain"
                            />
                        ) : (
                            <div className="rounded-lg bg-white/20 backdrop-blur-sm p-2.5">
                                <DynamicIcon className="h-8 w-8" />
                            </div>
                        )}
                        <span className="text-xl font-semibold">{appSettings.app_name}</span>
                    </div>
                </div>

                <div className="relative z-10 space-y-8">
                    <div className="space-y-4">
                        <h1 className="text-5xl font-bold leading-tight">
                            {campaignData.name}
                        </h1>
                        {campaignData.description && (
                            <p className="text-xl text-white/90 leading-relaxed max-w-md">
                                {campaignData.description}
                            </p>
                        )}
                    </div>

                    {/* Decorative Elements */}
                    <div className="flex gap-4">
                        <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2">
                            <CheckCircle className="h-4 w-4" />
                            <span className="text-sm">Secure & Private</span>
                        </div>
                        <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2">
                            <CheckCircle className="h-4 w-4" />
                            <span className="text-sm">Quick Response</span>
                        </div>
                    </div>
                </div>

                <div className="relative z-10 text-sm text-white/70">
                    {appSettings.copyright_text}
                </div>
            </div>

            {/* Right Side - Form Section */}
            <div className="flex items-center justify-center p-6 lg:p-12 bg-white dark:bg-gray-950">
                <div className="w-full max-w-md space-y-8">
                    {/* Mobile Header */}
                    <div className="lg:hidden text-center space-y-4">
                        <div className="flex justify-center">
                            <div className="rounded-full bg-gradient-to-br from-blue-600 to-purple-700 p-4">
                                <DynamicIcon className="h-10 w-10 text-white" />
                            </div>
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold">{campaignData.name}</h1>
                            {campaignData.description && (
                                <p className="text-muted-foreground mt-2">
                                    {campaignData.description}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Form Header */}
                    <div className="space-y-2">
                        <h2 className="text-2xl font-bold tracking-tight">Get Started</h2>
                        <p className="text-sm text-muted-foreground">
                            Fill out the information below to continue. All fields marked with * are required.
                        </p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Name Fields */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="first_name" className="text-sm font-medium">
                                    First Name *
                                </Label>
                                <Input
                                    id="first_name"
                                    value={formData.first_name}
                                    onChange={(e) => handleChange('first_name', e.target.value)}
                                    placeholder="John"
                                    required
                                    className={errors.first_name ? 'border-red-500' : ''}
                                />
                                {errors.first_name && (
                                    <p className="text-xs text-red-500">{errors.first_name[0]}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="last_name" className="text-sm font-medium">
                                    Last Name *
                                </Label>
                                <Input
                                    id="last_name"
                                    value={formData.last_name}
                                    onChange={(e) => handleChange('last_name', e.target.value)}
                                    placeholder="Doe"
                                    required
                                    className={errors.last_name ? 'border-red-500' : ''}
                                />
                                {errors.last_name && (
                                    <p className="text-xs text-red-500">{errors.last_name[0]}</p>
                                )}
                            </div>
                        </div>

                        {/* Email */}
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-sm font-medium">
                                Email Address *
                            </Label>
                            <Input
                                id="email"
                                type="email"
                                value={formData.email}
                                onChange={(e) => handleChange('email', e.target.value)}
                                placeholder="john.doe@example.com"
                                required
                                className={errors.email ? 'border-red-500' : ''}
                            />
                            {errors.email && (
                                <p className="text-xs text-red-500">{errors.email[0]}</p>
                            )}
                        </div>

                        {/* Phone */}
                        <div className="space-y-2">
                            <Label htmlFor="phone" className="text-sm font-medium">
                                Phone Number *
                            </Label>
                            <Input
                                id="phone"
                                type="tel"
                                value={formData.phone}
                                onChange={(e) => handleChange('phone', e.target.value)}
                                placeholder="+1 (555) 123-4567"
                                required
                                className={errors.phone ? 'border-red-500' : ''}
                            />
                            {errors.phone && (
                                <p className="text-xs text-red-500">{errors.phone[0]}</p>
                            )}
                        </div>

                        {/* Custom Fields */}
                        {campaignData.form_fields?.map((field) => (
                            <div key={field.id} className="space-y-2">
                                {field.type !== 'checkbox' && (
                                    <Label htmlFor={field.name} className="text-sm font-medium">
                                        {field.label}
                                        {field.required && ' *'}
                                    </Label>
                                )}
                                {renderFormField(field)}
                                {errors[field.name] && (
                                    <p className="text-xs text-red-500">{errors[field.name][0]}</p>
                                )}
                            </div>
                        ))}

                        {/* Submit Button */}
                        <Button
                            type="submit"
                            size="lg"
                            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                            disabled={loading}
                        >
                            {loading ? 'Submitting...' : 'Submit'}
                        </Button>
                    </form>

                    {/* Footer */}
                    <p className="text-center text-xs text-muted-foreground">
                        By submitting this form, you agree to our terms of service and privacy policy.
                    </p>
                </div>
            </div>
        </div>
    );
}
