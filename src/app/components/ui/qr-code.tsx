'use client'

import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import * as QRCodeLib from 'qrcode'
import { Logo } from './logo'

interface QRCodeProps {
  url: string
  size?: number
  className?: string
  logoSize?: number
  dotColor?: string
  dotOpacity?: number
  dotSize?: number
  showButtons?: boolean
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'  // Added error correction level option
  version?: number                              // Added version option
  compact?: boolean                             // Added compact mode option
}

export interface QRCodeRef {
  downloadImage: (filename?: string) => void;
  copyToClipboard: () => Promise<boolean>;
}

export const QRCode = forwardRef<QRCodeRef, QRCodeProps>(({
  url,
  size = 200,
  className,
  logoSize = 50,
  dotColor,
  dotOpacity = 1,
  dotSize = 0.85, // Size of dots relative to the cell size (0-1)
  showButtons = true,
  errorCorrectionLevel = 'H', // Default to high for logo overlay
  version,                    // QR code version (1-40)
  compact = false             // Whether to use compact mode
}, ref) => {
  const [isLoaded, setIsLoaded] = useState(false)
  const [qrCodeData, setQrCodeData] = useState<boolean[]>([])
  const [moduleCount, setModuleCount] = useState(0)
  const [qrCopied, setQrCopied] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const cellSizeRef = useRef<number>(0)
  const cornerRadiusRef = useRef<number>(0)
  const { theme, systemTheme } = useTheme()

  // Determine the current theme
  const currentTheme = theme === 'system' ? systemTheme : theme
  
  // Set dot color based on theme if not explicitly provided
  const effectiveDotColor = dotColor || (currentTheme === 'dark' ? '#ffffff' : '#000000')

  // Generate QR code data
  useEffect(() => {
    const generateQR = async () => {
      try {
        // Determine the appropriate error correction level
        // If compact mode is enabled and no logo is used, we can use a lower level
        const effectiveErrorLevel = compact && logoSize === 0 ? 'L' : errorCorrectionLevel;
        
        // Generate QR code data with specified options
        const qrCode = QRCodeLib.create(url, {
          errorCorrectionLevel: effectiveErrorLevel,
          version: version, // Will be undefined if not specified, letting the library choose
          // Enable Kanji mode when available for better compression
          toSJISFunc: undefined
        })
        
        setQrCodeData(Array.from(qrCode.modules.data).map(value => value === 1))
        setModuleCount(qrCode.modules.size)
      } catch (error) {
        console.error('Error generating QR code:', error)
      }
    }

    generateQR()
  }, [url, errorCorrectionLevel, version, compact, logoSize])

  // Draw QR code with circular dots, but keep corner squares as squares with rounded outer corners
  useEffect(() => {
    if (!qrCodeData.length || !svgRef.current || !moduleCount) return

    // Clear previous content
    while (svgRef.current.firstChild) {
      svgRef.current.removeChild(svgRef.current.firstChild)
    }

    // Calculate dimensions
    // If compact mode is enabled, reduce the padding
    const padding = compact ? 16 : 32;
    const cellSize = (size - padding) / moduleCount // Adjust for padding
    const adjustedDotSize = cellSize * (compact ? Math.min(1, dotSize + 0.1) : dotSize) // Slightly larger dots in compact mode
    const cornerRadius = cellSize * (compact ? 0.4 : 0.5) // Slightly smaller corner radius in compact mode
    
    // Store values in refs for later use
    cellSizeRef.current = cellSize
    cornerRadiusRef.current = cornerRadius

    // Create background
    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    background.setAttribute('width', '100%')
    background.setAttribute('height', '100%')
    background.setAttribute('fill', 'transparent')
    svgRef.current.appendChild(background)

    // Track which cells are part of finder patterns to avoid duplicates
    const finderCells = new Set();
    
    // Create the three finder patterns with rounded outer corners
    if (moduleCount >= 7) {
      // Function to create a finder pattern with proper structure
      const createFinderPattern = (x: number, y: number) => {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        
        // Create a unique ID for this finder pattern's mask
        const maskId = `finder-mask-${x}-${y}`;
        
        // 1. Create a mask that will cut out the middle area
        const mask = document.createElementNS('http://www.w3.org/2000/svg', 'mask');
        mask.setAttribute('id', maskId);
        
        // White background for the mask (opaque part)
        const maskBackground = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        maskBackground.setAttribute('x', x.toString());
        maskBackground.setAttribute('y', y.toString());
        maskBackground.setAttribute('width', (7 * cellSize).toString());
        maskBackground.setAttribute('height', (7 * cellSize).toString());
        maskBackground.setAttribute('fill', 'white');
        mask.appendChild(maskBackground);
        
        // Black cutout for the middle square (transparent part)
        const middleSize = 5 * cellSize;
        const middleX = x + cellSize;
        const middleY = y + cellSize;
        const middleRadius = cornerRadius * (compact ? 0.6 : 0.7); // Adjust corner radius for compact mode
        
        // Create middle square cutout with rounded corners
        const middleCutout = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        let middleD = '';
        middleD += `M ${middleX + middleRadius} ${middleY} `; // Start at top edge with rounded corner
        middleD += `h ${middleSize - middleRadius * 2} `; // Top edge
        middleD += `a ${middleRadius} ${middleRadius} 0 0 1 ${middleRadius} ${middleRadius} `; // Top-right corner
        middleD += `v ${middleSize - middleRadius * 2} `; // Right edge
        middleD += `a ${middleRadius} ${middleRadius} 0 0 1 ${-middleRadius} ${middleRadius} `; // Bottom-right corner
        middleD += `h ${-middleSize + middleRadius * 2} `; // Bottom edge
        middleD += `a ${middleRadius} ${middleRadius} 0 0 1 ${-middleRadius} ${-middleRadius} `; // Bottom-left corner
        middleD += `v ${-middleSize + middleRadius * 2} `; // Left edge
        middleD += `a ${middleRadius} ${middleRadius} 0 0 1 ${middleRadius} ${-middleRadius} `; // Top-left corner
        middleD += 'Z'; // Close path
        
        middleCutout.setAttribute('d', middleD);
        middleCutout.setAttribute('fill', 'black'); // Black in mask = transparent
        mask.appendChild(middleCutout);
        
        // Add the mask to the SVG
        svgRef.current?.appendChild(mask);
        
        // 2. Outer square (7x7) with rounded corners
        const outerSize = 7 * cellSize;
        const outerSquare = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        let d = '';
        d += `M ${x + cornerRadius} ${y} `; // Start at top edge with rounded corner
        d += `h ${outerSize - cornerRadius * 2} `; // Top edge
        d += `a ${cornerRadius} ${cornerRadius} 0 0 1 ${cornerRadius} ${cornerRadius} `; // Top-right corner
        d += `v ${outerSize - cornerRadius * 2} `; // Right edge
        d += `a ${cornerRadius} ${cornerRadius} 0 0 1 ${-cornerRadius} ${cornerRadius} `; // Bottom-right corner
        d += `h ${-outerSize + cornerRadius * 2} `; // Bottom edge
        d += `a ${cornerRadius} ${cornerRadius} 0 0 1 ${-cornerRadius} ${-cornerRadius} `; // Bottom-left corner
        d += `v ${-outerSize + cornerRadius * 2} `; // Left edge
        d += `a ${cornerRadius} ${cornerRadius} 0 0 1 ${cornerRadius} ${-cornerRadius} `; // Top-left corner
        d += 'Z'; // Close path
        
        outerSquare.setAttribute('d', d);
        outerSquare.setAttribute('fill', effectiveDotColor);
        outerSquare.setAttribute('opacity', dotOpacity.toString());
        outerSquare.setAttribute('mask', `url(#${maskId})`);
        group.appendChild(outerSquare);
        
        // 3. Inner square (3x3)
        const innerSize = 3 * cellSize;
        const innerX = x + 2 * cellSize;
        const innerY = y + 2 * cellSize;
        const innerRadius = cornerRadius * (compact ? 0.4 : 0.5); // Adjust corner radius for compact mode
        
        // Create inner square with rounded corners using path
        const innerSquare = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        let innerD = '';
        innerD += `M ${innerX + innerRadius} ${innerY} `; // Start at top edge with rounded corner
        innerD += `h ${innerSize - innerRadius * 2} `; // Top edge
        innerD += `a ${innerRadius} ${innerRadius} 0 0 1 ${innerRadius} ${innerRadius} `; // Top-right corner
        innerD += `v ${innerSize - innerRadius * 2} `; // Right edge
        innerD += `a ${innerRadius} ${innerRadius} 0 0 1 ${-innerRadius} ${innerRadius} `; // Bottom-right corner
        innerD += `h ${-innerSize + innerRadius * 2} `; // Bottom edge
        innerD += `a ${innerRadius} ${innerRadius} 0 0 1 ${-innerRadius} ${-innerRadius} `; // Bottom-left corner
        innerD += `v ${-innerSize + innerRadius * 2} `; // Left edge
        innerD += `a ${innerRadius} ${innerRadius} 0 0 1 ${innerRadius} ${-innerRadius} `; // Top-left corner
        innerD += 'Z'; // Close path
        
        innerSquare.setAttribute('d', innerD);
        innerSquare.setAttribute('fill', effectiveDotColor);
        innerSquare.setAttribute('opacity', dotOpacity.toString());
        group.appendChild(innerSquare);
        
        return group;
      };
      
      // Top-left finder pattern
      const topLeftX = 16;
      const topLeftY = 16;
      const topLeftPattern = createFinderPattern(topLeftX, topLeftY);
      svgRef.current.appendChild(topLeftPattern);
      
      // Top-right finder pattern
      const topRightX = (moduleCount - 7) * cellSize + 16;
      const topRightY = 16;
      const topRightPattern = createFinderPattern(topRightX, topRightY);
      svgRef.current.appendChild(topRightPattern);
      
      // Bottom-left finder pattern
      const bottomLeftX = 16;
      const bottomLeftY = (moduleCount - 7) * cellSize + 16;
      const bottomLeftPattern = createFinderPattern(bottomLeftX, bottomLeftY);
      svgRef.current.appendChild(bottomLeftPattern);
      
      // Mark all cells in finder patterns
      for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 7; j++) {
          // Top-left finder
          finderCells.add(`${i},${j}`);
          
          // Top-right finder
          finderCells.add(`${i},${j + moduleCount - 7}`);
          
          // Bottom-left finder
          finderCells.add(`${i + moduleCount - 7},${j}`);
        }
      }
    }

    // Draw each dot for non-finder pattern cells
    for (let i = 0; i < moduleCount; i++) {
      for (let j = 0; j < moduleCount; j++) {
        const index = i * moduleCount + j;
        
        // Skip if this is a light module (false) or part of a finder pattern
        if (!qrCodeData[index] || finderCells.has(`${i},${j}`)) continue;
        
        // Calculate position of this cell
        const x = j * cellSize + (padding / 2); // Add padding
        const y = i * cellSize + (padding / 2); // Add padding
        
        // Draw circle for all other modules
        const centerX = x + cellSize / 2;
        const centerY = y + cellSize / 2;
        
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', centerX.toString());
        circle.setAttribute('cy', centerY.toString());
        circle.setAttribute('r', (adjustedDotSize / 2).toString());
        circle.setAttribute('fill', effectiveDotColor);
        circle.setAttribute('opacity', dotOpacity.toString());
        svgRef.current.appendChild(circle);
      }
    }

    setIsLoaded(true)
  }, [qrCodeData, moduleCount, size, effectiveDotColor, dotOpacity, dotSize, currentTheme, compact])

  // Handle button clicks
  const handleDownloadQR = () => {
    // Call the downloadImage method directly
    downloadImage(`qrcode.png`);
  };
  
  const handleCopyQR = async () => {
    // Call the copyToClipboard method directly
    const success = await copyToClipboard();
    
    if (success) {
      setQrCopied(true);
      setTimeout(() => setQrCopied(false), 2000);
      console.log('[qr-code] QR code copied to clipboard');
    }
  };

  // Function to download image
  const downloadImage = (filename = 'qrcode.png') => {
    if (!svgRef.current || !containerRef.current) return;
    
    // Use a scale factor for higher resolution
    const scaleFactor = 4;
    
    // Create a canvas element with higher resolution
    const canvas = document.createElement('canvas');
    canvas.width = size * scaleFactor;
    canvas.height = size * scaleFactor;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Always set background color to white for export
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Scale the context to increase resolution
    ctx.scale(scaleFactor, scaleFactor);
    
    // Create a temporary clone of the SVG with black dots for export
    const svgClone = svgRef.current.cloneNode(true) as SVGSVGElement;
    
    // Set the SVG background to white
    const backgroundRect = svgClone.querySelector('rect');
    if (backgroundRect) {
      backgroundRect.setAttribute('fill', '#FFFFFF');
    } else {
      // Create a background rect if it doesn't exist
      const newBackground = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      newBackground.setAttribute('width', '100%');
      newBackground.setAttribute('height', '100%');
      newBackground.setAttribute('fill', '#FFFFFF');
      svgClone.insertBefore(newBackground, svgClone.firstChild);
    }
    
    // Set all finder patterns and dots to black
    svgClone.querySelectorAll('path, circle, rect').forEach(element => {
      // Skip background elements
      if (element.getAttribute('fill') === 'transparent' || element === backgroundRect) {
        return;
      }
      // Set all QR elements to black
      element.setAttribute('fill', '#000000');
      // Ensure full opacity
      element.setAttribute('opacity', '1');
    });
    
    // Fix SVG masks for export
    fixSvgMasksForExport(svgClone, cellSizeRef.current, cornerRadiusRef.current);
    
    // Convert SVG to data URL
    const svgData = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    
    // Create image from SVG
    const img = new Image();
    img.onload = () => {
      // Draw SVG to canvas
      ctx.drawImage(img, 0, 0, size, size);
      
      // Get logo element
      const logoElement = containerRef.current?.querySelector('.logo-container');
      if (logoElement) {
        // Create a temporary canvas for the logo
        const logoCanvas = document.createElement('canvas');
        logoCanvas.width = logoSize * scaleFactor;
        logoCanvas.height = logoSize * scaleFactor;
        const logoCtx = logoCanvas.getContext('2d');
        if (logoCtx) {
          // Scale the logo context
          logoCtx.scale(scaleFactor, scaleFactor);
          
          // Draw logo to canvas
          logoCtx.fillStyle = 'white';
          logoCtx.beginPath();
          logoCtx.arc(logoSize/2, logoSize/2, logoSize/2, 0, Math.PI * 2);
          logoCtx.fill();
          
          // Draw logo to main canvas
          ctx.drawImage(logoCanvas, (size - logoSize) / 2, (size - logoSize) / 2, logoSize, logoSize);
        }
      }
      
      // Convert canvas to data URL and download
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      link.click();
      
      // Clean up
      URL.revokeObjectURL(svgUrl);
    };
    img.src = svgUrl;
  };

  // Helper function to fix SVG masks for export
  const fixSvgMasksForExport = (svgClone: SVGSVGElement, cellSize: number, cornerRadius: number) => {
    // Fix mask references for export - masks often don't work in data URLs
    // Instead, we'll recreate the finder patterns without masks
    svgClone.querySelectorAll('[mask]').forEach(element => {
      // Remove the mask attribute
      element.removeAttribute('mask');
      
      // Get the position from the element's transform or directly from the path
      // The path data format is complex, so we'll extract the position more reliably
      const pathData = element.getAttribute('d') || '';
      const matches = pathData.match(/M\s+([0-9.]+)\s+([0-9.]+)/);
      const x = matches ? parseFloat(matches[1] || '0') - cornerRadius : 0; // Adjust for the corner radius offset
      const y = matches ? parseFloat(matches[2] || '0') : 0;
      
      // Create middle square (5x5) with proper position
      const middleSquare = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const middleSize = 5 * cellSize;
      const middleX = x + cellSize;
      const middleY = y + cellSize;
      const middleRadius = cornerRadius * 0.7;
      
      let middleD = '';
      middleD += `M ${middleX + middleRadius} ${middleY} `; // Start at top edge with rounded corner
      middleD += `h ${middleSize - middleRadius * 2} `; // Top edge
      middleD += `a ${middleRadius} ${middleRadius} 0 0 1 ${middleRadius} ${middleRadius} `; // Top-right corner
      middleD += `v ${middleSize - middleRadius * 2} `; // Right edge
      middleD += `a ${middleRadius} ${middleRadius} 0 0 1 ${-middleRadius} ${middleRadius} `; // Bottom-right corner
      middleD += `h ${-middleSize + middleRadius * 2} `; // Bottom edge
      middleD += `a ${middleRadius} ${middleRadius} 0 0 1 ${-middleRadius} ${-middleRadius} `; // Bottom-left corner
      middleD += `v ${-middleSize + middleRadius * 2} `; // Left edge
      middleD += `a ${middleRadius} ${middleRadius} 0 0 1 ${middleRadius} ${-middleRadius} `; // Top-left corner
      middleD += 'Z'; // Close path
      
      middleSquare.setAttribute('d', middleD);
      middleSquare.setAttribute('fill', 'white');
      
      // Add the middle square after the outer square
      element.parentNode?.insertBefore(middleSquare, element.nextSibling);
    });
    
    // Remove all mask definitions as they won't be needed
    svgClone.querySelectorAll('mask').forEach(mask => {
      mask.remove();
    });
  };

  // Function to copy to clipboard
  const copyToClipboard = async (): Promise<boolean> => {
    if (!svgRef.current || !containerRef.current) return false;
    
    try {
      // More accurate Safari detection
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent) && 
                       !/chrome|crios|crmo/i.test(navigator.userAgent);
      console.log('[qr-code] Browser detection - Safari:', isSafari, 'User Agent:', navigator.userAgent);
      
      // For Safari, try a simpler approach first - just copy the URL
      if (isSafari) {
        try {
          console.log('[qr-code] Using Safari-specific approach - copying URL instead of image');
          await navigator.clipboard.writeText(url);
          console.log('[qr-code] Successfully copied URL to clipboard');
          // return true;
        } catch (err) {
          console.error('[qr-code] Failed to copy URL in Safari:', err);
          // If this fails, we'll try the image approach below
        }
      }
      
      // Use a scale factor for higher resolution
      const scaleFactor = 2;
      
      // Create a canvas element with higher resolution
      const canvas = document.createElement('canvas');
      canvas.width = size * scaleFactor;
      canvas.height = size * scaleFactor;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      
      // Always set background color to white for export
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Scale the context to increase resolution
      ctx.scale(scaleFactor, scaleFactor);

      console.log('[qr-code] Preparing to copy to clipboard')
      
      // Create a temporary clone of the SVG with black dots for export
      const svgClone = svgRef.current.cloneNode(true) as SVGSVGElement;
      
      // Set the SVG background to white
      const backgroundRect = svgClone.querySelector('rect');
      if (backgroundRect) {
        backgroundRect.setAttribute('fill', '#FFFFFF');
      } else {
        // Create a background rect if it doesn't exist
        const newBackground = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        newBackground.setAttribute('width', '100%');
        newBackground.setAttribute('height', '100%');
        newBackground.setAttribute('fill', '#FFFFFF');
        svgClone.insertBefore(newBackground, svgClone.firstChild);
      }
      
      // Set all finder patterns and dots to black
      svgClone.querySelectorAll('path, circle, rect').forEach(element => {
        // Skip background elements
        if (element.getAttribute('fill') === 'transparent' || element === backgroundRect) {
          return;
        }
        // Set all QR elements to black
        element.setAttribute('fill', '#000000');
        // Ensure full opacity
        element.setAttribute('opacity', '1');
      });

      console.log('[qr-code] Cloned SVG')
      
      // Fix SVG masks for export
      fixSvgMasksForExport(svgClone, cellSizeRef.current, cornerRadiusRef.current);
      
      // Convert SVG to data URL
      const svgData = new XMLSerializer().serializeToString(svgClone);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      
      // Create image from SVG
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = async () => {
          // Draw SVG to canvas
          ctx.drawImage(img, 0, 0, size, size);
          
          try {
            // Try to copy the image to clipboard
            canvas.toBlob(async (blob) => {
              if (blob) {
                try {
                  // Use the clipboard API to copy the image
                  const item = new ClipboardItem({ 'image/png': blob });
                  console.log('[qr-code] Created ClipboardItem', item)
                  await navigator.clipboard.write([item]);
                  console.log('[qr-code] Copied image to clipboard')
                  resolve(true);
                } catch (err) {
                  console.error('[qr-code] Failed to copy image to clipboard:', err);
                  
                  // Fallback: try to copy the URL instead
                  try {
                    await navigator.clipboard.writeText(url);
                    console.log('[qr-code] Fallback: Copied URL to clipboard instead of image');
                    resolve(true);
                  } catch (urlErr) {
                    console.error('[qr-code] Failed to copy URL as fallback:', urlErr);
                    resolve(false);
                  }
                }
              } else {
                console.error('[qr-code] Failed to create blob from canvas');
                
                // Fallback: try to copy the URL
                try {
                  await navigator.clipboard.writeText(url);
                  console.log('[qr-code] Fallback: Copied URL to clipboard instead of image');
                  resolve(true);
                } catch (urlErr) {
                  console.error('[qr-code] Failed to copy URL as fallback:', urlErr);
                  resolve(false);
                }
              }
              
              // Clean up
              URL.revokeObjectURL(svgUrl);
            }, 'image/png');
          } catch (err) {
            console.error('[qr-code] Error in blob creation:', err);
            
            // Fallback: try to copy the URL
            try {
              await navigator.clipboard.writeText(url);
              console.log('[qr-code] Fallback: Copied URL to clipboard after image load error');
              resolve(true);
            } catch (urlErr) {
              console.error('[qr-code] Failed to copy URL as fallback:', urlErr);
              resolve(false);
            }
            
            // Clean up
            URL.revokeObjectURL(svgUrl);
          }
        };
        
        img.onerror = async () => {
          console.error('[qr-code] Failed to load SVG image');
          
          // Fallback: try to copy the URL
          try {
            await navigator.clipboard.writeText(url);
            console.log('[qr-code] Fallback: Copied URL to clipboard after image load error');
            resolve(true);
          } catch (urlErr) {
            console.error('[qr-code] Failed to copy URL as fallback:', urlErr);
            resolve(false);
          }
          
          // Clean up
          URL.revokeObjectURL(svgUrl);
        };
        
        img.src = svgUrl;
      });
    } catch (err) {
      console.error('[qr-code] Error copying to clipboard:', err);
      
      // Final fallback: try to copy just the URL
      try {
        await navigator.clipboard.writeText(url);
        console.log('[qr-code] Final fallback: Copied URL to clipboard');
        return true;
      } catch (urlErr) {
        console.error('[qr-code] Failed to copy URL in final fallback:', urlErr);
        return false;
      }
    }
  };

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    downloadImage,
    copyToClipboard: async () => {
      const success = await copyToClipboard();
      return success;
    }
  }));

  return (
    <div className="flex flex-col items-center">
    <div 
      ref={containerRef}
      className={cn(
        "relative flex items-center justify-center rounded-lg shadow-md transition-opacity duration-300 bg-white/40 dark:bg-black/20",
        !isLoaded && "opacity-0",
        isLoaded && "opacity-100",
        className
      )}
      style={{ width: size, height: size }}
    >
      <svg 
        ref={svgRef}
        width={size} 
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        xmlns="http://www.w3.org/2000/svg"
      />
      </div>
      
      {showButtons && (
        <div className={cn(
          "flex gap-2 mt-4",
          !isLoaded && "opacity-0"
        )}>
          <button
            onClick={handleDownloadQR}
            className="flex bg-white/40 dark:bg-black/20 items-center gap-2 px-4 py-2 rounded-md bg-primary text-black/70 dark:text-white hover:bg-primary/90 transition-colors shadow-sm"
            aria-label="Download QR Code"
            title="Download QR Code"
          >
            <i className="fa-solid fa-arrow-right-to-bracket rotate-90 text-sm"></i>
          </button>
          <button
            onClick={handleCopyQR}
            className="flex items-center bg-white/40 dark:bg-black/20 gap-2 px-4 py-2 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shadow-sm relative"
            aria-label="Copy QR Code to clipboard"
            title="Copy QR Code to clipboard"
          >
            <div className="absolute top-0 right-0 left-0 bottom-0 flex items-center justify-center pointer-events-none">
              <i className={cn(
                'fa-solid fa-check transition-opacity duration-300',
                qrCopied ? 'opacity-100' : 'opacity-0'
              )}></i>
            </div>
            <i className={cn(
              'fa-solid fa-link text-sm transition-opacity duration-300',
              qrCopied ? 'opacity-0' : 'opacity-100'
            )}></i>
          </button>
        </div>
      )}
    </div>
  )
}) 