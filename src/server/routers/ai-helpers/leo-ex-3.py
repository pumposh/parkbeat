import json
import requests
import time

api_key = "<YOUR_API_KEY>"
authorization = "Bearer %s" % api_key

headers = {
    "accept": "application/json",
    "content-type": "application/json",
    "authorization": authorization
}

# Get a presigned URL for uploading an image
url = "https://cloud.leonardo.ai/api/rest/v1/init-image"

payload = {"extension": "jpg"}

response = requests.post(url, json=payload, headers=headers)

print("Get a presigned URL for uploading an image: %s" % response.status_code)

# Upload image via presigned URL
fields = json.loads(response.json()['uploadInitImage']['fields'])

url = response.json()['uploadInitImage']['url']

# For getting the image later
image_id = response.json()['uploadInitImage']['id']

image_file_path = "/workspace/test.jpg"
files = {'file': open(image_file_path, 'rb')}

response = requests.post(url, data=fields, files=files)  # Header is not needed

print("Upload image via presigned URL: %s" % response.status_code)


# Generate with Image to Image
url = "https://cloud.leonardo.ai/api/rest/v1/generations"

payload = {
    "height": 512,
    "modelId": "1e60896f-3c26-4296-8ecc-53e2afecc132", # Setting model ID to Leonardo Diffusion XL
    "prompt": "An oil painting of a cat",
    "width": 512,
    "init_image_id": image_id,  # Only allows for one Image
    "init_strength": 0.5  # Must float between 0.1 and 0.9
}

response = requests.post(url, json=payload, headers=headers)

print("Generation of Images using Image to Image %s" % response.status_code)

# Get the generation of images
generation_id = response.json()['sdGenerationJob']['generationId']

url = "https://cloud.leonardo.ai/api/rest/v1/generations/%s" % generation_id

time.sleep(20)

response = requests.get(url, headers=headers)

print(response.text)

