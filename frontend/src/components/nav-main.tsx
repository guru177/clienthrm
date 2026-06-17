import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import {
    Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
    SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
    SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { type NavGroup, type NavItem } from '@/types';

function isNavGroup(item: NavItem | NavGroup): item is NavGroup {
    return 'items' in item;
}

function collectNavHrefs(items: (NavItem | NavGroup)[]): string[] {
    return items.flatMap((item) =>
        isNavGroup(item) ? item.items.map((sub) => sub.href) : [item.href],
    );
}

function isNavHrefActive(pathname: string, href: string, allHrefs: string[]): boolean {
    if (pathname === href) {
        return true;
    }
    // App Settings sub-pages (leave policy, etc.)
    if (
        href === '/admin/settings/app' &&
        pathname.startsWith('/admin/settings/') &&
        !pathname.startsWith('/admin/settings/profile') &&
        !pathname.startsWith('/admin/settings/password') &&
        !pathname.startsWith('/admin/settings/appearance')
    ) {
        return true;
    }
    if (!pathname.startsWith(`${href}/`)) {
        return false;
    }
    // Prefer the most specific nav link (e.g. /leave-requests/manage over /leave-requests).
    const hasMoreSpecificMatch = allHrefs.some(
        (other) =>
            other !== href &&
            other.startsWith(`${href}/`) &&
            (pathname === other || pathname.startsWith(`${other}/`)),
    );
    return !hasMoreSpecificMatch;
}

export function NavMain({ items = [] }: { items: (NavItem | NavGroup)[] }) {
    const location = useLocation();
    const navHrefs = collectNavHrefs(items);
    const urlIsActive = (href: string) =>
        isNavHrefActive(location.pathname, href, navHrefs);

    return (
        <SidebarGroup className="px-2 py-0">
            <SidebarMenu>
                {items.map((item) =>
                    isNavGroup(item) ? (
                        <Collapsible
                            key={item.title}
                            asChild
                            defaultOpen={item.items.some((sub) => urlIsActive(sub.href))}
                        >
                            <SidebarMenuItem>
                                <CollapsibleTrigger asChild>
                                    <SidebarMenuButton tooltip={{ children: item.title }}>
                                        {item.icon && <item.icon />}
                                        <span>{item.title}</span>
                                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]:rotate-90" />
                                    </SidebarMenuButton>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <SidebarMenuSub>
                                        {item.items.map((subItem) => (
                                            <SidebarMenuSubItem key={subItem.title}>
                                                <SidebarMenuSubButton asChild isActive={urlIsActive(subItem.href)}>
                                                    <Link to={subItem.href}>
                                                        {subItem.icon && <subItem.icon />}
                                                        <span>{subItem.title}</span>
                                                    </Link>
                                                </SidebarMenuSubButton>
                                            </SidebarMenuSubItem>
                                        ))}
                                    </SidebarMenuSub>
                                </CollapsibleContent>
                            </SidebarMenuItem>
                        </Collapsible>
                    ) : (
                        <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton asChild isActive={urlIsActive(item.href)} tooltip={{ children: item.title }}>
                                <Link to={item.href}>
                                    {item.icon && <item.icon />}
                                    <span>{item.title}</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    ),
                )}
            </SidebarMenu>
        </SidebarGroup>
    );
}
