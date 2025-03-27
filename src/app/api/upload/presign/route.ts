import { NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { generateId } from '@/lib/id'
import { auth } from '@clerk/nextjs/server'

// Initialize S3 client exactly as shown in docs
const S3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT_URL,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || ''
  }
})

interface UploadRequest {
  fileName: string
  contentType: string
  projectId: string
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json() as UploadRequest
    const { fileName, contentType, projectId } = body

    if (!fileName || !contentType || !projectId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Generate a unique key for the file
    const fileExtension = fileName.split('.').pop()
    const key = `projects/${projectId}/images/${generateId()}.${fileExtension}`

    // Create presigned URL following docs example
    const url = await getSignedUrl(
      S3,
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        ContentType: contentType,
        Metadata: {
          userId,
          projectId,
          originalName: fileName
        }
      }),
      { expiresIn: 3600 }
    )

    return NextResponse.json({ url, key })
  } catch (error) {
    console.error('[Upload] Error generating presigned URL:', error)
    return NextResponse.json(
      { error: 'Failed to generate upload URL' },
      { status: 500 }
    )
  }
} 