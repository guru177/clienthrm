import axios from '@/lib/axios';
import {
    Hand,
    Maximize2,
    Network,
    Pencil,
    RefreshCw,
    Search,
    Users,
    X,
    ZoomIn,
    ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
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
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/use-permissions';
import { useStorageSrc } from '@/hooks/use-storage-src';
import AppLayout from '@/layouts/app-layout';
import { handleApiError, handleApiResponse } from '@/lib/toast';

interface BranchOption {
    id: number;
    name: string;
}

interface FilterOption {
    id: number;
    name: string;
    level?: string | null;
}

interface OrgRole {
    id: number;
    name: string;
}

interface OrgNode {
    id: number;
    name: string;
    email: string | null;
    employee_id: string | null;
    avatar: string | null;
    photo: string | null;
    status: string | null;
    parent_id: number | null;
    designation: { id: number; name: string; level: string | null } | null;
    department: { id: number; name: string } | null;
    roles: OrgRole[];
    children: OrgNode[];
}

interface OrgChartData {
    forest: OrgNode[];
    needs_reporting_line: OrgNode[];
    stats: {
        total: number;
        roots: number;
        missing_manager: number;
        needs_reporting_line: number;
    };
    filters: {
        roles: FilterOption[];
        designations: FilterOption[];
    };
}

interface LaidOutNode {
    id: number;
    node: OrgNode;
    x: number;
    y: number;
}

interface Edge {
    from: number;
    to: number;
}

interface LayoutResult {
    nodes: LaidOutNode[];
    edges: Edge[];
    width: number;
    height: number;
}

const NODE_W = 188;
const NODE_H = 118;
const H_GAP = 40;
const V_GAP = 88;
const ROOT_GAP = 56;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;
const FIT_PAD = 48;
/** Screen-pixel stroke so lines stay visible when the canvas is zoomed out. */
const EDGE_STROKE_PX = 2;

const ROLE_BADGE_COLORS = [
    'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
    'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
    'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
    'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
];

function roleBadgeClass(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i) * (i + 1)) % 97;
    return ROLE_BADGE_COLORS[hash % ROLE_BADGE_COLORS.length];
}

function getInitials(name: string) {
    return name
        .split(/\s+/)
        .filter((n) => n && /[A-Za-z0-9]/.test(n[0]))
        .slice(0, 2)
        .map((n) => n[0])
        .join('')
        .toUpperCase() || '?';
}

function subtreeWidth(node: OrgNode): number {
    if (!node.children.length) return NODE_W;
    const kids = node.children.reduce((sum, c) => sum + subtreeWidth(c), 0);
    return Math.max(NODE_W, kids + H_GAP * (node.children.length - 1));
}

function layoutTree(
    node: OrgNode,
    left: number,
    top: number,
    out: LaidOutNode[],
    edges: Edge[],
) {
    const w = subtreeWidth(node);
    const x = left + w / 2 - NODE_W / 2;
    out.push({ id: node.id, node, x, y: top });
    if (!node.children.length) return;

    let cursor = left;
    const childTop = top + NODE_H + V_GAP;
    for (const child of node.children) {
        const cw = subtreeWidth(child);
        layoutTree(child, cursor, childTop, out, edges);
        edges.push({ from: node.id, to: child.id });
        cursor += cw + H_GAP;
    }
}

function layoutForest(roots: OrgNode[]): LayoutResult {
    const nodes: LaidOutNode[] = [];
    const edges: Edge[] = [];
    let left = 0;
    let maxBottom = 0;
    for (const root of roots) {
        const w = subtreeWidth(root);
        layoutTree(root, left, 0, nodes, edges);
        left += w + ROOT_GAP;
    }
    for (const n of nodes) {
        maxBottom = Math.max(maxBottom, n.y + NODE_H);
    }
    return {
        nodes,
        edges,
        width: Math.max(left - ROOT_GAP, NODE_W),
        height: Math.max(maxBottom, NODE_H),
    };
}

function collectDescendants(node: OrgNode, into: Set<number>) {
    for (const c of node.children) {
        into.add(c.id);
        collectDescendants(c, into);
    }
}

function flattenForest(roots: OrgNode[]): OrgNode[] {
    const out: OrgNode[] = [];
    const walk = (n: OrgNode) => {
        out.push(n);
        n.children.forEach(walk);
    };
    roots.forEach(walk);
    return out;
}

function elbowPath(
    from: { x: number; y: number },
    to: { x: number; y: number },
): string {
    const x1 = from.x + NODE_W / 2;
    const y1 = from.y + NODE_H;
    const x2 = to.x + NODE_W / 2;
    const y2 = to.y;
    const midY = y1 + (y2 - y1) / 2;
    return `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
}

function PersonAvatar({
    photo,
    avatar,
    name,
}: {
    photo?: string | null;
    avatar?: string | null;
    name: string;
}) {
    const src = useStorageSrc(photo || avatar);
    return (
        <Avatar className="h-8 w-8 shrink-0 border border-border/60">
            <AvatarImage src={src || undefined} alt={name} />
            <AvatarFallback className="text-[10px] bg-muted">{getInitials(name)}</AvatarFallback>
        </Avatar>
    );
}

function OrgPersonCard({
    node,
    canEdit,
    onEditReportsTo,
}: {
    node: OrgNode;
    canEdit: boolean;
    onEditReportsTo: (node: OrgNode) => void;
}) {
    return (
        <div className="flex h-full w-full flex-col rounded-lg border-2 border-foreground/70 bg-background px-2.5 py-2 shadow-md dark:border-foreground/40 [backface-visibility:hidden]">
            <div className="flex items-start gap-2">
                <PersonAvatar photo={node.photo} avatar={node.avatar} name={node.name} />
                <div className="min-w-0 flex-1">
                    <Link
                        to={`/admin/users/${node.id}`}
                        className="block truncate text-sm font-semibold leading-tight text-foreground hover:underline"
                        title={node.name}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        {node.name}
                    </Link>
                    {node.employee_id && (
                        <p className="truncate text-[11px] text-muted-foreground">
                            #{node.employee_id}
                        </p>
                    )}
                </div>
                {canEdit && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        title="Change Reports to"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            onEditReportsTo(node);
                        }}
                    >
                        <Pencil className="h-3.5 w-3.5" />
                    </Button>
                )}
            </div>
            <p
                className="mt-1.5 truncate text-xs font-medium text-foreground/80"
                title={node.designation?.name || undefined}
            >
                {node.designation?.name || '—'}
            </p>
            {node.department?.name && (
                <p className="truncate text-[11px] text-muted-foreground" title={node.department.name}>
                    {node.department.name}
                </p>
            )}
            {node.roles.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                    {node.roles.map((r) => (
                        <span
                            key={r.id}
                            className={`inline-flex max-w-full truncate rounded px-1.5 py-0.5 text-[10px] font-medium ${roleBadgeClass(r.name)}`}
                        >
                            {r.name}
                        </span>
                    ))}
                </div>
            )}
            {node.status && node.status !== 'active' && (
                <Badge variant="outline" className="mt-1 w-fit capitalize text-[10px]">
                    {node.status}
                </Badge>
            )}
        </div>
    );
}

function OrgCanvas({
    forest,
    canEdit,
    onEditReportsTo,
    zoom,
    setZoom,
    fitToken,
}: {
    forest: OrgNode[];
    canEdit: boolean;
    onEditReportsTo: (node: OrgNode) => void;
    zoom: number;
    setZoom: (z: number | ((prev: number) => number)) => void;
    fitToken: number;
}) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const dragRef = useRef<{
        active: boolean;
        moved: boolean;
        startX: number;
        startY: number;
        origX: number;
        origY: number;
        pointerId: number;
    } | null>(null);
    const spacePanRef = useRef(false);
    const [isPanning, setIsPanning] = useState(false);

    const layout = useMemo(() => layoutForest(forest), [forest]);
    const byId = useMemo(() => {
        const m = new Map<number, LaidOutNode>();
        for (const n of layout.nodes) m.set(n.id, n);
        return m;
    }, [layout]);

    const fitView = useCallback(() => {
        const vp = viewportRef.current;
        if (!vp || layout.width <= 0 || layout.height <= 0) return;
        const vw = vp.clientWidth - FIT_PAD * 2;
        const vh = vp.clientHeight - FIT_PAD * 2;
        if (vw <= 0 || vh <= 0) return;
        const next = Math.min(1, vw / layout.width, vh / layout.height);
        const z = Math.max(MIN_ZOOM, Number(next.toFixed(3)));
        setZoom(z);
        const ox = (vp.clientWidth - layout.width * z) / 2;
        const oy = (vp.clientHeight - layout.height * z) / 2;
        setPan({ x: ox, y: Math.max(FIT_PAD / 2, oy) });
    }, [layout.height, layout.width, setZoom]);

    useEffect(() => {
        fitView();
    }, [fitView, fitToken, forest]);

    useEffect(() => {
        const vp = viewportRef.current;
        if (!vp) return;
        const ro = new ResizeObserver(() => fitView());
        ro.observe(vp);
        return () => ro.disconnect();
    }, [fitView]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space' && !(e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable]')) {
                spacePanRef.current = true;
                e.preventDefault();
            }
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') spacePanRef.current = false;
        };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        };
    }, []);

    const onPointerDown = (e: React.PointerEvent) => {
        if (e.button !== 0 && e.button !== 1) return;
        const target = e.target as HTMLElement;
        const onInteractive = !!target.closest('a,button,input,select,textarea,[data-no-pan]');
        if (onInteractive && e.button === 0 && !spacePanRef.current) return;

        dragRef.current = {
            active: true,
            moved: false,
            startX: e.clientX,
            startY: e.clientY,
            origX: pan.x,
            origY: pan.y,
            pointerId: e.pointerId,
        };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setIsPanning(true);
    };

    const onPointerMove = (e: React.PointerEvent) => {
        const d = dragRef.current;
        if (!d?.active) return;
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
        setPan({ x: d.origX + dx, y: d.origY + dy });
    };

    const onPointerUp = () => {
        dragRef.current = null;
        setIsPanning(false);
    };

    const onWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const vp = viewportRef.current;
        if (!vp) return;
        const rect = vp.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const factor = e.deltaY > 0 ? 0.92 : 1.08;
        setZoom((prev) => {
            const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((prev * factor).toFixed(3))));
            const wx = (mx - pan.x) / prev;
            const wy = (my - pan.y) / prev;
            setPan({ x: mx - wx * next, y: my - wy * next });
            return next;
        });
    };

    return (
        <div
            ref={viewportRef}
            className={`relative h-full min-h-0 w-full flex-1 overflow-hidden rounded-xl border border-border/70 bg-[radial-gradient(circle_at_1px_1px,color-mix(in_oklch,var(--muted-foreground)_18%,transparent)_1px,transparent_0)] [background-size:18px_18px] ${
                isPanning ? 'cursor-grabbing' : 'cursor-grab'
            }`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
        >
            {/*
              Pan via transform; zoom via CSS `zoom` so text/cards stay sharp
              (transform: scale() rasterizes and blurs when zoomed in).
            */}
            <div
                className="absolute left-0 top-0 origin-top-left"
                style={{
                    transform: `translate(${pan.x}px, ${pan.y}px)`,
                }}
            >
                <div
                    className="relative"
                    style={{
                        width: layout.width,
                        height: layout.height,
                        zoom,
                    }}
                >
                    <svg
                        className="pointer-events-none absolute left-0 top-0 overflow-visible"
                        width={layout.width}
                        height={layout.height}
                        aria-hidden
                    >
                        {layout.edges.map((e) => {
                            const from = byId.get(e.from);
                            const to = byId.get(e.to);
                            if (!from || !to) return null;
                            return (
                                <path
                                    key={`${e.from}-${e.to}`}
                                    d={elbowPath(from, to)}
                                    fill="none"
                                    stroke="var(--foreground)"
                                    strokeOpacity={0.7}
                                    // Counter CSS zoom so lines stay ~EDGE_STROKE_PX on screen
                                    strokeWidth={EDGE_STROKE_PX / zoom}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            );
                        })}
                    </svg>

                    {layout.nodes.map((n) => (
                        <div
                            key={n.id}
                            className="absolute"
                            style={{
                                left: n.x,
                                top: n.y,
                                width: NODE_W,
                                height: NODE_H,
                            }}
                        >
                            <OrgPersonCard
                                node={n.node}
                                canEdit={canEdit}
                                onEditReportsTo={onEditReportsTo}
                            />
                        </div>
                    ))}
                </div>
            </div>

            <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 rounded-md bg-background/90 px-2 py-1 text-[11px] text-muted-foreground shadow-sm border">
                <Hand className="h-3.5 w-3.5" />
                Drag to pan · Scroll to zoom · Space+drag
            </div>
        </div>
    );
}

export default function OrgChartPage() {
    const { canAccessAllCenters, branchScope, canAccessCenter } = useAuth();
    const { hasPermission } = usePermissions();
    const canEdit = hasPermission('edit-users');
    const allCenters = canAccessAllCenters();

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<OrgChartData | null>(null);
    const [branches, setBranches] = useState<BranchOption[]>([]);
    const [branchId, setBranchId] = useState('all');
    const [roleId, setRoleId] = useState('all');
    const [designationId, setDesignationId] = useState('all');
    const [search, setSearch] = useState('');
    const [searchDebounced, setSearchDebounced] = useState('');
    const [zoom, setZoom] = useState(1);
    const [fitToken, setFitToken] = useState(0);

    const [editNode, setEditNode] = useState<OrgNode | null>(null);
    const [editManagerId, setEditManagerId] = useState('none');
    const [savingReportsTo, setSavingReportsTo] = useState(false);
    const [managerChoices, setManagerChoices] = useState<
        { id: number; name: string; designation?: string | null }[]
    >([]);

    useEffect(() => {
        if (allCenters) return;
        const ids = branchScope.center_ids;
        if (ids.length === 0) return;
        setBranchId((prev) => {
            if (prev !== 'all' && ids.includes(Number(prev))) return prev;
            return String(ids[0]);
        });
    }, [allCenters, branchScope.center_ids]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await axios.get('/admin/settings/centers', {
                    params: { compact: 1 },
                });
                if (cancelled) return;
                const list = res.data?.data ?? res.data ?? [];
                setBranches(
                    (Array.isArray(list) ? list : [])
                        .map((c: { id: number; name: string }) => ({
                            id: Number(c.id),
                            name: c.name,
                        }))
                        .filter((c: BranchOption) => allCenters || canAccessCenter(c.id)),
                );
            } catch {
                setBranches([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [allCenters, canAccessCenter]);

    useEffect(() => {
        const t = window.setTimeout(() => setSearchDebounced(search.trim()), 300);
        return () => window.clearTimeout(t);
    }, [search]);

    const loadChart = useCallback(async () => {
        if (!allCenters && branchId === 'all') return;
        setLoading(true);
        try {
            const res = await axios.get('/admin/org-chart', {
                params: {
                    center_id: branchId !== 'all' ? Number(branchId) : undefined,
                    role_id: roleId !== 'all' ? Number(roleId) : undefined,
                    designation_id:
                        designationId !== 'all' ? Number(designationId) : undefined,
                    search: searchDebounced || undefined,
                },
            });
            setData(res.data?.data as OrgChartData);
            setFitToken((n) => n + 1);
        } catch (error) {
            handleApiError(error);
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [allCenters, branchId, roleId, designationId, searchDebounced]);

    useEffect(() => {
        void loadChart();
    }, [loadChart]);

    const peopleOptions = useMemo(() => {
        if (!data) return [] as OrgNode[];
        return [
            ...flattenForest(data.forest),
            ...data.needs_reporting_line,
        ];
    }, [data]);

    const blockedManagerIds = useMemo(() => {
        if (!editNode || !data) return new Set<number>([editNode?.id ?? -1]);
        const blocked = new Set<number>([editNode.id]);
        const find = (nodes: OrgNode[]): OrgNode | null => {
            for (const n of nodes) {
                if (n.id === editNode.id) return n;
                const hit = find(n.children);
                if (hit) return hit;
            }
            return null;
        };
        const self =
            find(data.forest) ||
            data.needs_reporting_line.find((n) => n.id === editNode.id) ||
            null;
        if (self) collectDescendants(self, blocked);
        return blocked;
    }, [editNode, data]);

    const openEditReportsTo = async (node: OrgNode) => {
        setEditNode(node);
        setEditManagerId(node.parent_id ? String(node.parent_id) : 'none');
        try {
            const res = await axios.get('/admin/users/list');
            const list = res.data?.data ?? [];
            setManagerChoices(
                (Array.isArray(list) ? list : []).map(
                    (u: {
                        id: number;
                        name: string;
                        designation?: { name?: string } | null;
                    }) => ({
                        id: u.id,
                        name: u.name,
                        designation: u.designation?.name ?? null,
                    }),
                ),
            );
        } catch {
            setManagerChoices(
                peopleOptions.map((p) => ({
                    id: p.id,
                    name: p.name,
                    designation: p.designation?.name ?? null,
                })),
            );
        }
    };

    const saveReportsTo = async () => {
        if (!editNode) return;
        setSavingReportsTo(true);
        try {
            const formData = new FormData();
            formData.append(
                'reporting_manager_id',
                editManagerId === 'none' ? '' : editManagerId,
            );
            const response = await axios.post(`/admin/users/${editNode.id}`, formData);
            handleApiResponse(response);
            if (response.data.success) {
                setEditNode(null);
                await loadChart();
            }
        } catch (error) {
            handleApiError(error);
        } finally {
            setSavingReportsTo(false);
        }
    };

    const hasFilters =
        (allCenters && branchId !== 'all') ||
        roleId !== 'all' ||
        designationId !== 'all' ||
        !!search;

    const roles = data?.filters.roles ?? [];
    const designations = data?.filters.designations ?? [];

    const breadcrumbs = useMemo(
        () => [{ title: 'Org Chart', href: '/admin/org-chart' }],
        [],
    );

    const hasChart =
        !!data && (data.forest.length > 0 || data.needs_reporting_line.length > 0);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <div className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden p-2 sm:p-3 md:p-4">
                <div className="relative shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-[#e8f2fd] via-[#d0e4f8] to-[#c4d8f0] dark:from-[#0d1e33] dark:via-[#0a1828] dark:to-[#071220] px-6 py-4 shadow-sm border border-white/60 dark:border-white/10">
                    <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#071b3a]/15 dark:bg-white/10 border border-[#071b3a]/20 dark:border-white/10 shadow-inner">
                                <Network className="h-6 w-6 text-[#071b3a] dark:text-blue-300" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight text-[#001f3f] dark:text-white">
                                    Org Chart
                                </h1>
                                <p className="text-sm text-[#1e3a5f]/60 dark:text-blue-200/60">
                                    Interactive canvas — pan, zoom, and edit{' '}
                                    <strong className="font-semibold text-[#001f3f]/80 dark:text-blue-100">
                                        Reports to
                                    </strong>
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 z-10">
                            <Button
                                variant="outline"
                                size="icon"
                                className="bg-white/50 dark:bg-black/20"
                                onClick={() =>
                                    setZoom((z) =>
                                        Math.max(MIN_ZOOM, Number((z - 0.1).toFixed(2))),
                                    )
                                }
                                aria-label="Zoom out"
                            >
                                <ZoomOut className="h-4 w-4" />
                            </Button>
                            <span className="min-w-[3rem] text-center text-xs font-medium text-[#001f3f]/70 dark:text-blue-100/70">
                                {Math.round(zoom * 100)}%
                            </span>
                            <Button
                                variant="outline"
                                size="icon"
                                className="bg-white/50 dark:bg-black/20"
                                onClick={() =>
                                    setZoom((z) =>
                                        Math.min(MAX_ZOOM, Number((z + 0.1).toFixed(2))),
                                    )
                                }
                                aria-label="Zoom in"
                            >
                                <ZoomIn className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="bg-white/50 dark:bg-black/20"
                                onClick={() => setFitToken((n) => n + 1)}
                            >
                                <Maximize2 className="h-4 w-4 mr-1.5" />
                                Fit
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => void loadChart()}
                                disabled={loading}
                                className="bg-white/50 dark:bg-black/20"
                            >
                                <RefreshCw
                                    className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`}
                                />
                                Refresh
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <div className="relative min-w-[180px] flex-1 max-w-sm">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search people..."
                            className="pl-9"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <Select
                        value={branchId}
                        onValueChange={setBranchId}
                        disabled={!allCenters && branches.length <= 1}
                    >
                        <SelectTrigger className="w-44">
                            <SelectValue
                                placeholder={allCenters ? 'All branches' : 'Your branch'}
                            />
                        </SelectTrigger>
                        <SelectContent>
                            {allCenters && (
                                <SelectItem value="all">All branches</SelectItem>
                            )}
                            {branches.map((b) => (
                                <SelectItem key={b.id} value={String(b.id)}>
                                    {b.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={roleId} onValueChange={setRoleId}>
                        <SelectTrigger className="w-44">
                            <SelectValue placeholder="Role" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All access roles</SelectItem>
                            {roles.map((r) => (
                                <SelectItem key={r.id} value={String(r.id)}>
                                    {r.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={designationId} onValueChange={setDesignationId}>
                        <SelectTrigger className="w-48">
                            <SelectValue placeholder="Designation" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All designations</SelectItem>
                            {designations.map((d) => (
                                <SelectItem key={d.id} value={String(d.id)}>
                                    {d.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {hasFilters && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setSearch('');
                                setBranchId(
                                    allCenters
                                        ? 'all'
                                        : branches[0]
                                          ? String(branches[0].id)
                                          : 'all',
                                );
                                setRoleId('all');
                                setDesignationId('all');
                            }}
                        >
                            <X className="h-4 w-4" />
                            Clear
                        </Button>
                    )}

                    {data && (
                        <div className="flex flex-wrap gap-2 text-sm ml-auto">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1">
                                <Users className="h-3.5 w-3.5" />
                                {data.stats.total} people
                            </span>
                        </div>
                    )}
                </div>

                <p className="shrink-0 text-xs text-muted-foreground">
                    Pencil on a card changes that person’s{' '}
                    <span className="font-medium text-foreground">Reports to</span> (who sits
                    above them). Connection lines follow that field — not RBAC roles.
                </p>

                {loading ? (
                    <div className="flex min-h-0 flex-1 items-center justify-center">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    </div>
                ) : !hasChart ? (
                    <Card className="min-h-0 flex-1">
                        <CardContent className="flex h-full flex-col items-center justify-center py-16 text-center text-muted-foreground space-y-2">
                            <Network className="h-10 w-10 mx-auto opacity-40" />
                            <p className="font-medium text-foreground">No hierarchy yet</p>
                            <p className="text-sm max-w-md mx-auto">
                                Set <span className="font-medium text-foreground">Reports to</span>{' '}
                                when adding staff, or use the pencil on a card after they exist.
                            </p>
                            <Button asChild variant="outline" className="mt-2">
                                <Link to="/admin/users">Go to People</Link>
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
                        <OrgCanvas
                            forest={data!.forest}
                            canEdit={canEdit}
                            onEditReportsTo={openEditReportsTo}
                            zoom={zoom}
                            setZoom={setZoom}
                            fitToken={fitToken}
                        />

                        {data!.needs_reporting_line.length > 0 && (
                            <div className="shrink-0 max-h-28 overflow-hidden rounded-lg border border-dashed border-amber-500/40 bg-amber-50/40 px-3 py-2 dark:bg-amber-950/20">
                                <p className="mb-1.5 text-xs font-medium text-foreground">
                                    Needs reporting line ({data!.needs_reporting_line.length})
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {data!.needs_reporting_line.slice(0, 8).map((node) => (
                                        <div key={`orphan-${node.id}`} className="flex items-center gap-1">
                                            <Link
                                                to={`/admin/users/${node.id}`}
                                                className="rounded border bg-background px-2 py-1 text-xs hover:underline"
                                            >
                                                {node.name}
                                            </Link>
                                            {canEdit && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6"
                                                    onClick={() => openEditReportsTo(node)}
                                                >
                                                    <Pencil className="h-3 w-3" />
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <Dialog
                open={!!editNode}
                onOpenChange={(open) => {
                    if (!open) setEditNode(null);
                }}
            >
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Change Reports to</DialogTitle>
                        <DialogDescription>
                            Choose who <strong>{editNode?.name}</strong> reports to. This moves
                            their box under that person on the chart.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-2">
                        <Label>Reports to</Label>
                        <Select value={editManagerId} onValueChange={setEditManagerId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select person" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">No one (top of chart)</SelectItem>
                                {managerChoices
                                    .filter((p) => !blockedManagerIds.has(p.id))
                                    .map((p) => (
                                        <SelectItem key={p.id} value={String(p.id)}>
                                            {p.name}
                                            {p.designation ? ` (${p.designation})` : ''}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            You can also edit this on the employee profile under People.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setEditNode(null)}
                            disabled={savingReportsTo}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={() => void saveReportsTo()}
                            disabled={savingReportsTo}
                        >
                            {savingReportsTo ? 'Saving…' : 'Save'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
