// src/api/client.ts

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

function getToken() { return localStorage.getItem('token') }

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
        ...opts,
        headers: {
            'Content-Type': 'application/json',
            ...(getToken() ? { Authorization: `Bearer ${getToken()}` }: {}),
            ...opts.headers,
        },
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
}

export const api = {
    auth: {
        login: (email: string, password: string) =>
                request('/auth/login', {method: 'POST', body: JSON.stringify({email, password})}),
        register: (email: string, password: string) =>
                request('/auth/register', {method: 'POST', body: JSON.stringify({email, password})}),
    },
    materials: {
        upload: (file: File) => {
            const form = new FormData()
            form.append('file', file)
            return request('/materials/', {method: 'POST', body: form, headers:{Authorization: `Bearer ${getToken()}`}}) // no Content-Typoe, let browser set
        },
        list: () => request('/materials/'),
        get: (id: string) => request(`/materials/${id}`),
    },
    chat: {
        message: (session_id: string, material_id: string, message: string) =>
            request('/chat/message', {method: 'POST', body: JSON.stringify({session_id, material_id, message})}),
    },
    lessons: {
        generate: (material_id: string, topic?: string) =>
            request('/lesson/generate', {method: 'POST', body: JSON.stringify({material_id, topic})}),
    },
    quiz: {
        generate: (material_id: string, topic?: string, n_questions=8) =>
            request('/quiz/generate', {method: 'POST', body: JSON.stringify({material_id, topic, n_questions})}),
        submit: (quiz_attempt_id: string, answers: Record<string, string>) =>
            request('/quiz/submit', {method: 'POST', body: JSON.stringify({quiz_attempt_id, answers})}),
    },
    profile: {
        save: (answers: object) => request('/profile/onboarding', {method: 'POST', body: JSON.stringify(answers)}),
        get: () => request('/profile'),
    },
}