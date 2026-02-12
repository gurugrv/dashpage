'use client'

import dynamic from 'next/dynamic'

const Builder = dynamic(() => import('@/components/Builder').then(m => m.Builder), {
  ssr: false,
})

export default function Home() {
  return <Builder />
}
