'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader } from '@googlemaps/js-api-loader'
import { cn } from '@/lib/utils'
import { GradientBlur } from '../../ui/gradient-blur'
import { generateId } from '@/lib/id'
import { useStreetViewValidation, StreetViewParams, ImageSourceParams, ValidationOptions, ValidationError } from '@/hooks/use-street-view-validation'
import { useProjectData } from '@/hooks/use-tree-sockets'
import { useUser } from '@clerk/nextjs'

declare global {
  interface Window {
    google: any
  }
}

interface ValidationMessage {
  message: string
  type: 'success' | 'error' | 'info' | 'warning'
}

// Define ValidationSuccess type locally since it's not exported from the hook
interface ValidationSuccess {
  success: 'yes' | 'no' | 'maybe'
  description: string
  imageUrl: string
  requestId: string
  params?: {
    lat: number
    lng: number
    heading: number
    pitch: number
    zoom: number
  }
}

interface PresignedUrlResponse {
  url: string
  key: string
}

interface CameraViewProps {
  projectId: string;
  fundraiserId?: string;
  height: number;
  isValidating: boolean;
  showLoadingAnimation?: boolean;
  saveDraft?: () => void;
  validateStreetView: (
    params: StreetViewParams | ImageSourceParams,
    overrideOptions?: Partial<ValidationOptions>
  ) => Promise<boolean>;
  onValidationStateChange?: (state: { isValid: boolean }) => void;
  onValidationSuccess?: (response: ValidationSuccess) => void;
  setValidationMessage: (message: ValidationMessage | null) => void;
}

// Camera View Component
const CameraView = ({
  projectId,
  fundraiserId,
  height,
  isValidating,
  showLoadingAnimation = true,
  saveDraft,
  validateStreetView,
  onValidationStateChange,
  onValidationSuccess,
  setValidationMessage
}: CameraViewProps) => {
  const cameraRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const { user } = useUser();
  const isAdmin = user?.organizationMemberships?.some(
    (membership) => membership.role === "org:admin"
  );
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState<number>(0);
  const [isCameraLoading, setIsCameraLoading] = useState<boolean>(false);
  const [isFrontFacing, setIsFrontFacing] = useState<boolean>(false);
  const [isCameraInitialized, setIsCameraInitialized] = useState<boolean>(false);
  
  // Get list of available cameras
  const getAvailableCameras = async (): Promise<MediaDeviceInfo[]> => {
    try {
      // First request permission to access any camera
      await navigator.mediaDevices.getUserMedia({ video: true });
      
      // Then get list of all video input devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      
      console.log('[CameraView] Available video devices:', videoDevices);
      return videoDevices;
    } catch (err) {
      console.error('[CameraView] Error getting available cameras:', err);
      return [];
    }
  };
  
  // Determine if camera is front-facing based on label
  const isCameraFrontFacing = (camera?: MediaDeviceInfo): boolean => {
    if (!camera) return false;
    
    const label = camera.label?.toLowerCase() || '';
    return label.includes('front') || 
           label.includes('selfie') || 
           label.includes('user') || 
           label.includes('face');
  };
  
  // Start camera with specific device id
  const startCamera = async (deviceId?: string) => {
    setIsCameraLoading(true);
    setIsCameraInitialized(false);
    
    try {
      // Request permission to use camera
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: deviceId 
          ? { deviceId: { exact: deviceId } } 
          : { facingMode: 'environment' }
      });
      
      // Stop any existing stream
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => {
          track.stop();
        });
      }
      
      // Save reference to new stream
      mediaStreamRef.current = stream;
      
      // Set the stream as the source for the video element
      if (cameraRef.current) {
        cameraRef.current.srcObject = stream;
        
        // Try to determine if this is a front-facing camera
        if (deviceId) {
          const currentDevice = availableCameras.find(camera => camera.deviceId === deviceId);
          if (currentDevice) {
            const frontFacing = isCameraFrontFacing(currentDevice);
            console.log(`[CameraView] Camera "${currentDevice.label}" detected as ${frontFacing ? 'front-facing' : 'rear-facing'}`);
            setIsFrontFacing(frontFacing);
          }
        } else {
          // Default to assuming environment/rear camera if no deviceId provided
          setIsFrontFacing(false);
        }
        
        // Wait for the video element to be properly initialized
        cameraRef.current.onloadeddata = () => {
          setIsCameraInitialized(true);
        };
      }
    } catch (err) {
      console.error('[CameraView] Error accessing camera:', err);
      throw new Error('Could not access camera');
    } finally {
      setIsCameraLoading(false);
    }
  };
  
  // Switch to next available camera
  const switchCamera = async () => {
    if (availableCameras.length <= 1) return;
    
    setIsCameraLoading(true);
    
    const nextCameraIndex = (currentCameraIndex + 1) % availableCameras.length;
    setCurrentCameraIndex(nextCameraIndex);
    
    const nextCamera = availableCameras[nextCameraIndex];
    if (nextCamera && nextCamera.deviceId) {
      await startCamera(nextCamera.deviceId);
    } else {
      // Fallback to default camera if next camera doesn't have a deviceId
      await startCamera();
    }
  };
  
  // Initialize camera and get available cameras
  useEffect(() => {
    const initializeCamera = async () => {
      if (!isAdmin) return;
      
      try {
        // Get available cameras first
        const cameras = await getAvailableCameras();
        setAvailableCameras(cameras);
        
        // Start with environment facing camera when available
        let initialCameraIndex = 0;
        const environmentCamera = cameras.findIndex(
          camera => camera.label?.toLowerCase().includes('back') || 
                  camera.label?.toLowerCase().includes('environment')
        );
        
        if (environmentCamera !== -1) {
          initialCameraIndex = environmentCamera;
          setIsFrontFacing(false);
        } else {
          // If no obvious environment camera, check if the first camera is front-facing
          if (cameras.length > 0) {
            const firstCamera = cameras[0];
            setIsFrontFacing(isCameraFrontFacing(firstCamera));
          }
        }
        
        setCurrentCameraIndex(initialCameraIndex);
        
        // Start camera with preferred device
        if (cameras.length > 0) {
          const initialCamera = cameras[initialCameraIndex];
          if (initialCamera && initialCamera.deviceId) {
            await startCamera(initialCamera.deviceId);
          } else {
            await startCamera();
          }
        } else {
          // Fallback to any camera if no specific devices were found
          await startCamera();
        }
      } catch (err) {
        console.error('[CameraView] Failed to initialize camera:', err);
      }
    };
    
    initializeCamera();
    
    // Cleanup function to stop camera when component unmounts
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => {
          track.stop();
        });
        mediaStreamRef.current = null;
      }
    };
  }, [isAdmin]);

  // Handle camera capture
  const handleCameraCapture = async () => {
    if (!cameraRef.current || !fundraiserId || !isAdmin) return;
    
    // Create a canvas to capture the current frame
    const canvas = document.createElement('canvas');
    canvas.width = cameraRef.current.videoWidth;
    canvas.height = cameraRef.current.videoHeight;
    
    // Draw the current video frame to canvas
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // If front-facing camera, flip the image horizontally when capturing
    // This ensures the saved image is "corrected" even though the preview was mirrored
    if (isFrontFacing) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    
    ctx.drawImage(cameraRef.current, 0, 0, canvas.width, canvas.height);
    
    // Reset transform if needed
    if (isFrontFacing) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    
    // Convert canvas to blob
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to convert image'));
        }, 'image/jpeg', 0.9);
      });
      
      // Create a File object from the blob
      const file = new File([blob], `camera-capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
      
      // Use the existing file upload logic to handle the captured image
      try {
        // Get presigned URL from backend
        const response = await fetch('/api/upload/presign', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
            projectId
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to get upload URL');
        }
        
        const { url, key } = await response.json() as PresignedUrlResponse;

        // Upload to R2 using simple PUT request
        const uploadResponse = await fetch(url, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type
          }
        });

        if (!uploadResponse.ok) {
          throw new Error(`Failed to upload image: ${uploadResponse.statusText}`);
        }

        // Get the public URL
        const publicUrl = `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${key}`;
        
        saveDraft?.();

        // Validate the uploaded image
        validateStreetView(
          {
            type: 'url',
            url: publicUrl
          },
          {
            onError: (error: ValidationError) => {
              console.error('[CameraView] Validation error:', error);
              setValidationMessage({
                message: error.message,
                type: 'error'
              });
              onValidationStateChange?.({ isValid: false });
            },
            onSuccess: (response: ValidationSuccess) => {
              const isValid = response.success === 'yes' || response.success === 'maybe';
              setValidationMessage({
                message: response.description,
                type: response.success === 'maybe' ? 'warning' : 'success'
              });
              onValidationStateChange?.({ isValid });
              onValidationSuccess?.(response);
            }
          }
        );
      } catch (error) {
        console.error('[CameraView] Upload error:', error);
        setValidationMessage({
          message: error instanceof Error ? error.message : 'Failed to upload image',
          type: 'error'
        });
      }
    } catch (err) {
      console.error('[CameraView] Error capturing image:', err);
      setValidationMessage({
        message: 'Failed to capture image',
        type: 'error'
      });
    }
  };

  return (
    <div 
      className="relative"
      role="tabpanel" 
      id="camera-view-panel" 
      aria-labelledby="camera-view-tab"
    >
      <video
        ref={cameraRef}
        autoPlay
        playsInline
        className={cn(
          "w-full",
          "transition-all duration-300",
          isFrontFacing && "scale-x-[-1]", // Mirror horizontally for front-facing cameras
          (isValidating || isCameraLoading)
            ? "opacity-50 scale-90 blur-[12px] rounded-3xl overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.5)]" 
            : "opacity-100 scale-100 blur-0"
        )}
        style={{
          height: `${height}px`,
          minHeight: '300px',
          maxHeight: '65vh',
          objectFit: 'cover'
        }}
      />
      {isValidating && !showLoadingAnimation && (
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-20 flex items-center justify-center">
          <div className="frosted-glass rounded-xl px-4 py-2 flex items-center gap-2">
            <i className="fa-solid fa-camera text-zinc-700 dark:text-zinc-300" aria-hidden="true" />
            <span className="text-sm text-zinc-700 dark:text-zinc-300">Analyzing image...</span>
          </div>
        </div>
      )}
      {isCameraLoading && (
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-20 flex items-center justify-center">
          <div className="frosted-glass rounded-xl px-4 py-2 flex items-center gap-2">
            <i className="fa-solid fa-camera text-zinc-700 dark:text-zinc-300" aria-hidden="true" />
            <span className="text-sm text-zinc-700 dark:text-zinc-300">Switching camera...</span>
          </div>
        </div>
      )}
      <div 
        className={cn(
          "absolute bottom-0 left-0 right-0 h-40 pointer-events-none z-10",
          "transition-opacity duration-300",
          isValidating ? "opacity-90" : "opacity-100"
        )}
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 70%)'
        }}
      />
      <div className="absolute pointer-events-none bottom-[-40px] h-[40%] w-full z-1">
        <GradientBlur targetBlur={2} direction="down" className="h-full w-full" />
      </div>

      {/* Camera Controls */}
      <div className="absolute bottom-[8vw] w-full z-10 flex items-center justify-center">
        {/* Switch Camera Button - Only show if multiple cameras are available */}
        {availableCameras.length > 1 && (
          <div className="absolute right-[15%]">
            <button
              onClick={switchCamera}
              disabled={isValidating || isCameraLoading}
              className={cn(
                "rounded-2xl flex items-center justify-center",
                "transition-all duration-200",
                "hover:scale-105 active:scale-95",
                "focus:outline-none focus:ring-2 focus:ring-white/20",
                "frosted-glass backdrop-blur-md",
                // Container styling
                "bg-white/10",
                "border border-white/20",
                "shadow-[0_8px_16px_rgba(0,0,0,0.2)]",
                "p-3 translate-x-[16px]",
                // Hover effects
                "hover:bg-white/20 hover:border-white/30",
                "hover:shadow-[0_12px_24px_rgba(0,0,0,0.25)]",
                // Disabled state
                (isValidating || isCameraLoading) && [
                  "opacity-50",
                  "cursor-not-allowed",
                  "pointer-events-none",
                  "hover:scale-100",
                  "hover:bg-white/10",
                  "hover:border-white/20"
                ]
              )}
              aria-label="Switch camera"
            >
              <i 
                className={cn(
                  "fa-solid fa-camera-rotate",
                  "text-white/90 text-base",
                  "transition-transform duration-200",
                  "hover:scale-110",
                  "drop-shadow-[0_2px_3px_rgba(0,0,0,0.3)]"
                )}
                aria-hidden="true"
              />
            </button>
          </div>
        )}

        {/* Capture Button */}
        <button 
          onClick={handleCameraCapture}
          disabled={isValidating || !fundraiserId || isCameraLoading}
          className={cn(
            "w-[20vw] h-[20vw] max-h-[65px] max-w-[65px] relative rounded-full flex items-center justify-center",
            "transition-all duration-200",
            !isValidating && fundraiserId && "hover:scale-110",
            "focus:outline-none focus:ring-4 focus:ring-white/30",
            "drop-shadow-[0_4px_12px_rgba(0,0,0,0.4)]",
            // Outer ring with shine animation
            "before:absolute before:inset-[-10px] before:rounded-full before:border-[7px]",
            "before:transition-all before:duration-300",
            (isValidating || isCameraLoading) ? [
              showLoadingAnimation ? [
                "before:border-white/70",
                "before:border-[13px]",
                "before:animate-bulge",
                "before:scale-110",
              ] : [
                "before:border-white/50",
                "before:scale-100",
              ],
              "before:opacity-50"
            ] : [
              "before:border-white/90",
              "before:scale-100",
              "before:opacity-100"
            ].join(" "),
            // Inner circle
            "after:absolute after:inset-[2.5px] after:rounded-full",
            "after:transition-all after:duration-300",
            (isValidating || isCameraLoading) ? [
              showLoadingAnimation ? [
                "after:bg-white/30",
                "after:scale-90",
                "after:opacity-0"
              ] : [
                "after:bg-white/50",
                "after:scale-95",
                "after:opacity-50"
              ]
            ] : [
              "after:bg-white/90",
              "after:scale-100",
              "after:opacity-100"
            ].join(" "),
            (isValidating || isCameraLoading) && (showLoadingAnimation ? "opacity-90" : "opacity-75"),
            (isValidating || isCameraLoading) && "cursor-not-allowed"
          )}
          aria-label="Take photo"
        >
          {(isValidating || isCameraLoading) && !showLoadingAnimation && (
            <i className="fa-solid fa-circle-notch fa-spin absolute text-white/90 text-xl" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Camera type indicator badge - only show when camera is initialized */}
      {isCameraInitialized && !isCameraLoading && (
        <div className="absolute top-4 left-4 z-10">
          <div className={cn(
            "frosted-glass rounded-full py-1 px-3",
            "bg-black/20 text-white/90",
            "text-xs font-medium",
            "flex items-center gap-1.5",
            "shadow-lg",
            "transition-opacity duration-300 opacity-80 hover:opacity-100"
          )}>
            <i className={cn(
              "fa-solid",
              isFrontFacing ? "fa-user" : "fa-mountain-sun",
              "text-xs"
            )} aria-hidden="true" />
            <span>{isFrontFacing ? "Front Camera" : "Rear Camera"}</span>
          </div>
        </div>
      )}
    </div>
  );
};

interface StreetViewCardProps {
  lat: number
  lng: number
  heading?: number
  pitch?: number
  zoom?: number
  isLoading?: boolean
  projectId: string
  fundraiserId?: string
  onLoad?: () => void
  onPositionChange?: (lat: number, lng: number) => void
  onValidationSuccess?: (response: any) => void
  onValidationStateChange?: (state: { isValid: boolean }) => void
  saveDraft?: () => void
  className?: string
  showLoadingAnimation?: boolean
}

export const StreetViewCard = ({ 
  lat, 
  lng,
  heading = 0,
  pitch = 0,
  zoom = 1,
  isLoading: externalLoading,
  projectId,
  fundraiserId,
  onLoad, 
  onPositionChange,
  onValidationSuccess,
  onValidationStateChange,
  saveDraft,
  className,
  showLoadingAnimation = true
}: StreetViewCardProps) => {
  const streetViewRef = useRef<HTMLDivElement>(null)
  const streetViewInstance = useRef<google.maps.StreetViewPanorama | null>(null)
  const cameraRef = useRef<HTMLVideoElement>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [validationMessage, setValidationMessage] = useState<ValidationMessage | null>(null)
  const [streetViewHeight, setStreetViewHeight] = useState<number>(400)
  const [showCameraView, setShowCameraView] = useState<boolean>(false)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const mutationObserverRef = useRef<MutationObserver | null>(null)
  const observedElementsRef = useRef<Set<Element>>(new Set())
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [streetViewKey, setStreetViewKey] = useState<string>(`sv-${generateId()}`)

  const { validateStreetView, isValidating } = useStreetViewValidation({
    projectId,
    fundraiserId,
    onSuccess: onValidationSuccess
  })

  const { projectData: { data: projectData } } = useProjectData(projectId)
  const { user } = useUser()
  const isAdmin = user?.organizationMemberships?.some(
    (membership) => membership.role === "org:admin"
  )

  // Force camera view to be off for non-admin users
  useEffect(() => {
    if (!isAdmin && showCameraView) {
      setShowCameraView(false);
    }
  }, [isAdmin, showCameraView]);

  // Clean up street view instance when switching to camera view
  useEffect(() => {
    if (showCameraView) {
      console.log('[StreetView] View switched to camera, cleaning up Street View');
      cleanupStreetView();
    } else {
      console.log('[StreetView] View switched to Street View');
    }
    // Clear any error message when switching views
    setError(null);
  }, [showCameraView]);

  // Track if we recently switched views
  const recentlySwitchedRef = useRef(false);
  
  useEffect(() => {
    if (showCameraView) {
      recentlySwitchedRef.current = true;
      // Reset the flag after a delay
      const timer = setTimeout(() => {
        recentlySwitchedRef.current = false;
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [showCameraView]);

  // Add an additional useEffect to clean up on component unmount
  useEffect(() => {
    return () => {
      console.log('[StreetView] Component unmounting, performing final cleanup');
      cleanupStreetView();
    };
  }, []);

  useEffect(() => {
    if (projectData?.images?.length) {
      onValidationStateChange?.({ isValid: true })
    }
  }, [projectData])

  // Set up resize observer to monitor dialog elements and adjust street view height
  useEffect(() => {
    // Clean up previous observers
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
    }
    if (mutationObserverRef.current) {
      mutationObserverRef.current.disconnect();
    }
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }
    observedElementsRef.current.clear();

    // Debounce function for resize events
    const debounce = (func: Function, delay: number) => {
      return function() {
        if (resizeTimeoutRef.current) {
          clearTimeout(resizeTimeoutRef.current);
        }
        resizeTimeoutRef.current = setTimeout(() => {
          func();
        }, delay);
      };
    };

    // Function to calculate and set the optimal street view height
    const calculateOptimalHeight = () => {
      // Get elements to monitor
      const header = document.getElementById('step-form-dialog-header');
      const footer = document.getElementById('step-form-dialog-footer');
      const locationInfo = document.getElementById('location-info-card-content');
      
      // Get viewport height
      const viewportHeight = window.innerHeight;
      
      // Calculate heights of monitored elements
      const headerHeight = header?.offsetHeight || 0;
      const footerHeight = footer?.offsetHeight || 0;
      const locationInfoHeight = locationInfo?.offsetHeight || 0;
      
      // Add some padding/margin
      const padding = 67; // 2rem
      
      // Calculate available height
      const availableHeight = viewportHeight - headerHeight - footerHeight - locationInfoHeight - padding;
      
      // Set minimum height
      const minHeight = 300;
      const finalHeight = Math.max(availableHeight, minHeight);
      
      console.log('[StreetViewCard] Heights:', {
        viewport: viewportHeight,
        header: headerHeight,
        footer: footerHeight,
        locationInfo: locationInfoHeight,
        available: availableHeight,
        final: finalHeight
      });
      
      // Set the height
      setStreetViewHeight(finalHeight);
    };
    
    // Function to observe an element if it exists
    const observeElement = (elementId: string) => {
      const element = document.getElementById(elementId);
      if (element && !observedElementsRef.current.has(element)) {
        resizeObserverRef.current?.observe(element);
        observedElementsRef.current.add(element);
        return true;
      }
      return false;
    };
    
    // Try to observe all target elements
    const observeAllTargetElements = () => {
      const elementsToObserve = [
        'step-form-dialog-header',
        'step-form-dialog-footer',
        'location-info-card-content'
      ];
      
      let allObserved = true;
      elementsToObserve.forEach(id => {
        const observed = observeElement(id);
        if (!observed) allObserved = false;
      });
      
      return allObserved;
    };
    
    // Create resize observer
    resizeObserverRef.current = new ResizeObserver(debounce(() => {
      calculateOptimalHeight();
    }, 100));
    
    // Initial attempt to observe elements
    const allElementsObserved = observeAllTargetElements();
    
    // If not all elements were found, set up a mutation observer to watch for them
    if (!allElementsObserved) {
      mutationObserverRef.current = new MutationObserver((mutations) => {
        // Check if our target elements have been added
        const newElementsObserved = observeAllTargetElements();
        
        // If all elements are now observed, disconnect the mutation observer
        if (newElementsObserved) {
          mutationObserverRef.current?.disconnect();
        }
        
        // Recalculate height regardless
        calculateOptimalHeight();
      });
      
      // Observe the document body for added nodes
      mutationObserverRef.current.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
    
    // Initial calculation with a small delay to ensure DOM is fully rendered
    setTimeout(calculateOptimalHeight, 100);
    
    // Also recalculate on window resize with debounce
    const debouncedResize = debounce(calculateOptimalHeight, 100);
    window.addEventListener('resize', debouncedResize);
    
    // Recalculate on orientation change for mobile devices
    window.addEventListener('orientationchange', () => {
      // Use a slightly longer delay for orientation changes
      setTimeout(calculateOptimalHeight, 300);
    });
    
    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      if (mutationObserverRef.current) {
        mutationObserverRef.current.disconnect();
      }
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      window.removeEventListener('resize', debouncedResize);
      window.removeEventListener('orientationchange', calculateOptimalHeight);
    };
  }, []);

  // Initialize street view
  useEffect(() => {
    if (!lat || !lng || externalLoading || !streetViewRef.current || showCameraView) return

    // Don't initialize if we still have a cleanup in progress
    if (streetViewInstance.current) {
      console.log('[StreetView] Instance already exists, cleaning up first')
      cleanupStreetView()
    }

    // Add a small delay after switching from camera view
    if (recentlySwitchedRef.current) {
      console.log('[StreetView] Recently switched, delaying initialization')
      const timer = setTimeout(() => {
        initializeStreetView()
      }, 300)
      return () => clearTimeout(timer)
    }

    initializeStreetView()
    
    function initializeStreetView() {
      setError(null);

      const loader = new Loader({
        apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
        version: 'weekly',
        libraries: ['places']
      });

      let isMounted = true;

      loader.load().then((google) => {
        if (!isMounted || showCameraView) return;

        const position = new google.maps.LatLng(lat, lng);
        const streetViewService = new google.maps.StreetViewService();

        streetViewService.getPanorama(
          { location: position, radius: 50 },
          (_data, status) => {
            if (!isMounted || showCameraView) return;
            
            if (status === google.maps.StreetViewStatus.OK && streetViewRef.current) {
              streetViewInstance.current = new google.maps.StreetViewPanorama(streetViewRef.current, {
                position,
                pov: { heading, pitch },
                zoom,
                addressControl: false,
                showRoadLabels: false,
                motionTracking: false,
                motionTrackingControl: false,
                fullscreenControl: false,
                visible: true,
                panControl: false,
                linksControl: false,
                enableCloseButton: false,
                zoomControl: false,
                disableDefaultUI: true,
              });

              // Listen for position changes
              streetViewInstance.current.addListener('position_changed', () => {
                if (streetViewInstance.current && onPositionChange) {
                  const newPosition = streetViewInstance.current.getPosition();
                  if (newPosition) {
                    onPositionChange(newPosition.lat(), newPosition.lng());
                  }
                }
              });

              // Add a small delay before showing to ensure smooth transition
              setTimeout(() => {
                if (!isMounted || showCameraView) return;
                onLoad?.();
              }, 300);
            } else {
              setError('We couldn\'t find anything out here');
            }
          }
        );
      }).catch((err) => {
        if (!isMounted) return;
        console.error('[StreetView] Error loading Google Maps:', err);
        setError('Failed to load Street View');
      });

      return () => {
        isMounted = false;
        cleanupStreetView();
      };
    }
  }, [lat, lng, heading, pitch, zoom, externalLoading, onLoad, onPositionChange, showCameraView, onValidationStateChange])

  // Helper function to clean up street view resources
  const cleanupStreetView = () => {
    if (streetViewInstance.current) {
      try {
        console.log('[StreetView] Starting cleanup process');
        
        // First set visible to false to trigger internal cleanup
        try {
          streetViewInstance.current.setVisible(false);
        } catch (e) {
          console.error('[StreetView] Error setting visible false:', e);
        }
        
        // Remove any event listeners that might be attached
        try {
          if (window.google && window.google.maps && window.google.maps.event) {
            window.google.maps.event.clearInstanceListeners(streetViewInstance.current);
          }
        } catch (e) {
          console.error('[StreetView] Error clearing instance listeners:', e);
        }
        
        // Force cleanup of WebGL context
        if (streetViewRef.current) {
          console.log('[StreetView] Cleaning up DOM elements in', streetViewRef.current.id);
          
          // Find all canvas elements inside the container
          const canvases = document.getElementById('street-view-panel')?.querySelectorAll('canvas');
          if (canvases) {
            canvases.forEach((canvas, i) => {
              try {
                console.log(`[StreetView] Processing canvas ${i}`);
                const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
                if (gl) {
                  const extension = gl.getExtension('WEBGL_lose_context');
                  if (extension) {
                    console.log('[StreetView] Calling loseContext() on WebGL context');
                    extension.loseContext();
                  }
                }
              } catch (e) {
                console.error('[StreetView] Error cleaning up canvas:', e);
              }
            });
          }
          
          // Use a safer method to clear the container - use innerHTML instead of removeChild
          try {
            if (streetViewRef.current) {
              streetViewRef.current.innerHTML = '';
              console.log('[StreetView] DOM cleanup completed via innerHTML');
            }
          } catch (e) {
            console.error('[StreetView] Error cleaning up via innerHTML:', e);
          }
        }
        
        // Null out the instance reference
        streetViewInstance.current = null;
        console.log('[StreetView] Cleanup process completed successfully');
      } catch (error) {
        console.error('[StreetView] Error during cleanup:', error);
      }
    } else {
      console.log('[StreetView] No instance to clean up');
    }
  }

  // Handle street view capture
  const handleStreetViewCapture = () => {
    // Don't allow capture if not authenticated
    if (!fundraiserId) {
      console.log('[StreetViewCard] Cannot capture: No fundraiser ID');
      return;
    }

    setValidationMessage(null); // Clear any existing message
    
    // Get current street view parameters
    const currentParams = streetViewInstance.current?.getPov();
    const currentZoom = streetViewInstance.current?.getZoom();
    const currentPosition = streetViewInstance.current?.getPosition();

    if (!currentParams || !currentZoom || !currentPosition) {
      console.error('[StreetViewCard] Failed to get current street view parameters');
      return;
    }

    saveDraft?.();

    validateStreetView(
      {
        lat: currentPosition.lat(),
        lng: currentPosition.lng(),
        heading: currentParams.heading,
        pitch: currentParams.pitch,
        zoom: currentZoom
      },
      {
        onError: (error) => {
          console.error('[StreetViewCard] Validation error:', {
            code: error.code,
            message: error.message,
            details: error.details
          });
          setValidationMessage({
            message: error.message,
            type: 'error'
          });
          onValidationStateChange?.({ isValid: false });
        },
        onSuccess: (response) => {
          const isValid = response.success === 'yes' || response.success === 'maybe';
          setValidationMessage({
            message: response.description,
            type: response.success === 'maybe' ? 'warning' : 'success'
          });
          onValidationStateChange?.({ isValid });
          console.log('[StreetViewCard] Validation successful:', response);
          onValidationSuccess?.(response);
        }
      }
    );
  };

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Don't allow upload if not authenticated
    if (!fundraiserId) {
      console.log('[StreetViewCard] Cannot upload: No fundraiser ID')
      return
    }

    // Validate file type and size
    if (!file.type.startsWith('image/')) {
      setValidationMessage({
        message: 'Please upload an image file',
        type: 'error'
      })
      return
    }

    const MAX_SIZE = 10 * 1024 * 1024 // 10MB
    if (file.size > MAX_SIZE) {
      setValidationMessage({
        message: 'Image must be smaller than 10MB',
        type: 'error'
      })
      return
    }

    try {
      // Get presigned URL from backend
      const response = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          projectId
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[StreetViewCard] Failed to get upload URL:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        })
        throw new Error('Failed to get upload URL')
      }
      
      const { url, key } = await response.json() as PresignedUrlResponse

      // Upload to R2 using simple PUT request
      const uploadResponse = await fetch(url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type
        }
      })

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text()
        console.error('[StreetViewCard] Upload failed:', {
          status: uploadResponse.status,
          statusText: uploadResponse.statusText,
          error: errorText
        })
        throw new Error(`Failed to upload image: ${uploadResponse.statusText}`)
      }

      // Get the public URL
      const publicUrl = `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${key}`
      
      saveDraft?.()

      // Validate the uploaded image using the same flow as street view
      validateStreetView(
        {
          type: 'url',
          url: publicUrl
        },
        {
          onError: (error) => {
            console.error('[StreetViewCard] Validation error:', error)
            setValidationMessage({
              message: error.message,
              type: 'error'
            })
            onValidationStateChange?.({ isValid: false })
          },
          onSuccess: (response) => {
            const isValid = response.success === 'yes' || response.success === 'maybe'
            setValidationMessage({
              message: response.description,
              type: response.success === 'maybe' ? 'warning' : 'success'
            })
            onValidationStateChange?.({ isValid })
            onValidationSuccess?.(response)
          }
        }
      )
    } catch (error) {
      console.error('[StreetViewCard] Upload error:', error)
      setValidationMessage({
        message: error instanceof Error ? error.message : 'Failed to upload image',
        type: 'error'
      })
    }
  }

  if (externalLoading) {
    return (
      <div className="flex items-center gap-3 text-sm text-zinc-500">
        <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />
        <span>Loading street view...</span>
      </div>
    )
  }

  if (error && (!showCameraView || error.includes('camera'))) {
    return (
      <div className={cn("rounded-lg", className)}>
        <div className="flex items-center justify-between text-sm text-zinc-700 dark:text-zinc-300 pb-3 border-b border-zinc-200/50 dark:border-white/10 p-4 pt-0">
          <div className="flex items-center">
            {isAdmin ? (
              <div 
                className={cn(
                  "relative flex h-8 w-full max-w-[240px] rounded-full bg-zinc-200/70 dark:bg-zinc-800/70",
                  "p-[3px] shadow-inner transition-colors"
                )}
                role="tablist"
                aria-label="View mode selection"
              >
                {/* Street View toggle option */}
                <button
                  onClick={() => {
                    if (showCameraView) {
                      setShowCameraView(false);
                      setError(null);
                    }
                  }}
                  className={cn(
                    "relative flex w-full items-center justify-center whitespace-nowrap rounded-full text-xs px-3",
                    "transition-all duration-300 ease-out font-medium",
                    !showCameraView && "bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-100 shadow-sm",
                    showCameraView && "text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-300"
                  )}
                  role="tab"
                  aria-selected={!showCameraView}
                >
                  <i className={cn(
                    "fa-solid fa-street-view mr-1.5 flex-shrink-0",
                    !showCameraView && "scale-110"
                  )} aria-hidden="true" />
                  <span className="whitespace-nowrap">Street View</span>
                </button>
                
                {/* Camera view toggle option */}
                <button
                  onClick={() => {
                    if (!showCameraView) {
                      // Only allow admins to switch to camera view
                      if (!isAdmin) return;
                      
                      // We're about to switch TO camera view, clean up any street view resources
                      cleanupStreetView();
                      
                      // Clear error state
                      setError(null);
                      setValidationMessage(null);
                      
                      // Force a remount of street view on next change
                      setStreetViewKey(`sv-${generateId()}`);
                      
                      // Change the view
                      setShowCameraView(true);
                    }
                  }}
                  className={cn(
                    "relative flex w-full items-center justify-center whitespace-nowrap rounded-full text-xs px-2",
                    "transition-all duration-300 ease-out font-medium",
                    showCameraView && "bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-100 shadow-sm",
                    !showCameraView && "text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-300"
                  )}
                  role="tab"
                  aria-selected={showCameraView}
                >
                  <i className={cn(
                    "fa-solid fa-camera mr-1.5 flex-shrink-0",
                    showCameraView && "scale-110"
                  )} aria-hidden="true" />
                  <span className="whitespace-nowrap">Camera</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-street-view text-sm" aria-hidden="true" />
                <span className="text-zinc-700 dark:text-zinc-300 font-medium">Street View</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8 text-zinc-500 dark:text-zinc-400 space-y-2">
          <i className="fa-solid fa-camera-slash text-3xl mb-2" aria-hidden="true" />
          <i className="fa-regular fa-face-sad-tear text-2xl" aria-hidden="true" />
          <p>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("rounded-lg relative", className)}>
      <div className="flex items-center justify-between text-sm text-zinc-700 dark:text-zinc-300 pb-3 border-b border-zinc-200/50 dark:border-white/10 p-4 pt-0">
        <div className="flex items-center">
          {isAdmin ? (
            <div 
              className={cn(
                "relative flex h-8 w-full max-w-[240px] rounded-full bg-zinc-200/70 dark:bg-zinc-800/70",
                "p-[3px] shadow-inner transition-colors"
              )}
              role="tablist"
              aria-label="View mode selection"
            >
              {/* Street View toggle option */}
              <button
                onClick={() => {
                  if (showCameraView) {
                    setShowCameraView(false);
                    setError(null);
                  }
                }}
                className={cn(
                  "relative flex w-full items-center justify-center whitespace-nowrap rounded-full text-xs px-2",
                  "transition-all duration-300 ease-out font-medium",
                  !showCameraView && "bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-100 shadow-sm",
                  showCameraView && "text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-300"
                )}
                role="tab"
                aria-selected={!showCameraView}
                aria-controls="street-view-panel"
                id="street-view-tab"
              >
                <i className={cn(
                  "fa-solid fa-street-view mr-1.5 transition-transform duration-300 flex-shrink-0",
                  !showCameraView && "scale-110"
                )} aria-hidden="true" />
                <span className="whitespace-nowrap">Street View</span>
              </button>
              
              {/* Camera view toggle option - Only for admin */}
              <button
                onClick={() => {
                  if (!showCameraView) {
                    // Only allow admins to switch to camera view
                    if (!isAdmin) return;
                    
                    // We're about to switch TO camera view, clean up street view first
                    cleanupStreetView();
                    
                    // Clear any error state
                    setError(null);
                    setValidationMessage(null);
                    
                    // Force a remount of the street view component on next view change
                    setStreetViewKey(`sv-${generateId()}`);
                    
                    // Use React state to change the view
                    setShowCameraView(true);
                  }
                }}
                className={cn(
                  "relative flex w-full items-center justify-center whitespace-nowrap rounded-full text-xs px-2",
                  "transition-all duration-300 ease-out font-medium",
                  showCameraView && "bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-100 shadow-sm",
                  !showCameraView && "text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-300"
                )}
                role="tab"
                aria-selected={showCameraView}
                aria-controls="camera-view-panel"
                id="camera-view-tab"
              >
                <i className={cn(
                  "fa-solid fa-camera mr-1.5 transition-transform duration-300 flex-shrink-0",
                  showCameraView && "scale-110"
                )} aria-hidden="true" />
                <span className="whitespace-nowrap">Camera</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-street-view text-sm" aria-hidden="true" />
              <span className="text-zinc-700 dark:text-zinc-300 font-medium">Street View</span>
            </div>
          )}
        </div>
      </div>

      {validationMessage && (
        <div className="absolute inset-x-0 top-12 z-[100] mx-4 frosted-glass">
          <div className={cn(
            "frosted-glass rounded-lg shadow-lg flex items-center gap-3 px-4 py-3 mx-auto",
            "transition-all duration-300 ease-out",
            "cursor-pointer hover:scale-[1.02] active:scale-[0.98]",
            "max-w-md w-full"
          )}
          onClick={() => setValidationMessage(null)}
          role="button"
          aria-label="Dismiss validation message"
          >
            <i className={cn(
              "fa-solid text-lg",
              validationMessage.type === 'error' ? "fa-circle-exclamation text-red-500" :
              validationMessage.type === 'warning' ? "fa-triangle-exclamation text-yellow-500" :
              "fa-check-circle text-emerald-500"
            )} aria-hidden="true" />
            <p className="text-sm text-zinc-800 dark:text-zinc-200 flex-grow overflow-hidden">{validationMessage.message}</p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setValidationMessage(null);
              }}
              className="ml-auto text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 p-1"
              aria-label="Dismiss"
            >
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <div className="relative">
        {showCameraView && isAdmin ? (
          <CameraView
            projectId={projectId}
            fundraiserId={fundraiserId}
            height={streetViewHeight}
            isValidating={isValidating}
            showLoadingAnimation={showLoadingAnimation}
            saveDraft={saveDraft}
            validateStreetView={validateStreetView}
            onValidationStateChange={onValidationStateChange}
            onValidationSuccess={onValidationSuccess}
            setValidationMessage={setValidationMessage}
          />
        ) : (
          <div 
            key={streetViewKey}
            ref={streetViewRef} 
            id="street-view-panel"
            className={cn(
              "StreetViewCard w-full relative",
              "transition-all duration-300",
              showLoadingAnimation && isValidating 
                ? "opacity-50 scale-90 blur-[12px] rounded-3xl overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.5)]" 
                : "opacity-100 scale-100 blur-0"
            )}
            style={{
              height: `${streetViewHeight}px`,
              minHeight: '300px',
              maxHeight: '65vh'
            }}
            aria-label="Google Street View of the location"
            role="tabpanel"
            aria-labelledby="street-view-tab"
            data-project-id={projectId}
          >
            {/* Validation Overlay - Only show if not using full animation */}
            {isValidating && !showLoadingAnimation && (
              <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-20 flex items-center justify-center">
                <div className="frosted-glass rounded-xl px-4 py-2 flex items-center gap-2">
                  <i className="fa-solid fa-camera text-zinc-700 dark:text-zinc-300" aria-hidden="true" />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Analyzing view...</span>
                </div>
              </div>
            )}

            {/* Shutter Button Shadow Overlay */}
            <div 
              className={cn(
                "absolute bottom-0 left-0 right-0 h-40 pointer-events-none z-10",
                "transition-opacity duration-300",
                showLoadingAnimation && isValidating ? "opacity-90" : "opacity-100"
              )}
              style={{
                background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 70%)'
              }}
            />
            <div className="absolute pointer-events-none bottom-[-40px] h-[40%] w-full z-1">
              <GradientBlur targetBlur={2} direction="down" className="h-full w-full" />
            </div>
          </div>
        )}
      </div>

      {/* Upload and Capture Buttons - Only show for street view */}
      {!showCameraView && (
        <div className="absolute bottom-[8vw] w-full z-10 flex items-center justify-center">
          {/* Upload Button - Only show for admin users */}
          {isAdmin && (
            <div className="absolute left-[15%]">
              <label
                className={cn(
                  "rounded-2xl flex items-center justify-center cursor-pointer",
                  "transition-all duration-200",
                  "hover:scale-105 active:scale-95",
                  "focus:outline-none focus:ring-2 focus:ring-white/20",
                  "frosted-glass backdrop-blur-md",
                  // Container styling
                  "bg-white/10",
                  "border border-white/20",
                  "shadow-[0_8px_16px_rgba(0,0,0,0.2)]",
                  "py-3 px-5 translate-x-[-16px]",
                  // Hover effects
                  "hover:bg-white/20 hover:border-white/30",
                  "hover:shadow-[0_12px_24px_rgba(0,0,0,0.25)]",
                  // Disabled state
                  isValidating && [
                    "opacity-50",
                    "cursor-not-allowed",
                    "pointer-events-none",
                    "hover:scale-100",
                    "hover:bg-white/10",
                    "hover:border-white/20"
                  ]
                )}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  disabled={isValidating || !fundraiserId}
                  className="hidden"
                  aria-label="Upload image"
                />
                <i 
                  className={cn(
                    "fa-solid fa-arrow-up-from-bracket",
                    "text-white/90 text-base",
                    "transition-transform duration-200",
                    "group-hover:scale-110",
                    "drop-shadow-[0_2px_3px_rgba(0,0,0,0.3)]"
                  )}
                  aria-hidden="true"
                />
              </label>
            </div>
          )}

          {/* Capture Button */}
          <button 
            onClick={handleStreetViewCapture}
            disabled={isValidating || !fundraiserId}
            className={cn(
              "w-[20vw] h-[20vw] max-h-[65px] max-w-[65px] relative rounded-full flex items-center justify-center",
              "transition-all duration-200",
              !isValidating && fundraiserId && "hover:scale-110",
              "focus:outline-none focus:ring-4 focus:ring-white/30",
              "drop-shadow-[0_4px_12px_rgba(0,0,0,0.4)]",
              // Outer ring with shine animation
              "before:absolute before:inset-[-10px] before:rounded-full before:border-[7px]",
              "before:transition-all before:duration-300",
              isValidating ? [
                showLoadingAnimation ? [
                  "before:border-white/70",
                  "before:border-[13px]",
                  "before:animate-bulge",
                  "before:scale-110",
                ] : [
                  "before:border-white/50",
                  "before:scale-100",
                ],
                "before:opacity-50"
              ] : [
                "before:border-white/90",
                "before:scale-100",
                "before:opacity-100"
              ].join(" "),
              // Inner circle
              "after:absolute after:inset-[2.5px] after:rounded-full",
              "after:transition-all after:duration-300",
              isValidating ? [
                showLoadingAnimation ? [
                  "after:bg-white/30",
                  "after:scale-90",
                  "after:opacity-0"
                ] : [
                  "after:bg-white/50",
                  "after:scale-95",
                  "after:opacity-50"
                ]
              ] : [
                "after:bg-white/90",
                "after:scale-100",
                "after:opacity-100"
              ].join(" "),
              isValidating && (showLoadingAnimation ? "opacity-90" : "opacity-75"),
              isValidating && "cursor-not-allowed"
            )}
            aria-label="Take photo"
          >
            {isValidating && !showLoadingAnimation && (
              <i className="fa-solid fa-circle-notch fa-spin absolute text-white/90 text-xl" aria-hidden="true" />
            )}
          </button>
        </div>
      )}
    </div>
  )
} 