import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/layouts/app-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Fingerprint,
    Wifi,
    WifiOff,
    ScanFace,
    CreditCard,
    Plus,
    Trash2,
    RefreshCw,
    Activity,
    Users,
    Cpu,
    Clock,
    CircleHelp,
    Search,
    Calendar,
    X,
} from 'lucide-react';
import axios from '@/lib/axios';
import { handleApiError, handleApiResponse, showToast } from '@/lib/toast';
import { isDeviceOnline, useBiometricLive } from '@/hooks/use-biometric-live';
import AttendanceStats from '@/components/attendance/attendance-stats';
import { useAttendanceStats } from '@/hooks/use-attendance-stats';
import { usePermissions } from '@/hooks/use-permissions';

interface BiometricDevice {
    id: number;
    serial_number: string;
    name: string | null;
    model: string | null;
    ip_address: string | null;
    location: string | null;
    is_active: boolean;
    last_heartbeat: string | null;
    created_at: string | null;
}

interface BiometricPunch {
    id: number;
    device_serial: string;
    device_pin: string;
    punch_time: string;
    punch_type: number;
    verify_method: number;
    user_id: number | null;
    user_name: string | null;
    is_processed: number;
    created_at: string | null;
}

interface UserMapping {
    id: number;
    device_serial: string;
    device_pin: string;
    user_id: number;
    user_name: string | null;
    created_at: string | null;
}

interface BiometricStats {
    scope?: 'org' | 'self';
    total_devices?: number;
    active_devices?: number;
    today_punches?: number;
    total_mappings?: number;
    unmapped_punches?: number;
    last_heartbeat?: string | null;
}

interface HrmUser {
    id: number;
    name: string;
}

const verifyMethodLabel = (method: number) => {
    switch (method) {
        case 1: return { label: 'Fingerprint', icon: <Fingerprint className="h-3.5 w-3.5" /> };
        case 4: return { label: 'Card', icon: <CreditCard className="h-3.5 w-3.5" /> };
        case 15: return { label: 'Face', icon: <ScanFace className="h-3.5 w-3.5" /> };
        default: return { label: `Code ${method}`, icon: <Fingerprint className="h-3.5 w-3.5" /> };
    }
};

const formatPunchTime = (punchTime: string) => {
    const iso = punchTime.includes('T') ? punchTime : punchTime.replace(' ', 'T');
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
        return punchTime;
    }
    return d.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    });
};

const punchTypeLabel = (type: number) => {
    switch (type) {
        case 0: return { label: 'Check In', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' };
        case 1: return { label: 'Check Out', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' };
        case 2: return { label: 'Break Out', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' };
        case 3: return { label: 'Break In', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' };
        default: return { label: `Type ${type}`, color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400' };
    }
};

function timeAgo(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr + 'Z');
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

export default function BiometricIndex() {
    const navigate = useNavigate();
    const { hasPermission } = usePermissions();
    const canManage = hasPermission('manage-attendance');
    const { stats: attendanceStats, loading: attendanceStatsLoading } =
        useAttendanceStats('biometric');
    const [stats, setStats] = useState<BiometricStats | null>(null);
    const [devices, setDevices] = useState<BiometricDevice[]>([]);
    const [punches, setPunches] = useState<BiometricPunch[]>([]);
    const [mappings, setMappings] = useState<UserMapping[]>([]);
    const [users, setUsers] = useState<HrmUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [liveConnected, setLiveConnected] = useState(false);

    // Mapping dialog
    const [mapOpen, setMapOpen] = useState(false);
    const [mapForm, setMapForm] = useState({ device_serial: '', device_pin: '', user_id: '' });
    const [mapSaving, setMapSaving] = useState(false);

    // Setup guide dialog
    const [setupOpen, setSetupOpen] = useState(false);

    // Register device dialog
    const [registerOpen, setRegisterOpen] = useState(false);
    const [registerForm, setRegisterForm] = useState({ serial_number: '', name: 'BIO-PARK D01', location: '' });
    const [registerSaving, setRegisterSaving] = useState(false);

    const [punchSearch, setPunchSearch] = useState('');
    const [punchDate, setPunchDate] = useState('');
    const [punchSort, setPunchSort] = useState<'date_desc' | 'date_asc' | 'name_asc' | 'name_desc'>('date_desc');

    const filteredPunches = useMemo(() => {
        const q = punchSearch.trim().toLowerCase();
        let list = punches;
        if (punchDate) {
            list = list.filter((p) => p.punch_time.slice(0, 10) === punchDate);
        }
        if (q) {
            list = list.filter((p) => {
                const typeLabel = punchTypeLabel(p.punch_type).label.toLowerCase();
                const methodLabel = verifyMethodLabel(p.verify_method).label.toLowerCase();
                return (
                    (p.user_name?.toLowerCase().includes(q) ?? false) ||
                    p.device_pin.toLowerCase().includes(q) ||
                    p.device_serial.toLowerCase().includes(q) ||
                    p.punch_time.toLowerCase().includes(q) ||
                    typeLabel.includes(q) ||
                    methodLabel.includes(q)
                );
            });
        }

        const sorted = [...list];
        sorted.sort((a, b) => {
            if (punchSort === 'date_desc' || punchSort === 'date_asc') {
                const cmp = a.punch_time.localeCompare(b.punch_time);
                return punchSort === 'date_desc' ? -cmp : cmp;
            }
            const aName = (a.user_name || 'Unmapped').toLowerCase();
            const bName = (b.user_name || 'Unmapped').toLowerCase();
            const cmp = aName.localeCompare(bName) || a.punch_time.localeCompare(b.punch_time);
            return punchSort === 'name_asc' ? cmp : -cmp;
        });
        return sorted;
    }, [punches, punchSearch, punchDate, punchSort]);

    useEffect(() => {
        loadAll();
    }, []);

    const { connected: wsConnected } = useBiometricLive({
        onEvent: (ev) => {
            if (ev.type === 'connected') {
                refreshAll();
                return;
            }
            if (
                ev.type === 'device_online' ||
                ev.type === 'device_heartbeat' ||
                ev.type === 'punches_received'
            ) {
                void Promise.all([loadStats(), loadDevices(), loadPunches()]);
            }
        },
    });

    useEffect(() => {
        setLiveConnected(wsConnected);
    }, [wsConnected]);

    // Fallback poll if WebSocket drops (device still uses HTTP heartbeat)
    useEffect(() => {
        const interval = setInterval(() => {
            void Promise.all([loadStats(), loadDevices(), loadPunches()]);
        }, 30000);
        return () => clearInterval(interval);
    }, []);

    const loadAll = async () => {
        setLoading(true);
        const tasks = [loadStats(), loadPunches()];
        if (canManage) {
            tasks.push(loadDevices(), loadMappings(), loadUsers());
        }
        await Promise.all(tasks);
        setLoading(false);
    };

    const refreshAll = async () => {
        setRefreshing(true);
        const tasks = [loadStats(), loadPunches()];
        if (canManage) {
            tasks.push(loadDevices(), loadMappings());
        }
        await Promise.all(tasks);
        setRefreshing(false);
    };

    const loadStats = async () => {
        try {
            const res = await axios.get('/admin/biometric/stats');
            setStats(res.data.data);
        } catch (error) {
            handleApiError(error);
        }
    };

    const loadDevices = async () => {
        try {
            const res = await axios.get('/admin/biometric/devices');
            setDevices(res.data.data || []);
        } catch (error) {
            handleApiError(error);
        }
    };

    const loadPunches = async () => {
        try {
            const res = await axios.get('/admin/biometric/punches');
            setPunches(res.data.data || []);
        } catch (error) {
            handleApiError(error);
        }
    };

    const loadMappings = async () => {
        try {
            const res = await axios.get('/admin/biometric/mapping');
            setMappings(res.data.data || []);
        } catch (error) {
            handleApiError(error);
        }
    };

    const loadUsers = async () => {
        try {
            const res = await axios.get('/admin/attendance/users');
            setUsers(res.data.data || []);
        } catch (error) {
            handleApiError(error);
        }
    };

    const handleSaveMapping = async () => {
        if (!mapForm.device_serial || !mapForm.device_pin || !mapForm.user_id) return;
        setMapSaving(true);
        try {
            const res = await axios.post('/admin/biometric/mapping', {
                device_serial: mapForm.device_serial,
                device_pin: mapForm.device_pin,
                user_id: parseInt(mapForm.user_id),
            });
            handleApiResponse(res);
            setMapOpen(false);
            setMapForm({ device_serial: '', device_pin: '', user_id: '' });
            await Promise.all([loadMappings(), loadPunches(), loadStats()]);
        } catch (error) {
            handleApiError(error);
        } finally {
            setMapSaving(false);
        }
    };

    const handleDeleteMapping = async (id: number) => {
        if (!confirm('Remove this PIN mapping?')) return;
        try {
            await axios.delete(`/admin/biometric/mapping/${id}`);
            await loadMappings();
        } catch (error) {
            handleApiError(error);
        }
    };

    const handleDeleteDevice = async (id: number) => {
        if (!confirm('Remove this device?')) return;
        try {
            await axios.delete(`/admin/biometric/devices/${id}`);
            await loadDevices();
        } catch (error) {
            handleApiError(error);
        }
    };

    const handleRegisterDevice = async () => {
        const sn = registerForm.serial_number.trim();
        if (!sn || sn.toLowerCase() === 'unknown') {
            handleApiError(new Error('Enter the real serial number from the device (Menu → System → Device Info).'));
            return;
        }
        setRegisterSaving(true);
        try {
            await axios.post('/admin/biometric/devices', {
                serial_number: sn,
                name: registerForm.name.trim() || 'BIO-PARK D01',
                location: registerForm.location.trim(),
            });
            showToast({ type: 'success', message: 'Device registered — reboot the device to connect.' });
            setRegisterOpen(false);
            setRegisterForm({ serial_number: '', name: 'BIO-PARK D01', location: '' });
            await loadDevices();
        } catch (error) {
            handleApiError(error);
        } finally {
            setRegisterSaving(false);
        }
    };

    const breadcrumbs = [{ label: 'Biometric Devices', href: '/admin/biometric' }];

    if (loading) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                <div className="flex items-center justify-center min-h-96">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <div className="space-y-6">
                {/* Hero Header */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#e8f2fd] via-[#d0e4f8] to-[#c4d8f0] dark:from-[#0d1e33] dark:via-[#0a1828] dark:to-[#071220] px-6 py-5 shadow-sm border border-white/60 dark:border-white/10">
                    <div className="pointer-events-none absolute -top-10 -right-10 w-48 h-48 opacity-20">
                        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                            <path fill="#071b3a" d="M44.7,-76.4C58.4,-69.7,70.3,-58.6,77.9,-44.9C85.5,-31.2,88.7,-15.6,87.4,-0.8C86,14,80,28,72.1,40.5C64.2,53,54.2,64,42.1,71.3C30,78.6,15,82.3,0.1,82.1C-14.8,81.9,-29.6,77.8,-42.7,70.5C-55.8,63.2,-67.3,52.7,-74.5,39.5C-81.7,26.3,-84.7,10.5,-83.1,-4.9C-81.6,-20.3,-75.5,-35.2,-66.3,-47.4C-57.1,-59.6,-44.8,-69.1,-31.6,-76.1C-18.4,-83.1,-4.6,-87.6,8.2,-86.2C21,-84.8,31,-83.1,44.7,-76.4Z" transform="translate(100 100)" />
                        </svg>
                    </div>
                    <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#071b3a]/15 dark:bg-white/10 border border-[#071b3a]/20 dark:border-white/10 shadow-inner">
                                <Fingerprint className="h-6 w-6 text-[#071b3a] dark:text-blue-300" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight text-[#001f3f] dark:text-white">
                                    Biometric Devices
                                </h1>
                                <p className="text-sm text-[#1e3a5f]/60 dark:text-blue-200/60 mt-1">
                                    Manage attendance devices, punch logs & employee PIN mappings
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2 items-center">
                            <Badge
                                variant="outline"
                                className={
                                    liveConnected
                                        ? 'border-green-500 text-green-700 bg-green-50 dark:bg-green-950/30'
                                        : 'border-orange-400 text-orange-700'
                                }
                            >
                                <span
                                    className={`mr-1.5 inline-block h-2 w-2 rounded-full ${
                                        liveConnected ? 'bg-green-500 animate-pulse' : 'bg-orange-400'
                                    }`}
                                />
                                {liveConnected ? 'Live' : 'Reconnecting…'}
                            </Badge>
                            <Button variant="outline" size="sm" onClick={() => setSetupOpen(true)}>
                                <CircleHelp className="mr-2 h-4 w-4" />
                                How to Connect
                            </Button>
                            <Button variant="outline" size="sm" onClick={refreshAll} disabled={refreshing}>
                                <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                                Refresh
                            </Button>
                            {canManage && (
                                <>
                                    <Button variant="outline" size="sm" onClick={() => setRegisterOpen(true)}>
                                        <Plus className="mr-2 h-4 w-4" />
                                        Register Device
                                    </Button>
                                    <Button size="sm" onClick={() => setMapOpen(true)}>
                                        <Plus className="mr-2 h-4 w-4" />
                                        Map PIN
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Device ops stats — managers only */}
                {canManage && stats?.scope !== 'self' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Devices</span>
                                <Cpu className="h-4 w-4 text-blue-500" />
                            </div>
                            <p className="text-2xl font-bold">{stats?.total_devices || 0}</p>
                            <p className="text-xs text-muted-foreground mt-1">{stats?.active_devices || 0} active</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today's Punches</span>
                                <Activity className="h-4 w-4 text-green-500" />
                            </div>
                            <p className="text-2xl font-bold">{stats?.today_punches || 0}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Mapped Users</span>
                                <Users className="h-4 w-4 text-purple-500" />
                            </div>
                            <p className="text-2xl font-bold">{stats?.total_mappings || 0}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Unmapped</span>
                                <Clock className="h-4 w-4 text-orange-500" />
                            </div>
                            <p className="text-2xl font-bold text-orange-600">{stats?.unmapped_punches || 0}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Signal</span>
                                {stats?.last_heartbeat ? <Wifi className="h-4 w-4 text-green-500" /> : <WifiOff className="h-4 w-4 text-red-500" />}
                            </div>
                            <p className="text-sm font-semibold">{timeAgo(stats?.last_heartbeat ?? null)}</p>
                        </CardContent>
                    </Card>
                </div>
                )}

                {!canManage && stats?.scope === 'self' && (
                    <Card>
                        <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground">
                                Your punches today:{' '}
                                <span className="font-semibold text-foreground">
                                    {stats.today_punches ?? 0}
                                </span>
                            </p>
                        </CardContent>
                    </Card>
                )}

                {/* Tabs */}
                <Tabs defaultValue="statistics" className="w-full">
                    <TabsList className={`grid w-full h-auto ${canManage ? 'grid-cols-4' : 'grid-cols-2'}`}>
                        <TabsTrigger value="statistics">Statistics</TabsTrigger>
                        <TabsTrigger value="punches">{canManage ? 'Punch Log' : 'My Punches'}</TabsTrigger>
                        {canManage && (
                            <>
                                <TabsTrigger value="mapping">PIN Mapping</TabsTrigger>
                                <TabsTrigger value="devices">Devices</TabsTrigger>
                            </>
                        )}
                    </TabsList>

                    <TabsContent value="statistics" className="space-y-4">
                        <AttendanceStats
                            stats={attendanceStats}
                            loading={attendanceStatsLoading}
                            title="Biometric attendance statistics"
                        />
                        {!canManage && (
                            <p className="text-sm text-muted-foreground">
                                You see only attendance synced from your biometric punches. Device
                                administration requires{' '}
                                <code className="rounded bg-muted px-1">manage-attendance</code>.
                            </p>
                        )}
                    </TabsContent>

                    {/* Punch Log Tab */}
                    <TabsContent value="punches">
                        <Card>
                            <CardHeader>
                                <div className="flex flex-col gap-4">
                                    <CardTitle className="text-base">
                                        Recent Punch Records
                                        {punches.length > 0 && (
                                            <span className="ml-2 text-sm font-normal text-muted-foreground">
                                                ({filteredPunches.length} of {punches.length})
                                            </span>
                                        )}
                                    </CardTitle>
                                    {punches.length > 0 && (
                                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                                            <div className="relative w-full sm:flex-1 sm:max-w-sm">
                                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    placeholder="Search employee, PIN, device..."
                                                    value={punchSearch}
                                                    onChange={(e) => setPunchSearch(e.target.value)}
                                                    className="pl-8"
                                                />
                                            </div>
                                            <div className="relative w-full sm:w-[180px]">
                                                <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                                                <Input
                                                    type="date"
                                                    value={punchDate}
                                                    onChange={(e) => setPunchDate(e.target.value)}
                                                    className="pl-8"
                                                    title="Filter by day"
                                                />
                                            </div>
                                            {punchDate && (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full sm:w-auto"
                                                    onClick={() => setPunchDate('')}
                                                >
                                                    <X className="mr-1.5 h-3.5 w-3.5" />
                                                    All dates
                                                </Button>
                                            )}
                                            <Select value={punchSort} onValueChange={(v) => setPunchSort(v as typeof punchSort)}>
                                                <SelectTrigger className="w-full sm:w-[200px]">
                                                    <SelectValue placeholder="Sort by" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="date_desc">Date (newest first)</SelectItem>
                                                    <SelectItem value="date_asc">Date (oldest first)</SelectItem>
                                                    <SelectItem value="name_asc">Name (A–Z)</SelectItem>
                                                    <SelectItem value="name_desc">Name (Z–A)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent>
                                {punches.length === 0 ? (
                                    <p className="text-center text-muted-foreground py-8">
                                        No punches received yet. Connect your BIO-PARK device to start receiving data.
                                    </p>
                                ) : filteredPunches.length === 0 ? (
                                    <p className="text-center text-muted-foreground py-8">
                                        No punches found for the selected date or search.
                                    </p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Time</TableHead>
                                                    <TableHead>PIN</TableHead>
                                                    <TableHead>Employee</TableHead>
                                                    <TableHead>Type</TableHead>
                                                    <TableHead>Method</TableHead>
                                                    <TableHead>Device</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {filteredPunches.map((punch) => {
                                                    const pType = punchTypeLabel(punch.punch_type);
                                                    const vMethod = verifyMethodLabel(punch.verify_method);
                                                    return (
                                                        <TableRow key={punch.id}>
                                                            <TableCell className="font-mono text-sm">
                                                                {formatPunchTime(punch.punch_time)}
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge variant="outline" className="font-mono">{punch.device_pin}</Badge>
                                                            </TableCell>
                                                            <TableCell>
                                                                {punch.user_name ? (
                                                                    <span className="font-medium">{punch.user_name}</span>
                                                                ) : (
                                                                    <span className="text-muted-foreground italic text-xs">Unmapped</span>
                                                                )}
                                                            </TableCell>
                                                            <TableCell>
                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${pType.color}`}>
                                                                    {pType.label}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell>
                                                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                                                    {vMethod.icon} {vMethod.label}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell className="text-xs text-muted-foreground font-mono">
                                                                {punch.device_serial.slice(0, 12)}
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* PIN Mapping Tab */}
                    <TabsContent value="mapping">
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-base">Device PIN → Employee Mapping</CardTitle>
                                    <Button size="sm" onClick={() => setMapOpen(true)}>
                                        <Plus className="mr-2 h-4 w-4" /> Add Mapping
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {mappings.length === 0 ? (
                                    <p className="text-center text-muted-foreground py-8">
                                        No mappings configured. Add a mapping to link device PINs to employees.
                                    </p>
                                ) : (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Device Serial</TableHead>
                                                <TableHead>PIN</TableHead>
                                                <TableHead>Employee</TableHead>
                                                <TableHead>Created</TableHead>
                                                <TableHead></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {mappings.map((m) => (
                                                <TableRow key={m.id}>
                                                    <TableCell className="font-mono text-sm">{m.device_serial}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className="font-mono">{m.device_pin}</Badge>
                                                    </TableCell>
                                                    <TableCell className="font-medium">{m.user_name || `User #${m.user_id}`}</TableCell>
                                                    <TableCell className="text-xs text-muted-foreground">
                                                        {m.created_at ? new Date(m.created_at).toLocaleDateString() : '-'}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Button variant="ghost" size="icon" onClick={() => handleDeleteMapping(m.id)}>
                                                            <Trash2 className="h-4 w-4 text-destructive" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Devices Tab */}
                    <TabsContent value="devices">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Connected Devices</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {devices.length === 0 ? (
                                    <div className="text-center py-8 space-y-3">
                                        <Cpu className="h-12 w-12 mx-auto text-muted-foreground/30" />
                                        <p className="text-muted-foreground">
                                            No devices registered yet.
                                        </p>
                                        <p className="text-xs text-muted-foreground max-w-md mx-auto">
                                            Click <strong>Register Device</strong> with the serial from the device menu, then point the device to this PC&apos;s IP on port 7788.
                                        </p>
                                        <Button size="sm" className="mt-2" onClick={() => setRegisterOpen(true)}>
                                            <Plus className="mr-2 h-4 w-4" />
                                            Register Device
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="grid gap-4">
                                        {devices.map((device) => (
                                            <div key={device.id} className="flex items-center justify-between p-4 border rounded-lg">
                                                <div className="flex items-center gap-4">
                                                    <div
                                                        className={`h-3 w-3 rounded-full ${
                                                            isDeviceOnline(device.last_heartbeat)
                                                                ? 'bg-green-500 animate-pulse'
                                                                : 'bg-red-400'
                                                        }`}
                                                        title={
                                                            isDeviceOnline(device.last_heartbeat)
                                                                ? 'Online (heartbeat < 10 min)'
                                                                : 'Offline — check device server IP/port 7788'
                                                        }
                                                    />
                                                    <div>
                                                        <p className="font-medium">{device.name || device.serial_number}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            SN: {device.serial_number} &bull; IP: {device.ip_address || 'Unknown'}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">
                                                            Last heartbeat: {timeAgo(device.last_heartbeat)}
                                                        </p>
                                                    </div>
                                                </div>
                                                <Button variant="ghost" size="icon" onClick={() => handleDeleteDevice(device.id)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>

            {/* BIO-PARK setup guide */}
            <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Wifi className="h-4 w-4 text-blue-600" />
                            Connect BIO-PARK D01 to HR Daddy
                        </DialogTitle>
                        <DialogDescription>
                            Step-by-step setup for iClock / ADMS devices on your local network.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 text-sm">
                        <p className="text-muted-foreground">
                            Your device uses the <strong>iClock / ADMS</strong> protocol. It must reach this app&apos;s
                            backend on the <strong>same network</strong> (e.g. INFOPARK Wi‑Fi). The device cannot use
                            <code className="mx-1 bg-muted px-1 rounded">data.etimeoffice</code> — point it to your PC/server instead.
                        </p>
                        <ol className="list-decimal list-inside space-y-3 text-muted-foreground">
                            <li>
                                Start the backend (API on <strong>3001</strong>, device port <strong>7788</strong> automatically):
                                <pre className="mt-1 rounded-md bg-muted p-2 text-xs overflow-x-auto">{`cd backend
cargo run`}</pre>
                                <span className="text-xs">Your <code>.env</code> should have <code>HOST=0.0.0.0</code> and <code>BIOMETRIC_PORT=7788</code> to match <em>SerPortNo</em> on the device.</span>
                            </li>
                            <li>
                                Find your PC&apos;s LAN IP (same subnet as the device, e.g. <code>172.16.1.x</code>):
                                run <code className="bg-muted px-1 rounded">ipconfig</code> in PowerShell.
                            </li>
                            <li>
                                On the device: <strong>Menu → Server</strong>:
                                <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                                    <li><strong>Server Req:</strong> Yes</li>
                                    <li><strong>Use domainNm:</strong> <span className="text-destructive font-medium">No</span> (turn off cloud domain)</li>
                                    <li><strong>Server IP:</strong> your PC IP (not 8.219.14.147)</li>
                                    <li><strong>SerPortNo:</strong> 7788 (or 3001 if you changed backend port)</li>
                                    <li><strong>Heartbeat:</strong> 3</li>
                                </ul>
                            </li>
                            <li>
                                On the device: <strong>Menu → System → Device Info</strong> — note the <strong>Serial Number</strong>.
                                In HRM click <strong>Register Device</strong> and enter that exact SN <em>before</em> rebooting.
                            </li>
                            <li>Save server settings and reboot the device. It should show <strong>online</strong> (green dot) within a few minutes.</li>
                            <li>
                                Enroll employees on the device (each gets a <strong>PIN</strong>). In HRM: <strong>Map PIN</strong> → link PIN to employee.
                                Punches then appear in <strong>Punch Log</strong> and update <strong>Attendance</strong>.
                            </li>
                        </ol>
                        <p className="text-xs text-muted-foreground">
                            The device connects via HTTP every few minutes (not a true WebSocket). This page uses a{' '}
                            <strong>Live</strong> WebSocket to the app so punches and heartbeats appear instantly when the device syncs.
                            Delete wrong entries (e.g. SN <code>unknown</code> or old test devices). Only keep the row whose SN matches the device exactly.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setSetupOpen(false)}>Got it</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Register Device Dialog */}
            <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Register Biometric Device</DialogTitle>
                        <DialogDescription>
                            Enter the serial number from the device (Menu → System → Device Info). It must match exactly or punches will be ignored.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Serial Number *</Label>
                            <Input
                                placeholder="e.g. D01A1B2C3D4"
                                value={registerForm.serial_number}
                                onChange={(e) => setRegisterForm({ ...registerForm, serial_number: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Display Name</Label>
                            <Input
                                value={registerForm.name}
                                onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Location (optional)</Label>
                            <Input
                                placeholder="e.g. Main entrance"
                                value={registerForm.location}
                                onChange={(e) => setRegisterForm({ ...registerForm, location: e.target.value })}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRegisterOpen(false)}>Cancel</Button>
                        <Button onClick={handleRegisterDevice} disabled={registerSaving}>
                            {registerSaving ? 'Saving…' : 'Register'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add Mapping Dialog */}
            <Dialog open={mapOpen} onOpenChange={setMapOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Map Device PIN to Employee</DialogTitle>
                        <DialogDescription>
                            Link a biometric device PIN number to an employee so their punches are automatically recorded as attendance.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Device Serial Number</Label>
                            {devices.length > 0 ? (
                                <Select value={mapForm.device_serial} onValueChange={(v) => setMapForm({ ...mapForm, device_serial: v })}>
                                    <SelectTrigger><SelectValue placeholder="Select device" /></SelectTrigger>
                                    <SelectContent>
                                        {devices.map((d) => (
                                            <SelectItem key={d.id} value={d.serial_number}>
                                                {d.name || d.serial_number}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <Input
                                    placeholder="Enter device serial number"
                                    value={mapForm.device_serial}
                                    onChange={(e) => setMapForm({ ...mapForm, device_serial: e.target.value })}
                                />
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label>Device PIN</Label>
                            <Input
                                placeholder="e.g. 1, 2, 3..."
                                value={mapForm.device_pin}
                                onChange={(e) => setMapForm({ ...mapForm, device_pin: e.target.value })}
                            />
                            <p className="text-xs text-muted-foreground">The PIN number assigned to the employee on the biometric device</p>
                        </div>
                        <div className="space-y-2">
                            <Label>Employee</Label>
                            <Select value={mapForm.user_id} onValueChange={(v) => setMapForm({ ...mapForm, user_id: v })}>
                                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                                <SelectContent>
                                    {users.map((u) => (
                                        <SelectItem key={u.id} value={u.id.toString()}>
                                            {u.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setMapOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveMapping} disabled={mapSaving}>
                            {mapSaving ? 'Saving...' : 'Save Mapping'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
