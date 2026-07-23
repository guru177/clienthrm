import { Link, useLocation } from 'react-router-dom';

import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
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
        !pathname.startsWith('/admin/settings/appearance') &&
        !pathname.startsWith('/admin/settings/two-factor')
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

function NavLinkItem({
    item,
    isActive,
}: {
    item: NavItem;
    isActive: boolean;
}) {
    return (
        <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive} tooltip={{ children: item.title }}>
                <Link to={item.href}>
                    {item.icon && <item.icon aria-hidden />}
                    <span>{item.title}</span>
                </Link>
            </SidebarMenuButton>
        </SidebarMenuItem>
    );
}

/**
 * Section labels (not collapsible dropdowns): grouping without hiding destinations.
 * Closed accordion nav forces extra clicks and makes users hunt for pages.
 */
export function NavMain({ items = [] }: { items: (NavItem | NavGroup)[] }) {
    const location = useLocation();
    const navHrefs = collectNavHrefs(items);
    const urlIsActive = (href: string) =>
        isNavHrefActive(location.pathname, href, navHrefs);

    const topLevelLinks = items.filter((item): item is NavItem => !isNavGroup(item));
    const groups = items.filter(isNavGroup);

    return (
        <>
            {topLevelLinks.length > 0 && (
                <SidebarGroup className="px-2.5 py-1">
                    <SidebarMenu>
                        {topLevelLinks.map((item) => (
                            <NavLinkItem
                                key={item.href}
                                item={item}
                                isActive={urlIsActive(item.href)}
                            />
                        ))}
                    </SidebarMenu>
                </SidebarGroup>
            )}

            {groups.map((group) => (
                <SidebarGroup key={group.title} className="px-2.5 py-1">
                    <SidebarGroupLabel className="px-2 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/55">
                        {group.title}
                    </SidebarGroupLabel>
                    <SidebarMenu>
                        {group.items.map((subItem) => (
                            <NavLinkItem
                                key={subItem.href}
                                item={subItem}
                                isActive={urlIsActive(subItem.href)}
                            />
                        ))}
                    </SidebarMenu>
                </SidebarGroup>
            ))}
        </>
    );
}
