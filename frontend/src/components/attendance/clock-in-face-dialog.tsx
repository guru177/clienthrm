import { Camera, CheckCircle2, Loader2, MapPin, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type * as FaceApi from '@vladmandic/face-api';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

// Prefer local models in public/face-models; fallback to CDN when missing.
const FACE_MODEL_PATH_CANDIDATES = [
    '/face-models',
    'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model',
    'https://unpkg.com/@vladmandic/face-api/model',
];
// Euclidean distance threshold for the 128-dim face recognition embedding.
// Same person (photo vs live): typically < 0.45 | Different person: typically > 0.55
const FACE_DISTANCE_THRESHOLD = 0.50;
// One solid frame is enough for speed; escalate only if match is borderline.
const VERIFICATION_FRAMES = 1;
const BORDERLINE_RETRY_FRAMES = 2;

let faceApiModule: typeof FaceApi | null = null;
let locationSessionCache: { at: number; data: LocationPayload } | null = null;
const LOCATION_CACHE_TTL_MS = 90_000;

async function loadFaceApi(): Promise<typeof FaceApi> {
    if (!faceApiModule) {
        faceApiModule = await import('@vladmandic/face-api');
    }
    return faceApiModule;
}

type GeoLocationPayload = {
    lat: number;
    lng: number;
    accuracy?: number | null;
};

type IpLocationPayload = {
    ip?: string;
    city?: string;
    region?: string;
    country?: string;
    lat?: number | null;
    lng?: number | null;
};

type LocationPayload = {
    geo: GeoLocationPayload;
    ip: IpLocationPayload;
};

export type ClockInVerificationPayload = {
    face_verified: boolean;
    face_match_score: number | null;
    location: LocationPayload;
};

type ClockInFaceDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onVerify: (payload: ClockInVerificationPayload) => void;
    userPhotoUrl: string | null;
    busy?: boolean;
};

export default function ClockInFaceDialog({
    open,
    onOpenChange,
    onVerify,
    userPhotoUrl,
    busy = false,
}: ClockInFaceDialogProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const modelsLoadedRef = useRef(false);
    const referenceDescriptorRef = useRef<Float32Array | null>(null);

    const [modelsLoading, setModelsLoading] = useState(false);
    const [modelsReady, setModelsReady] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const [cameraStatus, setCameraStatus] = useState<'idle' | 'pending' | 'granted' | 'denied'>('idle');
    const [locationStatus, setLocationStatus] = useState<'idle' | 'pending' | 'granted' | 'denied'>('idle');
    const [locationLoading, setLocationLoading] = useState(false);
    const [locationData, setLocationData] = useState<LocationPayload | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [permissionsGranted, setPermissionsGranted] = useState(false);
    const [debugInfo, setDebugInfo] = useState<{ frames: number[]; avg: number; passed: boolean } | null>(null);
    const activeModelPathRef = useRef<string | null>(null);

    const skipFaceVerification = !userPhotoUrl;
    const isReady = locationData && (skipFaceVerification || (modelsReady && cameraReady));
    const isInstalledApp =
        typeof window !== 'undefined' &&
        (window.matchMedia('(display-mode: standalone)').matches ||
            window.matchMedia('(display-mode: fullscreen)').matches ||
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            Boolean((navigator as any).standalone));

    useEffect(() => {
        if (!open) {
            stopCamera();
            setError(null);
            setCameraReady(false);
            setCameraStatus('idle');
            // Keep last GPS in session so reopening is instant.
            if (locationSessionCache && Date.now() - locationSessionCache.at < LOCATION_CACHE_TTL_MS) {
                setLocationData(locationSessionCache.data);
                setLocationStatus('granted');
            } else {
                setLocationData(null);
                setLocationStatus('idle');
            }
            setPermissionsGranted(false);
            return;
        }

        setError(null);
        if (modelsLoadedRef.current) {
            setModelsReady(true);
        }
        if (locationSessionCache && Date.now() - locationSessionCache.at < LOCATION_CACHE_TTL_MS) {
            setLocationData(locationSessionCache.data);
            setLocationStatus('granted');
        }
        // Check existing permission states without prompting
        void checkExistingPermissions();
    }, [open]);

    // Once required permissions are granted, proceed with loading
    useEffect(() => {
        if (skipFaceVerification && locationStatus === 'granted') {
            setPermissionsGranted(true);
        } else if (cameraStatus === 'granted' && locationStatus === 'granted') {
            setPermissionsGranted(true);
        }
    }, [cameraStatus, locationStatus, skipFaceVerification]);

    // Video element only mounts after permissionsGranted — attach the already-opened stream.
    useEffect(() => {
        if (!permissionsGranted || skipFaceVerification) return;
        const stream = streamRef.current;
        const video = videoRef.current;
        if (!stream || !video) return;

        video.srcObject = stream;
        void video
            .play()
            .then(() => setCameraReady(true))
            .catch(() => setCameraReady(true)); // still usable for capture even if autoplay is blocked
    }, [permissionsGranted, skipFaceVerification, cameraStatus]);

    const checkExistingPermissions = async () => {
        try {
            const cameraPerm = await navigator.permissions.query({ name: 'camera' as PermissionName });
            if (cameraPerm.state === 'granted') {
                setCameraStatus('granted');
                void startCamera();
                void loadModels();
            }
        } catch {
            // permissions API may not support camera query in all browsers
        }
        try {
            const geoPerm = await navigator.permissions.query({ name: 'geolocation' });
            if (geoPerm.state === 'granted') {
                setLocationStatus('granted');
                void loadLocation();
            }
        } catch {
            // ignore
        }
    };

    const requestCameraPermission = async () => {
        setCameraStatus('pending');
        setError(null);
        await startCamera();
    };

    const requestLocationPermission = async () => {
        setLocationStatus('pending');
        setError(null);
        await loadLocation();
    };

    const requestAllPermissions = async () => {
        setError(null);
        // Mobile Chrome / TWA often drop the second prompt if camera + location fire together.
        if (!skipFaceVerification && cameraStatus !== 'granted') {
            setCameraStatus('pending');
            await startCamera();
        }
        if (locationStatus !== 'granted') {
            setLocationStatus('pending');
            await loadLocation();
        }
    };

    const handleClockInWithoutFace = () => {
        if (!locationData) return;
        onVerify({
            face_verified: false,
            face_match_score: null,
            location: locationData,
        });
    };

    const startCamera = async () => {
        // Soft timeout so mobile never sticks on "Requesting permission..." forever.
        const timeoutMs = 20_000;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(
                () => reject(Object.assign(new Error('Camera request timed out'), { name: 'TimeoutError' })),
                timeoutMs,
            );
        });

        try {
            // Prefer front camera; fall back to any camera if facingMode is unsupported.
            const getStream = async () => {
                try {
                    return await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 } },
                        audio: false,
                    });
                } catch (firstErr) {
                    const name = firstErr instanceof DOMException ? firstErr.name : '';
                    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
                        throw firstErr;
                    }
                    return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                }
            };

            const stream = await Promise.race([getStream(), timeoutPromise]);
            // Stop any previous stream before replacing.
            streamRef.current?.getTracks().forEach((t) => t.stop());
            streamRef.current = stream;

            // Mark granted immediately — the <video> may not be mounted until permissionsGranted.
            setCameraStatus('granted');
            void loadModels();

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                try {
                    await videoRef.current.play();
                } catch {
                    /* autoplay can fail; still proceed */
                }
                setCameraReady(true);
            }
        } catch (err) {
            const name = err instanceof DOMException || err instanceof Error ? err.name : '';
            streamRef.current?.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
            setCameraReady(false);
            setCameraStatus('denied');
            if (name === 'TimeoutError') {
                setError(
                    isInstalledApp
                        ? 'Camera request timed out. Check Settings → Apps → HR Daddy → Permissions → Camera, then tap Retry.'
                        : 'Camera request timed out. Allow camera access and try again.',
                );
            } else if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
                setError(
                    isInstalledApp
                        ? 'Camera was denied. On Android: Settings → Apps → HR Daddy → Permissions → Camera → Allow, then tap Retry.'
                        : 'Camera permission was denied. Allow camera access in your browser settings and try again.',
                );
            } else if (name === 'NotFoundError') {
                setError('No camera was found on this device.');
            } else {
                setError('Unable to open the camera. Check permissions and try again.');
            }
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    };

    const stopCamera = () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        const stream = videoRef.current?.srcObject as MediaStream | null;
        stream?.getTracks().forEach((track) => track.stop());
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setCameraReady(false);
    };

    const loadImageElement = async (src: string): Promise<HTMLImageElement> => {
        return await new Promise((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = 'anonymous';
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('Failed to load image'));
            image.src = src;
        });
    };

    const resolveWorkingModelPath = async (): Promise<string | null> => {
        const probeFile = 'ssd_mobilenetv1_model-weights_manifest.json';
        for (const candidate of FACE_MODEL_PATH_CANDIDATES) {
            try {
                const res = await fetch(`${candidate}/${probeFile}`, {
                    method: 'GET',
                    cache: 'no-store',
                });
                if (!res.ok) continue;
                const text = await res.text();
                // Vite can return index.html for missing local assets (200 + <!DOCTYPE...>).
                // Validate this is actual manifest JSON before selecting the candidate.
                if (text.trimStart().startsWith('<')) continue;
                const parsed = JSON.parse(text) as Array<{ paths?: string[]; weights?: unknown }>;
                if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.weights) {
                    const firstShard = parsed[0]?.paths?.[0];
                    if (!firstShard) continue;
                    // Ensure shard binary is also reachable, not just the manifest.
                    const shardRes = await fetch(`${candidate}/${firstShard}`, {
                        method: 'GET',
                        cache: 'no-store',
                    });
                    if (!shardRes.ok) continue;
                    return candidate;
                }
            } catch {
                // keep trying next candidate
            }
        }
        return null;
    };

    const loadModels = async () => {
        if (modelsLoadedRef.current || modelsLoading) {
            return;
        }

        if (!userPhotoUrl) {
            return;
        }

        setModelsLoading(true);
        try {
            const faceapi = await loadFaceApi();
            const modelPath = activeModelPathRef.current ?? (await resolveWorkingModelPath());
            if (!modelPath) {
                setError(
                    'Face models are unavailable. Add model files to frontend/public/face-models or allow internet access for CDN fallback.',
                );
                return;
            }
            activeModelPathRef.current = modelPath;

            // Load required nets (detection + landmarks + recognition embedding)
            await Promise.all([
                faceapi.nets.ssdMobilenetv1.loadFromUri(modelPath),
                faceapi.nets.faceLandmark68Net.loadFromUri(modelPath),
                faceapi.nets.faceRecognitionNet.loadFromUri(modelPath),
            ]);

            // Load reference image directly; user photos are served from same app domain.
            const referenceImage = await loadImageElement(userPhotoUrl);

            const detection = await faceapi
                .detectSingleFace(referenceImage, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (!detection) {
                setError('No face detected in your profile photo. Please upload a clear front-facing photo.');
                return;
            }

            referenceDescriptorRef.current = detection.descriptor;
            modelsLoadedRef.current = true;
            setModelsReady(true);
        } catch (e) {
            console.error('Face model init failed:', e);
            setError(
                `Unable to initialize face detection. Model source: ${activeModelPathRef.current ?? 'not resolved'}.`,
            );
        } finally {
            setModelsLoading(false);
        }
    };

    const fetchIpLocation = async (): Promise<IpLocationPayload> => {
        const fallback: IpLocationPayload = {
            ip: 'unknown',
            city: undefined,
            region: undefined,
            country: undefined,
            lat: null,
            lng: null,
        };

        try {
            const ipResponse = await fetch('https://ipapi.co/json/', {
                signal: AbortSignal.timeout(2500),
                headers: { Accept: 'application/json' },
            });
            if (!ipResponse.ok) {
                return fallback;
            }

            const ipData = (await ipResponse.json()) as {
                ip?: string;
                city?: string;
                region?: string;
                country_name?: string;
                latitude?: number;
                longitude?: number;
                error?: boolean;
            };
            if (ipData.error || !ipData.ip) {
                return fallback;
            }

            return {
                ip: ipData.ip,
                city: ipData.city,
                region: ipData.region,
                country: ipData.country_name,
                lat: ipData.latitude ?? null,
                lng: ipData.longitude ?? null,
            };
        } catch {
            return fallback;
        }
    };

    const getGeoPosition = (options: PositionOptions): Promise<GeolocationPosition> =>
        new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported'));
                return;
            }
            navigator.geolocation.getCurrentPosition(resolve, reject, options);
        });

    const loadLocation = async () => {
        if (locationLoading) {
            return;
        }

        if (!navigator.geolocation) {
            setError('Geolocation is not supported by this browser.');
            setLocationStatus('denied');
            return;
        }

        if (locationSessionCache && Date.now() - locationSessionCache.at < LOCATION_CACHE_TTL_MS) {
            setLocationData(locationSessionCache.data);
            setLocationStatus('granted');
            return;
        }

        setLocationLoading(true);
        setError(null);

        // Prefer a fast cached / low-accuracy fix; avoid long high-accuracy waits.
        const attempts: PositionOptions[] = [
            { enableHighAccuracy: false, timeout: 4000, maximumAge: 120_000 },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 30_000 },
            { enableHighAccuracy: false, timeout: 6000, maximumAge: 300_000 },
        ];

        let lastError: GeolocationPositionError | Error | null = null;

        try {
            for (const options of attempts) {
                try {
                    const position = await getGeoPosition(options);
                    const geo: GeoLocationPayload = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                    };
                    const payload: LocationPayload = { geo, ip: { ip: 'pending' } };
                    locationSessionCache = { at: Date.now(), data: payload };
                    setLocationStatus('granted');
                    setLocationData(payload);
                    setLocationLoading(false);
                    // IP enrichment must never block clock-in readiness.
                    void fetchIpLocation().then((ipInfo) => {
                        const next = { geo, ip: ipInfo };
                        locationSessionCache = { at: Date.now(), data: next };
                        setLocationData(next);
                    });
                    return;
                } catch (err) {
                    lastError = err as GeolocationPositionError | Error;
                    const geoErr = err as GeolocationPositionError;
                    if (geoErr?.code === 1) {
                        break;
                    }
                }
            }

            const geoErr = lastError as GeolocationPositionError | undefined;
            if (geoErr && 'code' in geoErr && geoErr.code === 1) {
                setLocationStatus('denied');
                setError(
                    isInstalledApp
                        ? 'Location was denied. On Android: Settings → Apps → HR Daddy → Permissions → Location → Allow, then tap Retry.'
                        : 'Location permission was denied. Please allow location access in your browser settings and try again.',
                );
            } else if (geoErr && 'code' in geoErr && geoErr.code === 3) {
                setLocationStatus('denied');
                setError(
                    isInstalledApp
                        ? 'Location timed out. Turn on device Location, then tap Retry.'
                        : 'Location request timed out. Enable location services or click Retry Location below.',
                );
            } else {
                setLocationStatus('denied');
                setError('Unable to determine your location. Ensure location services are enabled and try again.');
            }
        } finally {
            setLocationLoading(false);
        }
    };

    const handleVerify = async () => {
        if (!referenceDescriptorRef.current) {
            setError('Face reference data is not ready.');
            return;
        }

        if (!locationData) {
            setError('Location permission is required to clock in.');
            return;
        }

        if (!videoRef.current || !canvasRef.current) {
            setError('Camera is not ready.');
            return;
        }

        setError(null);
        setDebugInfo(null);

        const faceapi = await loadFaceApi();

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) {
            setError('Unable to capture camera frame.');
            return;
        }

        // Capture one frame fast; only add more if the score is borderline.
        const distances: number[] = [];
        const captureFrame = async (): Promise<number | null> => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            const detection = await faceapi
                .detectSingleFace(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (!detection) return null;
            return faceapi.euclideanDistance(referenceDescriptorRef.current!, detection.descriptor);
        };

        for (let frame = 0; frame < VERIFICATION_FRAMES; frame++) {
            const distance = await captureFrame();
            if (distance == null) {
                setError('No face detected. Keep your face centred and well-lit.');
                return;
            }
            distances.push(distance);
        }

        let avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
        // Borderline match → quick extra frames instead of always doing 3.
        if (avgDistance > FACE_DISTANCE_THRESHOLD - 0.08 && avgDistance <= FACE_DISTANCE_THRESHOLD + 0.08) {
            for (let frame = 0; frame < BORDERLINE_RETRY_FRAMES; frame++) {
                await new Promise<void>((r) => setTimeout(r, 80));
                const distance = await captureFrame();
                if (distance == null) continue;
                distances.push(distance);
            }
            avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
        }

        // Score reported as 1 - distance (1 = perfect match, 0 = completely different)
        const matchScore = Number(Math.max(0, 1 - avgDistance).toFixed(4));
        const isMatch = avgDistance <= FACE_DISTANCE_THRESHOLD;

        setDebugInfo({ frames: distances, avg: avgDistance, passed: isMatch });

        if (!isMatch) {
            setError('Face does not match the profile photo.');
            return;
        }

        onVerify({
            face_verified: true,
            face_match_score: matchScore,
            location: locationData,
        });
    };

    const PermissionStatusIcon = ({ status }: { status: 'idle' | 'pending' | 'granted' | 'denied' }) => {
        switch (status) {
            case 'pending':
                return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
            case 'granted':
                return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />;
            case 'denied':
                return <XCircle className="h-4 w-4 text-destructive" />;
            default:
                return <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/40" />;
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={cn(
                    'flex w-[calc(100%-1rem)] max-w-lg flex-col gap-0 overflow-hidden p-0',
                    'max-h-[min(92dvh,40rem)] sm:max-w-3xl',
                )}
            >
                <DialogHeader className="shrink-0 space-y-1 border-b px-4 py-3 pr-12 text-left">
                    <DialogTitle className="text-base sm:text-lg">
                        {skipFaceVerification ? 'Confirm clock in' : 'Verify your face'}
                    </DialogTitle>
                    <DialogDescription className="text-xs sm:text-sm">
                        {skipFaceVerification
                            ? 'Location permission is required to clock in. Face verification is optional when no profile photo is set.'
                            : permissionsGranted
                                ? 'Position your face in the camera and click verify.'
                                : 'Camera and location permissions are required to clock in. Please grant access to continue.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">
                    {/* Permission prompt step */}
                    {!permissionsGranted && (
                        <div className="space-y-3">
                            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                    <ShieldAlert className="h-4 w-4 shrink-0 text-primary" />
                                    Permissions Required
                                </div>

                                <div className="flex min-w-0 items-center justify-between gap-2 rounded-md border bg-background px-3 py-2.5">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <PermissionStatusIcon status={cameraStatus} />
                                        <Camera className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium">Camera Access</p>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {cameraStatus === 'granted'
                                                    ? 'Permission granted'
                                                    : cameraStatus === 'denied'
                                                        ? 'Permission denied — check app settings'
                                                        : cameraStatus === 'pending'
                                                            ? 'Requesting permission...'
                                                            : 'Required for face verification'}
                                            </p>
                                        </div>
                                    </div>
                                    {(cameraStatus === 'idle' || cameraStatus === 'denied') && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="shrink-0"
                                            onClick={requestCameraPermission}
                                        >
                                            {cameraStatus === 'denied' ? (
                                                <><RefreshCw className="mr-1.5 h-3 w-3" /> Retry</>
                                            ) : (
                                                'Allow'
                                            )}
                                        </Button>
                                    )}
                                </div>

                                <div className="flex min-w-0 items-center justify-between gap-2 rounded-md border bg-background px-3 py-2.5">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <PermissionStatusIcon status={locationStatus} />
                                        <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium">Location Access</p>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {locationStatus === 'granted'
                                                    ? 'Permission granted'
                                                    : locationStatus === 'denied'
                                                        ? 'Permission denied — check app settings'
                                                        : locationStatus === 'pending'
                                                            ? 'Requesting permission...'
                                                            : 'Required for attendance verification'}
                                            </p>
                                        </div>
                                    </div>
                                    {(locationStatus === 'idle' || locationStatus === 'denied') && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="shrink-0"
                                            onClick={requestLocationPermission}
                                        >
                                            {locationStatus === 'denied' ? (
                                                <><RefreshCw className="mr-1.5 h-3 w-3" /> Retry</>
                                            ) : (
                                                'Allow'
                                            )}
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {(cameraStatus !== 'granted' || locationStatus !== 'granted') && (
                                <Button
                                    type="button"
                                    className="w-full"
                                    onClick={requestAllPermissions}
                                    disabled={cameraStatus === 'pending' || locationStatus === 'pending'}
                                >
                                    {(cameraStatus === 'pending' || locationStatus === 'pending') ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Requesting Permissions...</>
                                    ) : (
                                        'Grant Permissions & Continue'
                                    )}
                                </Button>
                            )}
                            {isInstalledApp && (cameraStatus === 'denied' || locationStatus === 'denied') && (
                                <p className="text-center text-xs leading-relaxed text-muted-foreground">
                                    Open <span className="font-medium text-foreground">Settings → Apps → HR Daddy → Permissions</span>
                                    {' '}and enable Camera / Location, then tap Retry.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Verification step */}
                    {permissionsGranted && !skipFaceVerification && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2 sm:gap-4">
                                <div className="min-w-0 space-y-1.5">
                                    <p className="text-xs font-medium sm:text-sm">Camera</p>
                                    <div className="mx-auto aspect-[3/4] max-h-[32vh] w-full overflow-hidden rounded-md border bg-muted sm:aspect-video sm:max-h-none">
                                        <video
                                            ref={videoRef}
                                            className="h-full w-full object-cover"
                                            muted
                                            playsInline
                                            autoPlay
                                        />
                                    </div>
                                </div>

                                <div className="min-w-0 space-y-1.5">
                                    <p className="text-xs font-medium sm:text-sm">Profile photo</p>
                                    <div className="mx-auto flex aspect-[3/4] max-h-[32vh] w-full items-center justify-center overflow-hidden rounded-md border bg-muted sm:aspect-video sm:max-h-none">
                                        {userPhotoUrl ? (
                                            <img
                                                src={userPhotoUrl}
                                                alt="Profile"
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <span className="px-2 text-center text-xs text-muted-foreground">
                                                No photo uploaded
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                {modelsLoading && (
                                    <div className="flex items-center gap-1.5">
                                        <Loader2 className="h-3 w-3 animate-spin" /> Loading face models...
                                    </div>
                                )}
                                {locationLoading && (
                                    <div className="flex items-center gap-1.5">
                                        <Loader2 className="h-3 w-3 animate-spin" /> Fetching location...
                                    </div>
                                )}
                                {cameraReady && (
                                    <div className="flex items-center gap-1.5">
                                        <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" /> Camera ready
                                    </div>
                                )}
                                {locationData && (
                                    <div className="flex items-center gap-1.5">
                                        <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" /> Location acquired
                                    </div>
                                )}
                                {modelsReady && (
                                    <div className="flex items-center gap-1.5">
                                        <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" /> Face models ready
                                    </div>
                                )}
                            </div>

                            {debugInfo && (
                                <div
                                    className={`space-y-1 rounded-md border p-2 font-mono text-xs ${
                                        debugInfo.passed
                                            ? 'border-green-500 bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300'
                                            : 'border-red-400 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300'
                                    }`}
                                >
                                    <div className="font-semibold">
                                        {debugInfo.passed ? '✓ MATCH' : '✗ NO MATCH'} — threshold: {FACE_DISTANCE_THRESHOLD}
                                    </div>
                                    {debugInfo.frames.map((d, i) => (
                                        <div key={i}>
                                            Frame {i + 1}: {d.toFixed(4)}{' '}
                                            <span className={d <= FACE_DISTANCE_THRESHOLD ? 'text-green-600' : 'text-red-500'}>
                                                ({d <= FACE_DISTANCE_THRESHOLD ? 'pass' : 'fail'})
                                            </span>
                                        </div>
                                    ))}
                                    <div className="border-t pt-1 font-semibold">Avg: {debugInfo.avg.toFixed(4)}</div>
                                </div>
                            )}
                        </div>
                    )}

                    {permissionsGranted && locationData && (
                        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <MapPin className="h-4 w-4 shrink-0 text-primary" />
                                Location Details
                            </div>
                            <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                                <div className="min-w-0">
                                    <span className="text-muted-foreground">GPS</span>
                                    <p className="mt-0.5 break-all font-mono">
                                        {locationData.geo.lat.toFixed(6)}, {locationData.geo.lng.toFixed(6)}
                                    </p>
                                </div>
                                {locationData.geo.accuracy != null && (
                                    <div className="min-w-0">
                                        <span className="text-muted-foreground">Accuracy</span>
                                        <p className="mt-0.5">±{Math.round(locationData.geo.accuracy)}m</p>
                                    </div>
                                )}
                                {locationData.ip.ip && locationData.ip.ip !== 'unknown' && (
                                    <div className="min-w-0">
                                        <span className="text-muted-foreground">IP</span>
                                        <p className="mt-0.5 break-all font-mono">{locationData.ip.ip}</p>
                                    </div>
                                )}
                                {(locationData.ip.city || locationData.ip.region || locationData.ip.country) && (
                                    <div className="min-w-0">
                                        <span className="text-muted-foreground">Location</span>
                                        <p className="mt-0.5 break-words">
                                            {[locationData.ip.city, locationData.ip.region, locationData.ip.country]
                                                .filter(Boolean)
                                                .join(', ')}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
                            <span className="min-w-0 break-words">{error}</span>
                            {permissionsGranted && !locationData && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0 border-destructive/40"
                                    onClick={requestLocationPermission}
                                    disabled={locationLoading}
                                >
                                    {locationLoading ? (
                                        <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> Retrying...</>
                                    ) : (
                                        <><RefreshCw className="mr-1.5 h-3 w-3" /> Retry Location</>
                                    )}
                                </Button>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter className="shrink-0 gap-2 border-t px-4 py-3 sm:flex-row">
                    <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => onOpenChange(false)}
                        disabled={busy}
                    >
                        Cancel
                    </Button>
                    {permissionsGranted && (
                        <Button
                            type="button"
                            className="w-full sm:w-auto"
                            onClick={skipFaceVerification ? handleClockInWithoutFace : handleVerify}
                            disabled={!isReady || busy || (!skipFaceVerification && (modelsLoading || locationLoading))}
                        >
                            {busy && <Spinner size="sm" className="mr-2" />}
                            {busy ? 'Clocking In...' : skipFaceVerification ? 'Clock In' : 'Verify & Clock In'}
                        </Button>
                    )}
                </DialogFooter>

                <canvas ref={canvasRef} className="hidden" />
            </DialogContent>
        </Dialog>
    );
}
