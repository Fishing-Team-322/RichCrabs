import { describe, expect, it, vi, beforeEach } from 'vitest'
import { quizApi } from '../quizApi'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('quizApi contract', () => {
  beforeEach(() => {
    document.cookie = 'XSRF-TOKEN=test'
    vi.restoreAllMocks()
  })

  it('uses /api/v1/quizzes list and maps items', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ items: [{ quizId: 'q1', title: 'Quiz', questions: [1] }] }))
    const items = await quizApi.list()
    expect(items[0].id).toBe('q1')
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/quizzes', expect.objectContaining({ method: 'GET' }))
  })

  it('creates draft via /api/v1/quizzes', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ quiz: { quizId: 'q1', title: 'Quiz', questions: [] } }))
    const draft = await quizApi.draft()
    expect(draft.id).toBe('q1')
  })

  it('uses ai endpoints', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ jobId: 'j1', status: 'running' }))
      .mockResolvedValueOnce(jsonResponse({ jobId: 'j1', status: 'running' }))
    await quizApi.startGeneration({ topic: 'Topic', difficulty: 'easy', questionCount: 5, language: 'ru', format: 'single' })
    await quizApi.getGenerationStatus('j1')
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/quizzes/ai-generate', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/quizzes/ai-jobs/j1', expect.objectContaining({ method: 'GET' }))
  })

  it('uses quiz CRUD endpoints', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ quiz: { quizId: 'q1' } }))
      .mockResolvedValueOnce(jsonResponse({ quiz: { quizId: 'q1', title: 'a', questions: [] } }))
      .mockResolvedValueOnce(jsonResponse({ quiz: { quizId: 'q1', title: 'a', questions: [] } }))
      .mockResolvedValueOnce(jsonResponse({ quiz: { quizId: 'q1', title: 'a', questions: [] } }))
    await quizApi.create({ topic: 'a', questionCount: 3 })
    await quizApi.getDraft('q1')
    await quizApi.saveDraft('q1', { meta: { title: 't', language: 'ru', tags: [], coverUrl: '' }, questions: [] })
    await quizApi.publish('q1')
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/quizzes', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/quizzes/q1', expect.objectContaining({ method: 'GET' }))
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/v1/quizzes/q1', expect.objectContaining({ method: 'PATCH' }))
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/v1/quizzes/q1/publish', expect.objectContaining({ method: 'POST' }))
  })
})
