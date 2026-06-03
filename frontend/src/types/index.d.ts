import { LucideIcon } from 'lucide-react';

export interface Auth {
    user: User;
    permissions: string[];
}

export interface BreadcrumbItem {
    title?: string;
    label?: string;
    href?: string;
}

export interface NavGroup {
    title: string;
    icon?: LucideIcon | null;
    items: NavItem[];
}

export interface NavItem {
    title: string;
    href: string;
    icon?: LucideIcon | null;
    isActive?: boolean;
}

export interface SharedData {
    name: string;
    auth: Auth;
    sidebarOpen: boolean;
    appSettings?: {
        app_name?: string;
        app_logo?: string;
        app_icon?: string;
        app_tagline?: string;
        company_name?: string;
        [key: string]: string | undefined;
    };
    [key: string]: unknown;
}

export interface Role {
    id: number;
    name: string;
    slug: string;
    description?: string;
    is_default?: boolean;
}

export interface User {
    id: number;
    name: string;
    email: string;
    avatar?: string;
    photo?: string;
    email_verified_at: string | null;
    two_factor_enabled?: boolean;
    roles?: Role[];
    created_at: string;
    updated_at: string;
    [key: string]: any;
}
