import type { AppRouter } from "@/server"
import { createClient } from "jstack"

// In development, use the Cloudflare Worker dev server
// In production, use Next.js API routes
const baseUrl = process.env.NODE_ENV === "development" 
  ? "http://localhost:8080/api"
  : "https://parkbeat.pumposh.workers.dev/api"

/**
 * Your type-safe API client
 * @see https://jstack.app/docs/backend/api-client
 */
export const client = createClient<AppRouter>({
  baseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include',
})
