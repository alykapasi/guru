// src/api/client.ts

import { sanitizeInput, sanitizeAnswers } from '../utils/sanitize'

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
    const res = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
        body: form,
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
}

export const api = {
    auth: {
        login: (email: string, password: string) =>
            request('/auth/login',    { method: 'POST', body: JSON.stringify({ email, password }) }),
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
        get:  (id: string) => request(`/materials/${id}`),
        parts: (id: string) => request(`/materials/${id}/parts`),
        rename: (id: string, title: string) =>
            request(`/materials/${id}/rename`, {
                method: "PATCH",
                body: JSON.stringify({ title })
            }),
        delete: (id: string) =>
            request(`/materials/${id}`, { method: "DELETE" }),
    },
    sessions: {
        create: (material_ids: string[], goal: string) =>
            request('/chat/sessions/create', {
                method: 'POST',
                body: JSON.stringify({ material_ids, goal })
            }),
        addMaterial: (session_id: string, material_id: string) =>
            request(`/chat/sessions/${session_id}/materials`, {
                method: 'POST',
                body: JSON.stringify({ material_id })
            }),
        list: () => request('/chat/sessions'),
        messages: (session_id: string) => request(`/chat/sessions/${session_id}/messages`),
    },
    chat: {
        message: (session_id: string, message: string) =>
            request('/chat/message', {
                method: 'POST',
                body: JSON.stringify({ session_id, message: sanitizeInput(message) })
            }),
    },
    lessons: {
        generate: (session_id: string, topic?: string) =>
            request('/lesson/generate', {
                method: 'POST',
                body: JSON.stringify({ session_id, topic: topic ? sanitizeInput(topic) : undefined })
            }),
        checklist: (session_id: string, goal: string) =>
            request('/lesson/checklist', {
                method: 'POST',
                body: JSON.stringify({ session_id, goal })
            }),
    },
    quiz: {
        generate: (session_id: string, topic?: string, n_questions = 8) =>
            request('/quiz/generate', {
                method: 'POST',
                body: JSON.stringify({ session_id, topic, n_questions })
            }),
        submit: (quiz_attempt_id: string, answers: Record<string, string>) =>
            request('/quiz/submit', {
                method: 'POST',
                body: JSON.stringify({ quiz_attempt_id, answers: sanitizeAnswers(answers) })
            }),
        cloze: {
            generate: (session_id: string, topic?: string, n_exercises = 5) =>
                request('/quiz/cloze/generate', {
                    method: 'POST',
                    body: JSON.stringify({ session_id, topic, n_exercises })
                }),
            submit: (quiz_attempt_id: string, answers: Record<string, string>) =>
                request('/quiz/cloze/submit', {
                    method: 'POST',
                    body: JSON.stringify({ quiz_attempt_id, answers })
                }),
        }
    },
    profile: {
        save: (answers: object) =>
            request('/profile/onboarding', { method: 'POST', body: JSON.stringify(answers) }),
        get: () => request('/profile/'),
        mastery: (material_id: string) => request(`/profile/mastery/${material_id}`),
        wiki: () => request('/profile/wiki'),
        selfReport: (session_id: string, concept: string, confidence: number) =>
            request('/profile/mastery/self-report', {
                method: 'POST',
                body: JSON.stringify({ session_id, concept, confidence })
            }),
    },
    flashcards: {
        generate: (session_id: string, concept?: string, n_cards = 10) =>
            request('/flashcards/generate', {
                method: 'POST',
                body: JSON.stringify({ session_id, concept, n_cards })
            }),
        due: (session_id?: string, limit = 50) => {
            const params = new URLSearchParams({ limit: String(limit) })
            if (session_id) params.set('session_id', session_id)
            return request(`/flashcards/due?${params.toString()}`)
        },
        all: (session_id?: string) => {
            const params = new URLSearchParams()
            if (session_id) params.set('session_id', session_id)
            const qs = params.toString()
            return request(`/flashcards/all${qs ? `?${qs}` : ''}`)
        },
        review: (card_id: string, grade: number) =>
            request(`/flashcards/${card_id}/review`, {
                method: 'POST',
                body: JSON.stringify({ grade })
            }),
        delete: (card_id: string) =>
            request(`/flashcards/${card_id}`, { method: 'DELETE' }),
    },
    chunks: {
        get: (chunk_id: string) => request(`/materials/chunks/${chunk_id}`),
    },
    stats: {
        overview:           () => request('/stats/overview'),
        masteryOverTime:    () => request('/stats/mastery-over-time'),
        byMaterial:         () => request('/stats/by-material'),
        activity:           () => request('/stats/activity'),
        weakConcepts:       () => request('/stats/weak-concepts'),
        quizHistory:        () => request('/stats/quiz-history'),
    },
}