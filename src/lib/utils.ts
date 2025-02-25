import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats a date to a string representing the distance from now
 * @param date The date to format
 * @param options Options for formatting
 * @returns A string representing the distance from now (e.g. "2 days ago")
 */
export function formatDistanceToNow(date: Date, options?: { addSuffix?: boolean }): string {
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  
  // Convert to appropriate time unit
  const minute = 60
  const hour = minute * 60
  const day = hour * 24
  const week = day * 7
  const month = day * 30
  const year = day * 365
  
  let result: string
  
  if (diffInSeconds < minute) {
    result = 'Just now'
  } else if (diffInSeconds < hour) {
    const minutes = Math.floor(diffInSeconds / minute)
    result = minutes === 1 ? '1 minute' : `${minutes} minutes`
  } else if (diffInSeconds < day) {
    const hours = Math.floor(diffInSeconds / hour)
    result = hours === 1 ? '1 hour' : `${hours} hours`
  } else if (diffInSeconds < week) {
    const days = Math.floor(diffInSeconds / day)
    result = days === 1 ? '1 day' : `${days} days`
  } else if (diffInSeconds < month) {
    const weeks = Math.floor(diffInSeconds / week)
    result = weeks === 1 ? '1 week' : `${weeks} weeks`
  } else if (diffInSeconds < year) {
    const months = Math.floor(diffInSeconds / month)
    result = months === 1 ? '1 month' : `${months} months`
  } else {
    const years = Math.floor(diffInSeconds / year)
    result = years === 1 ? '1 year' : `${years} years`
  }
  
  // Add suffix if requested
  if (options?.addSuffix) {
    result = `${result} ago`
  }
  
  return result
}
