'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ModelSelectorProps {
  provider: string | null
  model: string | null
  onProviderChange: (v: string) => void
  onModelChange: (v: string) => void
  availableProviders: Array<{
    name: string
    models: Array<{ id: string; name: string }>
  }>
}

export function ModelSelector({
  provider,
  model,
  onProviderChange,
  onModelChange,
  availableProviders,
}: ModelSelectorProps) {
  const selectedProvider = availableProviders.find((p) => p.name === provider)
  const models = selectedProvider?.models ?? []
  const selectedModel = models.find((m) => m.id === model)

  const [modelOpen, setModelOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const filtered = search
    ? models.filter((m) =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.id.toLowerCase().includes(search.toLowerCase())
      )
    : models

  // Close on click outside
  useEffect(() => {
    if (!modelOpen) return
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setModelOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [modelOpen])

  // Focus search input when opening
  useEffect(() => {
    if (modelOpen) {
      setTimeout(() => searchRef.current?.focus(), 0)
    }
  }, [modelOpen])

  return (
    <div className="flex items-center gap-2">
      <Select
        value={provider ?? undefined}
        onValueChange={(v) => {
          onProviderChange(v)
          const newProvider = availableProviders.find((p) => p.name === v)
          if (newProvider?.models[0]) {
            onModelChange(newProvider.models[0].id)
          }
        }}
      >
        <SelectTrigger size="sm" className="h-7 text-xs">
          <SelectValue placeholder="Provider" />
        </SelectTrigger>
        <SelectContent>
          {availableProviders.map((p) => (
            <SelectItem key={p.name} value={p.name}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Searchable model dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => {
            setModelOpen((o) => !o)
            setSearch('')
          }}
          className="border-input dark:bg-input/30 dark:hover:bg-input/50 flex h-7 items-center gap-1.5 rounded-md border bg-transparent px-2.5 text-xs shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
        >
          <span className="max-w-[140px] truncate">
            {selectedModel?.name ?? 'Model'}
          </span>
          <ChevronDown className="size-3 opacity-50" />
        </button>

        {modelOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border bg-popover text-popover-foreground shadow-md">
            <div className="flex items-center gap-2 border-b px-2 py-1.5">
              <Search className="size-3.5 text-muted-foreground shrink-0" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search models..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-6 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-48 overflow-y-auto p-1">
              {filtered.length === 0 ? (
                <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                  No models found
                </div>
              ) : (
                filtered.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onModelChange(m.id)
                      setModelOpen(false)
                      setSearch('')
                    }}
                    className={`flex w-full items-center rounded-sm px-2 py-1.5 text-xs outline-none transition-colors hover:bg-accent hover:text-accent-foreground ${
                      m.id === model
                        ? 'bg-accent text-accent-foreground'
                        : ''
                    }`}
                  >
                    {m.name}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
