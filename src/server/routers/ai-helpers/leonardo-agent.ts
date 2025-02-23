import { logger } from "@/lib/logger"

interface LeonardoGenerationParams {
  prompt: string
  negativePrompt?: string
  modelId?: string
  width?: number
  height?: number
  numImages?: number
  promptMagic?: boolean
  photoReal?: boolean
  initImageId?: string
  initStrength?: number
}

interface LeonardoGenerationResponse {
  generationId: string
  generations: Array<{
    url: string
    status: string
  }>
  generations_by_pk: {
    generated_images: Array<{
      url: string
    }>
    status: 'PENDING' | 'COMPLETE' | 'FAILED'
    id: string
  }
  generated_image_variation_generic: Array<{
    status: 'PENDING' | 'COMPLETE' | 'FAILED'
    url: string
    id: string
  }>
  sdGenerationJob: {
    apiCreditCost: number
    generationId: string
    generated_images: Array<{
      url: string
    }>
  }
  uploadInitImage: {
    fields: string
    url: string
    id: string
  }
  universalUpscaler?: {
    id: string
  }
  url?: string
}

interface LeonardoUpscaleParams {
  imageUrl: string
  upscaleMultiplier?: number
  creativityStrength?: number
  detailContrast?: number
  similarity?: number
  style?: 'ARTISTIC' | 'REALISTIC'
}

export interface ImageGenerationAgent {
  generateImage(params: LeonardoGenerationParams): Promise<{
    urls: string[]
    generationId: string
  }>
  reimagineFromPrompt(params: {
    originalImageUrl: string
    prompt: string
    projectContext?: string
  }): Promise<{
    urls: string[]
    generationId: string
  }>
  upscaleImage(params: LeonardoUpscaleParams): Promise<{
    url: string
    id: string
  }>
}

export class LeonardoAgent implements ImageGenerationAgent {
  private apiKey: string
  private baseUrl = 'https://cloud.leonardo.ai/api/rest/v1'
  private readonly MAX_ATTEMPTS = 30
  private readonly POLL_INTERVAL = 3000 // 3 seconds

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private async makeRequest(endpoint: string, method: 'GET' | 'POST', body?: any): Promise<LeonardoGenerationResponse> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    // First get the response text
    const responseText = await response.text()
    
    if (!response.ok) {
      const errorMessage = `Leonardo API error: ${response.statusText} (${response.status})`
      logger.error('[LeonardoAgent] API Error:', {
        status: response.status,
        statusText: response.statusText,
        responseText
      })
      throw new Error(errorMessage)
    }

    try {
      // Then parse it as JSON
      return JSON.parse(responseText)
    } catch (error) {
      logger.error('[LeonardoAgent] Error parsing response:', {
        error,
        responseText
      })
      throw new Error('Failed to parse Leonardo API response')
    }
  }

  private async pollForCompletion<T>(
    pollFn: () => Promise<{ status: string; result?: T }>,
    entityType: string
  ): Promise<T> {
    let attempts = 0
    
    while (attempts < this.MAX_ATTEMPTS) {
      const { status, result } = await pollFn()
      
      if (status === 'COMPLETE' && result) {
        return result
      } else if (status === 'FAILED') {
        throw new Error(`${entityType} failed`)
      }

      await new Promise(resolve => setTimeout(resolve, this.POLL_INTERVAL))
      attempts++
    }

    throw new Error(`${entityType} timed out after ${this.MAX_ATTEMPTS} attempts`)
  }

  private async uploadImage(imageUrl: string): Promise<string> {
    logger.info('[LeonardoAgent] Starting image upload process', { imageUrl })
    
    try {
      // Get upload URL
      const initResponse = await this.makeRequest('/init-image', 'POST', {
        extension: 'jpg'
      })

      logger.info('[LeonardoAgent] Init response', { initResponse })

      if (!initResponse.uploadInitImage?.fields || !initResponse.uploadInitImage?.url || !initResponse.uploadInitImage?.id) {
        throw new Error('Invalid init-image response structure')
      }

      // Upload to presigned URL - exactly matching Python example
      const uploadUrl = initResponse.uploadInitImage.url
      const imageId = initResponse.uploadInitImage.id
      
      // Parse fields exactly as Python does - keep it minimal
      const fields = JSON.parse(initResponse.uploadInitImage.fields as string)
      
      logger.info('[LeonardoAgent] Got presigned URL for upload', { 
        uploadUrl,
        imageId,
        fieldCount: Object.keys(fields).length,
        fields
      })

      // Fetch the image with proper error handling
      const imageResponse = await fetch(imageUrl)
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch source image: ${imageResponse.status} ${imageResponse.statusText}`)
      }

      const contentType = imageResponse.headers.get('content-type')
      const imageBlob = await imageResponse.blob()
      
      // Validate image size and type
      if (imageBlob.size > 10 * 1024 * 1024) { // 10MB limit
        throw new Error('Image size exceeds 10MB limit')
      }

      if (!contentType?.startsWith('image/')) {
        throw new Error(`Invalid content type: ${contentType}`)
      }

      // Create FormData exactly as Python does
      const formData = new FormData()
      
      // Add fields first, in a specific order
      Object.entries(fields).forEach(([key, value]) => {
        formData.append(key, value as string)
      })
      
      // Add file last, exactly as Python does
      formData.append('file', new Blob([await imageBlob.arrayBuffer()], { type: 'image/jpeg' }), 'image.jpg')

      logger.info('[LeonardoAgent] Uploading image to Leonardo', { 
        blobSize: imageBlob.size,
        blobType: imageBlob.type,
        formDataFields: Object.keys(fields).length
      })

      // Make upload request without any custom headers
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        body: formData
      })

      if (!uploadResponse.ok) {
        const responseText = await uploadResponse.text()
        logger.error('[LeonardoAgent] Upload failed with response:', {
          status: uploadResponse.status,
          text: responseText,
          fields: Object.keys(fields)
        })
        throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}\nResponse: ${responseText}`)
      }

      logger.info('[LeonardoAgent] Successfully uploaded image', { imageId })
      return imageId

    } catch (error) {
      logger.error('[LeonardoAgent] Image upload failed:', error)
      throw error
    }
  }

  async generateImage({
    prompt,
    negativePrompt = "low quality, distorted, messy environment, messy background",
    modelId = "e316348f-7773-490e-adcd-46757c738eb7", // Default to Stable Diffusion XL
    width = 1024,
    height = 1024,
    numImages = 1,
    promptMagic = true,
    photoReal = true,
    initImageId,
    initStrength = 0.3,
  }: LeonardoGenerationParams) {
    logger.info('[LeonardoAgent] Starting image generation', { 
      prompt,
      modelId,
      initImageId: initImageId || 'none'
    })

    try {

      const body = {
        prompt,
        negative_prompt: negativePrompt,
        modelId,
        width,
        height,
        // promptMagic,
        num_images: numImages,
        ...(initImageId ? {
          init_image_id: initImageId,
          init_strength: Math.max(0.1, Math.min(0.9, initStrength)) // Clamp between 0.1 and 0.9
        } : {})
      }

      logger.info('[LeonardoAgent] Generation request body', { body })

      // Create a generation request
      const generationResponse = await this.makeRequest('/generations', 'POST', body)

      logger.info('[LeonardoAgent] Generation response', { generationResponse })
      const generationId = generationResponse.sdGenerationJob?.generationId
      logger.info('[LeonardoAgent] Generation initiated', { 
        generationId,
        isImageToImage: !!initImageId 
      })

      // Poll for generation completion
      const result = await this.pollForCompletion(
        async () => {
          const statusResponse = await this.makeRequest(`/generations/${generationId}`, 'GET')
          logger.info('[LeonardoAgent] Status response', { statusResponse })
          const generation = statusResponse.generations_by_pk
          return {
            status: generation.status,
            result: generation.status === 'COMPLETE' ? {
              urls: generation.generated_images.map(gen => gen.url),
              generationId
            } : undefined
          }
        },
        'Image generation'
      )

      return result
    } catch (error) {
      logger.error('[LeonardoAgent] Error generating image:', (error as Error).message)
      throw error
    }
  }

  async upscaleImage({
    imageUrl,
    upscaleMultiplier = 1.5,
    creativityStrength = 5,
    detailContrast = 5,
    similarity = 5,
    style = 'ARTISTIC'
  }: LeonardoUpscaleParams): Promise<{ url: string; id: string }> {
    logger.info('[LeonardoAgent] Starting image upscaling')

    try {
      // Upload the image first
      const imageId = await this.uploadImage(imageUrl)
      
      // Request upscaling
      const upscaleResponse = await this.makeRequest('/variations/universal-upscaler', 'POST', {
        ultraUpscaleStyle: style,
        creativityStrength,
        detailContrast,
        similarity,
        upscaleMultiplier,
        initImageId: imageId
      })

      const variationId = upscaleResponse.universalUpscaler?.id
      if (!variationId) {
        throw new Error('No variation ID received from upscale request')
      }

      logger.info('[LeonardoAgent] Upscaling initiated', { variationId })

      // Poll for upscaling completion
      const result = await this.pollForCompletion(
        async () => {
          const statusResponse = await this.makeRequest(`/variations/${variationId}`, 'GET')

          const status = statusResponse.generated_image_variation_generic[0]?.status || 'PENDING'
          const url = statusResponse.generated_image_variation_generic[0]?.url || ''

          return {
            status,
            result: status === 'COMPLETE' ? {
              url,
              id: variationId
            } : undefined
          }
        },
        'Image upscaling'
      )

      return result
    } catch (error) {
      logger.error('[LeonardoAgent] Error upscaling image:', error)
      throw error
    }
  }

  async reimagineFromPrompt({
    originalImageUrl,
    prompt,
    projectContext,
  }: {
    originalImageUrl: string
    prompt: string
    projectContext?: string
  }) {
    logger.info('[LeonardoAgent] Starting image reimagination', { prompt })

    try {
      // First upload the original image
      const initImageId = await this.uploadImage(originalImageUrl)
      logger.info('[LeonardoAgent] Original image uploaded', { initImageId })

      const enhancedPrompt = `
        Create a photorealistic visualization of this community improvement project.
        ${prompt}
        
        Project Context: ${projectContext || 'A community improvement project'}
        
        Required Changes:
        1. Make SUBSTANTIAL and CLEARLY VISIBLE changes to implement the project
        2. Add all new elements described in the prompt in a prominent way
        3. Ensure changes are realistic and well-integrated
        
        Technical Requirements:
        - Maintain the EXACT same camera angle and perspective as the original
        - Only modify the specific areas mentioned in the prompt
        - Maintain a high level of photorealism and realism
        - Do not hallucinate elements outside of the prompt that are not in the original image
        
        Style Guidelines:
        - Create clean, professional improvements
        - Maintain a tidy, well-maintained appearance
      `.trim()

      console.log('[LeonardoAgent] Enhanced prompt', { enhancedPrompt })
      const models = {
        Pheonix: "de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3",
        Albedo: "2067ae52-33fd-4a82-bb92-c2c55e7d2786"
      }

      // Use image-to-image generation with the uploaded image
      return this.generateImage({
        prompt: enhancedPrompt,
        modelId: models.Pheonix,
        photoReal: true,
        promptMagic: true,
        width: 960,
        height: 960,
        initImageId,
        initStrength: 0.5, // Higher value = more influence from the prompt, lower = more from original image
        negativePrompt: "low quality, distorted, messy environment, messy background, unrealistic changes, poor integration, text, watermark, signature, morbid, mutilated, extra fingers, mutated hands, poorly drawn hands, poorly drawn face, mutation, deformed, blurry, dehydrated"
      })
    } catch (error) {
      logger.error('[LeonardoAgent] Error in reimagination process:', error)
      throw error
    }
  }
} 