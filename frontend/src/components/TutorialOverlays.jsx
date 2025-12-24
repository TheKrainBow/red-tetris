import React, { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Button from './Button'
import { TOTAL_TUTORIAL_STEPS } from '../utils/tutorialStepState'

const buildOverlaySegments = (value) => {
  const segments = []
  if (!value) {
    return [{ top: 0, left: 0, right: 0, bottom: 0 }]
  }
  const { top, left, width, height } = value
  const safeHeight = Math.max(height, 0)
  segments.push({ top: 0, left: 0, right: 0, height: Math.max(top, 0) })
  segments.push({ top, left: 0, width: Math.max(left, 0), height: safeHeight })
  segments.push({ top, left: left + width, right: 0, height: safeHeight })
  segments.push({ top: top + safeHeight, left: 0, right: 0, bottom: 0 })
  return segments
}

const useElementRect = (selector) => {
  const [rect, setRect] = useState(null)
  const update = useCallback(() => {
    if (typeof document === 'undefined') return
    const el = document.querySelector(selector)
    if (!el) {
      setRect(null)
      return
    }
    setRect(el.getBoundingClientRect())
  }, [selector])

  useEffect(() => {
    update()
    if (typeof window === 'undefined') return
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    const observer = typeof MutationObserver !== 'undefined' ? new MutationObserver(update) : null
    if (observer) {
      observer.observe(document.body, { childList: true, subtree: true, attributes: true })
    }
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      observer?.disconnect()
    }
  }, [update])

  return rect
}

function SkipTutorialButton({ onSkip }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <Button
      size="small"
      onClick={onSkip}
      style={{
        position: 'fixed',
        right: 24,
        bottom: 24,
        zIndex: 10001,
        minWidth: '110px',
        opacity: 0.95,
      }}
    >
      Skip Tutorial
    </Button>,
    document.body
  )
}

const DEFAULT_OVERLAY_TITLE = 'Welcome to the Craftetris tutorial!'
const DEFAULT_OVERLAY_MESSAGE = 'In here, you will learn how to collect resources, control your spawn rates, and craft helpful items that will make your gameplay better.'

export function TutorialOverlay({
  stepNumber,
  onSkip,
  onNext,
  title = DEFAULT_OVERLAY_TITLE,
  message = DEFAULT_OVERLAY_MESSAGE,
  nextLabel = 'Next',
}) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <>
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        pointerEvents: 'auto',
      }}>
        <div style={{
          width: 'min(520px, 90vw)',
          padding: '28px',
          borderRadius: 20,
          backgroundColor: '#111215',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.5)',
          color: '#f5f5f5',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          position: 'relative',
        }}>
          {stepNumber ? (
            <span style={{ position: 'absolute', top: 12, right: 16, fontSize: '0.75rem', opacity: 0.7 }}>
              {stepNumber}/{TOTAL_TUTORIAL_STEPS}
            </span>
          ) : null}
          <h2 style={{ margin: 0, fontSize: '1.75rem', lineHeight: '1.2' }}>
            {title}
          </h2>
          <p style={{ margin: 0, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
            {message}
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
            <Button size="small" onClick={onNext} style={{ minWidth: '90px' }}>{nextLabel}</Button>
          </div>
        </div>
      </div>
      <SkipTutorialButton onSkip={onSkip} />
    </>,
    document.body
  )
}

export function TutorialHighlightOverlay({
  stepNumber,
  anchorSelector,
  title,
  message,
  onSkip,
  onNext,
  nextLabel = 'Next',
  tooltipAdjust = {},
}) {
  if (typeof document === 'undefined') return null
  const rect = useElementRect(anchorSelector)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  if (anchorSelector && !rect) {
    return null
  }

  const tooltipWidth = Math.min(360, Math.max(viewport.width - 32, 220))
  const baseLeft = rect
    ? Math.min(Math.max(rect.left, 16), Math.max(viewport.width - tooltipWidth - 16, 16))
    : 16
  const baseTop = rect
    ? Math.min(
        Math.max(rect.top + (rect.height || 0) + 12, 16),
        Math.max(viewport.height - 180, 16)
      )
    : 16
  const adjustedTop = Math.min(
    Math.max(baseTop + (tooltipAdjust.top || 0), 16),
    Math.max(viewport.height - 180, 16)
  )
  const adjustedLeft = Math.min(
    Math.max(baseLeft + (tooltipAdjust.left || 0), 16),
    Math.max(viewport.width - tooltipWidth - 16, 16)
  )

  const overlaySegments = rect ? buildOverlaySegments(rect) : [{ top: 0, left: 0, right: 0, bottom: 0 }]

  return createPortal(
    <>
      {overlaySegments.map((seg, idx) => (
        <div
          key={`overlay-${idx}`}
          style={{
            position: 'absolute',
            top: seg.top,
            left: seg.left,
            right: seg.right,
            bottom: seg.bottom,
            width: seg.width,
            height: seg.height,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            pointerEvents: 'auto',
            zIndex: 9998,
          }}
        />
      ))}
      {rect && (
        <div
          style={{
            position: 'absolute',
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            borderRadius: '12px',
            border: '2px solid rgba(255, 255, 255, 0.95)',
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        />
      )}
      <div style={{
        position: 'absolute',
        top: adjustedTop,
        left: adjustedLeft,
        width: tooltipWidth,
        padding: '20px',
        borderRadius: 18,
        backgroundColor: '#13151c',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: '0 18px 40px rgba(0,0,0,0.65)',
        color: '#f2f2f2',
        pointerEvents: 'auto',
        zIndex: 10000,
      }}>
        {stepNumber ? (
          <span style={{ position: 'absolute', top: 8, right: 12, fontSize: '0.75rem', opacity: 0.75 }}>
            {stepNumber}/{TOTAL_TUTORIAL_STEPS}
          </span>
        ) : null}
        <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{title}</h3>
        <p style={{ marginTop: '10px', marginBottom: '0', lineHeight: '1.4' }}>
          {message}
        </p>
        {onNext && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
            <Button size="small" onClick={onNext} style={{ minWidth: '90px' }}>{nextLabel}</Button>
          </div>
        )}
      </div>
      <SkipTutorialButton onSkip={onSkip} />
    </>,
    document.body
  )
}
