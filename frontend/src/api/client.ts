// src/api/client.ts

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

function getToken() { return localStorage.getItem('token') }

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
        ...opts,
        headers: {
            'Content-Type': 'application/json',
            ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
            ...opts.headers,
        },
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
}

async function upload<T>(path: string, form: FormData): Promise<T> {
    // No Content-Type header — browser sets it automatically with boundary for multipart
    const res = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: {
            ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        },
        body: form,
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
}

export const api = {
    auth: {
        login: (email: string, password: string) =>
            request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
        register: (email: string, password: string) =>
            request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
    },
    materials: {
        upload: (file: File) => {
            const form = new FormData()
            form.append('file', file)
            return upload('/materials/', form)
        },
        list: () => request('/materials/'),
        get: (id: string) => request(`/materials/${id}`),
    },
    chat: {
        message: (session_id: string, material_id: string, message: string) =>
            request('/chat/message', { method: 'POST', body: JSON.stringify({ session_id, material_id, message }) }),
        sessions: () => request('/chat/sessions'),
        sessionMessages: (session_id: string) => request(`/chat/sessions/${session_id}/messages`),
    },
    lessons: {
        generate: (material_id: string, topic?: string) =>
            request('/lesson/generate', { method: 'POST', body: JSON.stringify({ material_id, topic }) }),
        checklist: (material_id: string, goal: string) =>
            request('/lesson/checklist', { method: 'POST', body: JSON.stringify({ material_id, goal }) }),
    },
    quiz: {
        generate: (material_id: string, topic?: string, n_questions = 8) =>
            request('/quiz/generate', { method: 'POST', body: JSON.stringify({ material_id, topic, n_questions }) }),
        submit: (quiz_attempt_id: string, answers: Record<string, string>) =>
            request('/quiz/submit', { method: 'POST', body: JSON.stringify({ quiz_attempt_id, answers }) }),
    },
    profile: {
        save: (answers: object) =>
            request('/profile/onboarding', { method: 'POST', body: JSON.stringify(answers) }),
        get: () => request('/profile/'),
        mastery: (material_id: string) => request(`/profile/mastery/${material_id}`),
        wiki: () => request('/profile/wiki'),
    },
    // sessionMessages: (session_id: string) =>
    //     request(`/chat/sessions/${session_id}/messages`),
}