const API_URL = ""
export const getAuthHeaders = createAuthHeaders

export function getApiUrl() {
  return API_URL
}

// --- login ---
export async function login(username: string, password: string) {
  const res = await fetch(`${API_URL}/api/v1/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      login: username,     
      password,
    }),
  })

  const text = await res.text()

  if (!res.ok) {
    throw new Error(text || "login failed")
  }

  let data: any = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = {}
  }

  console.log("LOGIN RESPONSE:", data)

  const token =
    data?.token ||
    data?.access_token ||
    data?.accessToken ||
    data?.jwt ||
    data?.data?.token ||
    data?.data?.access_token

  if (!token) {
    throw new Error("token not found in response")
  }

  setToken(token)
  return token
}

// --- token ---
export function setToken(token: string) {
  localStorage.setItem("token", token)
}

export function getToken() {
  return localStorage.getItem("token")
}

export function clearToken() {
  localStorage.removeItem("token")
}

// --- headers ---
export function createAuthHeaders(): HeadersInit {
  const token = getToken()

  if (!token) return {}

  return {
    Authorization: `Bearer ${token}`,
  }
}

// --- обработка 401 ---
export function isUnauthorized(status: number, text?: string) {
  if (status === 401 || status === 403) return true

  const normalized = (text || "").toLowerCase()

  return (
    normalized.includes("unauthorized") ||
    normalized.includes("invalid token") ||
    normalized.includes("token expired") ||
    normalized.includes("forbidden") ||
    normalized.includes("missing token")
  )
}
