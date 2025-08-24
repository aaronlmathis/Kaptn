"use client"

import { useState, useEffect } from 'react'

/**
 * Hook that safely handles localStorage access to prevent hydration mismatches
 * Returns a tuple of [value, setValue, isHydrated]
 */
export function useHydratedLocalStorage<T>(
  key: string,
  defaultValue: T,
  deserialize: (value: string) => T = JSON.parse,
  serialize: (value: T) => string = JSON.stringify
): [T, (value: T) => void, boolean] {
  const [isHydrated, setIsHydrated] = useState(false)
  const [value, setValue] = useState<T>(defaultValue)

  // Only run on client after hydration
  useEffect(() => {
    setIsHydrated(true)
    
    try {
      const item = localStorage.getItem(key)
      if (item !== null) {
        setValue(deserialize(item))
      }
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error)
    }
  }, [key, deserialize])

  const setStoredValue = (newValue: T) => {
    setValue(newValue)
    
    if (isHydrated) {
      try {
        localStorage.setItem(key, serialize(newValue))
      } catch (error) {
        console.warn(`Error setting localStorage key "${key}":`, error)
      }
    }
  }

  return [value, setStoredValue, isHydrated]
}

/**
 * Simple string version for common use cases
 */
export function useHydratedLocalStorageString(
  key: string,
  defaultValue: string = ''
): [string, (value: string) => void, boolean] {
  return useHydratedLocalStorage(
    key,
    defaultValue,
    (value) => value,
    (value) => value
  )
}
