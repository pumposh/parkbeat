'use client'

import { cn } from '@/lib/utils'
import { useState, useRef } from 'react'
import { QRCode, QRCodeRef } from '@/app/components/ui/qr-code'

interface ProjectShareProps {
  projectId: string
  isLoading?: boolean
}

export function ProjectShare({ projectId, isLoading = false }: ProjectShareProps) {
  const [copied, setCopied] = useState(false)
  const projectUrl = `${window.location.origin}/projects/${projectId}`
  const qrCodeRef = useRef<QRCodeRef>(null)
  
  const handleCopyLink = () => {
    navigator.clipboard.writeText(projectUrl)
    
    // Show copied indicator
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    
    // In a real implementation, you would show a toast notification
    console.log('Link copied to clipboard')
  }
  
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse bg-gray-200/50 dark:bg-black/20 h-6 w-1/2 rounded mb-4"></div>
        <div className="animate-pulse bg-gray-200/50 dark:bg-black/20 h-10 w-full rounded mb-4"></div>
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-1 animate-pulse bg-gray-200/50 dark:bg-black/20 h-10 rounded"></div>
          ))}
        </div>
      </div>
    )
  }
  
  return (
    <div className="space-y-0">
      {/* QR Code Section */}
      <div className="flex flex-col items-center justify-center py-4">
        <div className="relative opacity-70">
          <QRCode 
            ref={qrCodeRef}
            url={projectUrl} 
            size={220}
            showButtons={true}
            // No need to specify dotColor as it will adapt to theme automatically
          />
        </div>
      </div>
      
      <div className="space-y-0">
        <div className="flex flex-col gap-2">
          <label className="text-sm text-gray-500 dark:text-gray-400">Share via</label>
          <div className="flex gap-3">
            <button 
              onClick={handleCopyLink}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gray-100/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors relative"
              aria-label="Copy direct link"
            >
              <div className="absolute top-0 right-0 left-0 bottom-0 flex items-center justify-center pointer-events-none">
                <i className={cn(
                  'fa-solid fa-check transition-opacity duration-300',
                  copied ? 'opacity-100' : 'opacity-0'
                )}></i>
              </div>
              <i className={cn(
                'fa-solid fa-link text-lg transition-opacity duration-300',
                copied ? 'opacity-0' : 'opacity-100'
              )}></i>
            </button>
            <button 
              onClick={() => {
                const url = `https://twitter.com/intent/tweet?url=${encodeURIComponent(projectUrl)}&text=${encodeURIComponent('Check out this community project!')}`;
                window.open(url, '_blank');
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#1DA1F2]/10 text-[#1DA1F2] hover:bg-[#1DA1F2]/20 transition-colors"
              aria-label="Share on Twitter"
            >
              <i className="fa-brands fa-x-twitter text-lg"></i>
            </button>
            <button 
              onClick={() => {
                // Instagram doesn't support direct URL parameters for sharing
                // Copy the text and URL to clipboard first, then redirect to Instagram
                const shareText = 'Check out this community project!';
                const fullText = `${shareText} ${projectUrl}`;
                
                // Copy to clipboard
                navigator.clipboard.writeText(fullText)
                  .then(() => {
                    // Show a brief notification that content was copied (could use a toast here)
                    console.log('Content copied to clipboard');
                    
                    // Open Instagram - this will open the app on mobile or the website on desktop
                    window.open('https://www.instagram.com/', '_blank');
                  })
                  .catch(err => {
                    console.error('Failed to copy: ', err);
                    // Fallback - just open Instagram
                    window.open('https://www.instagram.com/', '_blank');
                  });
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#E1306C]/10 text-[#E1306C] hover:bg-[#E1306C]/20 transition-colors"
              aria-label="Share on Instagram"
            >
              <i className="fa-brands fa-instagram text-lg"></i>
            </button>
            <button 
              onClick={() => {
                const subject = encodeURIComponent('Check out this community project!');
                const body = encodeURIComponent(`I found this interesting project: ${projectUrl}`);
                window.location.href = `mailto:?subject=${subject}&body=${body}`;
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#34A853]/10 text-[#34A853] hover:bg-[#34A853]/20 transition-colors"
              aria-label="Share via Email"
            >
              <i className="fa-solid fa-envelope text-lg"></i>
            </button>
            <button 
              onClick={() => {
                const message = encodeURIComponent(`Check out this community project: ${projectUrl}`);
                window.location.href = `sms:?&body=${message}`;
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#5BC236]/10 text-[#5BC236] hover:bg-[#5BC236]/20 transition-colors"
              aria-label="Share via SMS"
            >
              <i className="fa-solid fa-comment text-lg"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
} 