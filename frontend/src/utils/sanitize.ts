// src/utils/sanitize.ts

/*
 * strip characters that could cause prompt injection or xss
 * applied to all user text inputs before sending to the backend
 */

export function sanitizeInput(input: string): string {
    return input
        .slice(0, 4000)
        .replace(/<[^>]*>/g, '')
        .replace(/[^\x20-\x7E\n\r\t\u00A0-\uFFFF]/g, '')
        .trim()
}

/*
 * santize an answer map (quiz submissions)
 */
export function sanitizeAnswers(answers: Record<string, string>): Record<string, string> {
    return Object.fromEntries(
        Object.entries(answers).map(([k, v]) => [k, sanitizeInput(v)])
    )
}