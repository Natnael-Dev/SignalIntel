// ════════════════════════════════════════════════════════════════
// useRagSearch — Hybrid RAG Search Hook
//
// Calls GET :8080/api/v1/search?q=... (Rust Brain Gateway).
// Falls back to demo results when backend is offline.
// ════════════════════════════════════════════════════════════════

import { useState, useCallback, useRef } from 'react'
import type { RagSearchResult } from '../types/intel'
import { generateDemoRagResults } from '../lib/demo'

const BRAIN_URL = import.meta.env.VITE_BRAIN_URL ?? 'http://localhost:8080'
const SEARCH_TIMEOUT_MS = 6000

export interface RagSearchState {
  results:     RagSearchResult[]
  isSearching: boolean
  isDemo:      boolean
  error:       string | null
  lastQuery:   string
  totalFound:  number
}

export function useRagSearch() {
  const [state, setState] = useState<RagSearchState>({
    results:     [],
    isSearching: false,
    isDemo:      false,
    error:       null,
    lastQuery:   '',
    totalFound:  0,
  })

  const abortRef = useRef<AbortController | null>(null)

  const search = useCallback(async (query: string) => {
    if (!query.trim()) return

    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort()
    const abort = new AbortController()
    abortRef.current = abort

    setState(prev => ({ ...prev, isSearching: true, error: null, lastQuery: query }))

    // Race the fetch against a timeout
    const timer = setTimeout(() => abort.abort(), SEARCH_TIMEOUT_MS)

    try {
      const res = await fetch(
        `${BRAIN_URL}/api/v1/search?q=${encodeURIComponent(query)}&limit=8`,
        { signal: abort.signal },
      )
      clearTimeout(timer)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: RagSearchResult[] = await res.json()
      setState(prev => ({
        ...prev,
        results: data,
        isSearching: false,
        isDemo: false,
        totalFound: data.length,
        error: null,
      }))
    } catch (err) {
      clearTimeout(timer)
      if ((err as Error).name === 'AbortError' && !abort.signal.aborted) return
      // Fallback to demo
      const demoResults = generateDemoRagResults(query)
      setState(prev => ({
        ...prev,
        results: demoResults,
        isSearching: false,
        isDemo: true,
        totalFound: demoResults.length,
        error: null,
      }))
    }
  }, [])

  const clearResults = useCallback(() => {
    setState(prev => ({ ...prev, results: [], totalFound: 0, lastQuery: '', error: null }))
  }, [])

  return { ...state, search, clearResults }
}
