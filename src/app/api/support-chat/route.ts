import { NextResponse } from 'next/server'
import { getAnthropic, SUPPORT_SYSTEM_PROMPT } from '@/lib/anthropic'

export const runtime = 'nodejs'

const MAX_TURNS = 12

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export async function POST(req: Request) {
  try {
    const { messages } = (await req.json()) as { messages: ChatMessage[] }

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 })
    }
    if (messages.length > MAX_TURNS) {
      return NextResponse.json({ error: 'Conversation too long' }, { status: 400 })
    }
    for (const m of messages) {
      if (typeof m.content !== 'string' || m.content.length > 2000) {
        return NextResponse.json({ error: 'Message too long' }, { status: 400 })
      }
    }

    const response = await getAnthropic().messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 400,
      system: SUPPORT_SYSTEM_PROMPT,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    })

    const block = response.content.find((c) => c.type === 'text')
    let text = block?.type === 'text' ? block.text : ''

    const shouldEscalate = text.includes('[ESCALATE]')
    text = text.replace('[ESCALATE]', '').trim()

    return NextResponse.json({ reply: text, shouldEscalate })
  } catch (err: any) {
    console.error('support-chat error', err)
    return NextResponse.json({ error: err.message || 'Something went wrong' }, { status: 500 })
  }
}
