import api from './api'

export async function getUploadSignature(auth) {
  const token = await auth?.currentUser?.getIdToken?.()
  const { data } = await api.get('/media/signature', token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
  return data // { timestamp, signature, cloudName, apiKey }
}

export async function uploadImageToCloudinary(file, sig) {
  const url = `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`
  const form = new FormData()
  form.append('file', file)
  form.append('api_key', sig.apiKey)
  form.append('timestamp', sig.timestamp)
  form.append('signature', sig.signature)
  try {
    const res = await fetch(url, { method: 'POST', body: form })
    if (!res.ok) throw new Error('upload_failed')
    return await res.json()
  } catch (error) {
    throw new Error('network_error')
  }
}
