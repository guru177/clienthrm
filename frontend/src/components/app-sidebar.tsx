import { Link } from 'react-router-dom';

import { NavFooter } from '@/components/nav-footer';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import {
    Sidebar, SidebarContent, SidebarFooter, SidebarHeader,
    SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from '@/components/ui/sidebar';
import { type NavGroup, type NavItem } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { filterNav, mainNavItems, type NavEntry } from '@/lib/admin-nav';
import { defaultAdminRoute } from '@/lib/default-route';
import AppLogo from './app-logo';

export function AppSidebar() {
    const { permissions, planModules, hasPermission } = useAuth();
    const filteredMain = filterNav(mainNavItems, permissions, planModules);
    const homeHref = defaultAdminRoute(hasPermission);

    const navItems: NavEntry[] = filteredMain;

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild className="h-auto min-h-12 justify-start overflow-visible py-2">
                            <Link to={homeHref}>
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>
            <SidebarContent>
                <NavMain items={navItems as (NavItem | NavGroup)[]} />
            </SidebarContent>
            <SidebarFooter>
                <NavFooter items={[]} className="mt-auto" />
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
