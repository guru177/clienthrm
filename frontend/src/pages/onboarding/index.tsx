import { useAuth } from '@/contexts/AuthContext';
import axios from '@/lib/axios';
import { Check } from 'lucide-react';
import { useState } from 'react';

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
import { handleApiError, handleApiResponse } from '@/lib/toast';
import { type SharedData } from '@/types';

interface OnboardingData {
    phone: string;
    date_of_birth: string;
    gender: string;
    address: string;
    city: string;
    state: string;
    country: string;
    postal_code: string;
    bio: string;
    account_number: string;
    ifsc_code: string;
    bank_name: string;
    pan_number: string;
    aadhar_number: string;
}

interface UserData {
    name: string;
    email: string;
    phone: string | null;
    date_of_birth: string | null;
    gender: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    postal_code: string | null;
    bio: string | null;
    account_number: string | null;
    ifsc_code: string | null;
    bank_name: string | null;
    pan_number: string | null;
    aadhar_number: string | null;
}

interface OnboardingPageProps extends SharedData {
    user: UserData;
}

const STEPS = [
    { id: 1, title: 'Personal Info', description: 'Basic information about yourself' },
    { id: 2, title: 'Contact Details', description: 'Your contact information' },
    { id: 3, title: 'Banking & Identity', description: 'Bank account and identity details' },
    { id: 4, title: 'About You', description: 'Tell us more about yourself' },
];

export default function OnboardingIndex() {
    const { user: authUser } = useAuth();
    const user = authUser as any;
    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});

    const [formData, setFormData] = useState<OnboardingData>({
        phone: user.phone || '',
        date_of_birth: user.date_of_birth || '',
        gender: user.gender || '',
        address: user.address || '',
        city: user.city || '',
        state: user.state || '',
        country: user.country || '',
        postal_code: user.postal_code || '',
        bio: user.bio || '',
        account_number: user.account_number || '',
        ifsc_code: user.ifsc_code || '',
        bank_name: user.bank_name || '',
        pan_number: user.pan_number || '',
        aadhar_number: user.aadhar_number || '',
    });

    const handleChange = (field: keyof OnboardingData, value: string) => {
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

    const handleNext = () => {
        if (currentStep < STEPS.length) {
            setCurrentStep((prev) => prev + 1);
        }
    };

    const handlePrevious = () => {
        if (currentStep > 1) {
            setCurrentStep((prev) => prev - 1);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setLoading(true);
        setErrors({});

        try {
            const response = await axios.post('/onboarding/complete', formData);
            handleApiResponse(response);

            // Redirect after onboarding (backend nests payload under `data`)
            const redirect = response.data?.data?.redirect ?? response.data?.redirect;
            window.location.href = redirect || '/admin/attendance';
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
        <>
            

            <div className="min-h-screen bg-linear-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
                <div className="w-full max-w-4xl">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                            Welcome, {user.name}!
                        </h1>
                        <p className="text-gray-600 dark:text-gray-400">
                            Let's complete your profile to get started
                        </p>
                    </div>

                    {/* Stepper */}
                    <div className="mb-10 px-4">
                        <div className="relative">
                            {/* Desktop Stepper */}
                            <div className="hidden md:flex items-center justify-between">
                                {STEPS.map((step, index) => (
                                    <div
                                        key={step.id}
                                        className="flex flex-col items-center relative"
                                        style={{ width: `${100 / STEPS.length}%` }}
                                    >
                                        {/* Connector Line */}
                                        {index < STEPS.length - 1 && (
                                            <div
                                                className="absolute top-6 left-1/2 w-full h-1 -z-10"
                                                style={{ transform: 'translateY(-50%)' }}
                                            >
                                                <div
                                                    className={`h-full transition-all duration-300 ${currentStep > step.id
                                                        ? 'bg-green-500'
                                                        : 'bg-gray-300 dark:bg-gray-700'
                                                        }`}
                                                />
                                            </div>
                                        )}

                                        {/* Circle */}
                                        <div
                                            className={`w-12 h-12 rounded-full flex items-center justify-center border-3 transition-all duration-300 shadow-lg ${currentStep > step.id
                                                ? 'bg-green-500 border-green-500 text-white scale-100'
                                                : currentStep === step.id
                                                    ? 'bg-blue-600 border-blue-600 text-white scale-110 ring-4 ring-blue-200 dark:ring-blue-900'
                                                    : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-400 scale-90'
                                                }`}
                                        >
                                            {currentStep > step.id ? (
                                                <Check className="w-6 h-6" strokeWidth={3} />
                                            ) : (
                                                <span className="text-lg font-bold">
                                                    {step.id}
                                                </span>
                                            )}
                                        </div>

                                        {/* Label */}
                                        <div className="mt-3 text-center max-w-35">
                                            <p
                                                className={`text-sm font-semibold transition-colors ${currentStep >= step.id
                                                    ? 'text-gray-900 dark:text-white'
                                                    : 'text-gray-500 dark:text-gray-500'
                                                    }`}
                                            >
                                                {step.title}
                                            </p>
                                            <p
                                                className={`text-xs mt-1 transition-colors ${currentStep === step.id
                                                    ? 'text-gray-600 dark:text-gray-400'
                                                    : 'text-gray-500 dark:text-gray-500'
                                                    }`}
                                            >
                                                {step.description}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Mobile Stepper */}
                            <div className="md:hidden">
                                <div className="flex items-center justify-center gap-2 mb-4">
                                    {STEPS.map((step) => (
                                        <div
                                            key={step.id}
                                            className={`h-2 flex-1 rounded-full transition-all duration-300 ${currentStep > step.id
                                                ? 'bg-green-500'
                                                : currentStep === step.id
                                                    ? 'bg-blue-600'
                                                    : 'bg-gray-300 dark:bg-gray-700'
                                                }`}
                                        />
                                    ))}
                                </div>
                                <div className="text-center">
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                        Step {currentStep} of {STEPS.length}
                                    </p>
                                    <p className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                                        {STEPS[currentStep - 1].title}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Form Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle>{STEPS[currentStep - 1].title}</CardTitle>
                            <CardDescription>
                                {STEPS[currentStep - 1].description}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} onKeyDown={(e) => {
                                // Prevent Enter key from submitting form except on last step
                                if (e.key === 'Enter' && currentStep < STEPS.length) {
                                    e.preventDefault();
                                }
                            }}>
                                {/* Step 1: Personal Info */}
                                {currentStep === 1 && (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="phone">Phone Number</Label>
                                                <Input
                                                    id="phone"
                                                    type="tel"
                                                    placeholder="+1 234 567 8900"
                                                    value={formData.phone}
                                                    onChange={(e) =>
                                                        handleChange('phone', e.target.value)
                                                    }
                                                />
                                                {errors.phone && (
                                                    <p className="text-sm text-red-500">
                                                        {errors.phone[0]}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="date_of_birth">
                                                    Date of Birth
                                                </Label>
                                                <Input
                                                    id="date_of_birth"
                                                    type="date"
                                                    value={formData.date_of_birth}
                                                    onChange={(e) =>
                                                        handleChange(
                                                            'date_of_birth',
                                                            e.target.value,
                                                        )
                                                    }
                                                />
                                                {errors.date_of_birth && (
                                                    <p className="text-sm text-red-500">
                                                        {errors.date_of_birth[0]}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="gender">Gender</Label>
                                            <Select
                                                value={formData.gender}
                                                onValueChange={(value) =>
                                                    handleChange('gender', value)
                                                }
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select gender" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="male">Male</SelectItem>
                                                    <SelectItem value="female">Female</SelectItem>
                                                    <SelectItem value="other">Other</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            {errors.gender && (
                                                <p className="text-sm text-red-500">
                                                    {errors.gender[0]}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Step 2: Contact Details */}
                                {currentStep === 2 && (
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="address">Street Address</Label>
                                            <Input
                                                id="address"
                                                type="text"
                                                placeholder="123 Main Street"
                                                value={formData.address}
                                                onChange={(e) =>
                                                    handleChange('address', e.target.value)
                                                }
                                            />
                                            {errors.address && (
                                                <p className="text-sm text-red-500">
                                                    {errors.address[0]}
                                                </p>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="city">City</Label>
                                                <Input
                                                    id="city"
                                                    type="text"
                                                    placeholder="New York"
                                                    value={formData.city}
                                                    onChange={(e) =>
                                                        handleChange('city', e.target.value)
                                                    }
                                                />
                                                {errors.city && (
                                                    <p className="text-sm text-red-500">
                                                        {errors.city[0]}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="state">State/Province</Label>
                                                <Input
                                                    id="state"
                                                    type="text"
                                                    placeholder="NY"
                                                    value={formData.state}
                                                    onChange={(e) =>
                                                        handleChange('state', e.target.value)
                                                    }
                                                />
                                                {errors.state && (
                                                    <p className="text-sm text-red-500">
                                                        {errors.state[0]}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="country">Country</Label>
                                                <Input
                                                    id="country"
                                                    type="text"
                                                    placeholder="United States"
                                                    value={formData.country}
                                                    onChange={(e) =>
                                                        handleChange('country', e.target.value)
                                                    }
                                                />
                                                {errors.country && (
                                                    <p className="text-sm text-red-500">
                                                        {errors.country[0]}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="postal_code">Postal Code</Label>
                                                <Input
                                                    id="postal_code"
                                                    type="text"
                                                    placeholder="10001"
                                                    value={formData.postal_code}
                                                    onChange={(e) =>
                                                        handleChange('postal_code', e.target.value)
                                                    }
                                                />
                                                {errors.postal_code && (
                                                    <p className="text-sm text-red-500">
                                                        {errors.postal_code[0]}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Step 3: Banking & Identity */}
                                {currentStep === 3 && (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="account_number">
                                                    Account Number{' '}
                                                    <span className="text-gray-500 font-normal">
                                                        (optional)
                                                    </span>
                                                </Label>
                                                <Input
                                                    id="account_number"
                                                    type="text"
                                                    placeholder="1234567890"
                                                    value={formData.account_number}
                                                    onChange={(e) =>
                                                        handleChange('account_number', e.target.value)
                                                    }
                                                />
                                                {errors.account_number && (
                                                    <p className="text-sm text-red-500">
                                                        {errors.account_number[0]}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="ifsc_code">
                                                    IFSC Code{' '}
                                                    <span className="text-gray-500 font-normal">
                                                        (optional)
                                                    </span>
                                                </Label>
                                                <Input
                                                    id="ifsc_code"
                                                    type="text"
                                                    placeholder="SBIN0001234"
                                                    value={formData.ifsc_code}
                                                    onChange={(e) =>
                                                        handleChange('ifsc_code', e.target.value)
                                                    }
                                                />
                                                {errors.ifsc_code && (
                                                    <p className="text-sm text-red-500">
                                                        {errors.ifsc_code[0]}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="bank_name">
                                                Bank Name{' '}
                                                <span className="text-gray-500 font-normal">
                                                    (optional)
                                                </span>
                                            </Label>
                                            <Input
                                                id="bank_name"
                                                type="text"
                                                placeholder="State Bank of India"
                                                value={formData.bank_name}
                                                onChange={(e) =>
                                                    handleChange('bank_name', e.target.value)
                                                }
                                            />
                                            {errors.bank_name && (
                                                <p className="text-sm text-red-500">
                                                    {errors.bank_name[0]}
                                                </p>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="pan_number">
                                                    PAN Number{' '}
                                                    <span className="text-gray-500 font-normal">
                                                        (optional)
                                                    </span>
                                                </Label>
                                                <Input
                                                    id="pan_number"
                                                    type="text"
                                                    placeholder="ABCDE1234F"
                                                    value={formData.pan_number}
                                                    onChange={(e) =>
                                                        handleChange('pan_number', e.target.value.toUpperCase())
                                                    }
                                                />
                                                {errors.pan_number && (
                                                    <p className="text-sm text-red-500">
                                                        {errors.pan_number[0]}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="aadhar_number">
                                                    Aadhar Number{' '}
                                                    <span className="text-gray-500 font-normal">
                                                        (optional)
                                                    </span>
                                                </Label>
                                                <Input
                                                    id="aadhar_number"
                                                    type="text"
                                                    placeholder="1234 5678 9012"
                                                    value={formData.aadhar_number}
                                                    onChange={(e) =>
                                                        handleChange('aadhar_number', e.target.value)
                                                    }
                                                />
                                                {errors.aadhar_number && (
                                                    <p className="text-sm text-red-500">
                                                        {errors.aadhar_number[0]}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Step 4: About You */}
                                {currentStep === 4 && (
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="bio">
                                                Bio{' '}
                                                <span className="text-gray-500 font-normal">
                                                    (optional)
                                                </span>
                                            </Label>
                                            <Textarea
                                                id="bio"
                                                placeholder="Tell us a bit about yourself..."
                                                rows={6}
                                                value={formData.bio}
                                                onChange={(e) =>
                                                    handleChange('bio', e.target.value)
                                                }
                                                className="resize-none"
                                            />
                                            {errors.bio && (
                                                <p className="text-sm text-red-500">
                                                    {errors.bio[0]}
                                                </p>
                                            )}
                                            <p className="text-xs text-gray-500">
                                                Maximum 1000 characters
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Navigation Buttons */}
                                <div className="flex justify-between mt-8">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            handlePrevious();
                                        }}
                                        disabled={currentStep === 1 || loading}
                                    >
                                        Previous
                                    </Button>

                                    {currentStep < STEPS.length ? (
                                        <Button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                handleNext();
                                            }}
                                            disabled={loading}
                                        >
                                            Next
                                        </Button>
                                    ) : (
                                        <Button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                handleSubmit(e);
                                            }}
                                            disabled={loading}
                                        >
                                            {loading ? 'Completing...' : 'Complete Onboarding'}
                                        </Button>
                                    )}
                                </div>
                            </form>
                        </CardContent>
                    </Card>

                    {/* Optional: Skip button */}
                    <div className="text-center mt-6">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                handleSubmit(e as any);
                            }}
                            disabled={loading}
                            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 underline disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {loading ? 'Processing...' : 'Skip and go to dashboard'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
