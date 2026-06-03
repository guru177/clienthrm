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

export function NavMain({ items = [] }: { items: (NavItem | NavGroup)[] }) {
    const location = useLocation();
    const urlIsActive = (href: string) => location.pathname === href || location.pathname.startsWith(href + '/');

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
