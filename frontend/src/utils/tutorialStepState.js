const TUTORIAL_STEP_KEY = 'tutorial.step'
const DEFAULT_TUTORIAL_STEP = 0
const TOTAL_TUTORIAL_STEPS = 18

const safeNumber = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : DEFAULT_TUTORIAL_STEP
}

const readStoredStep = () => {
  if (typeof window === 'undefined') return DEFAULT_TUTORIAL_STEP
  try {
    const raw = window.localStorage.getItem(TUTORIAL_STEP_KEY)
    const parsed = safeNumber(raw)
    return parsed >= 0 ? parsed : DEFAULT_TUTORIAL_STEP
  } catch (_) {
    return DEFAULT_TUTORIAL_STEP
  }
}

const writeStoredStep = (step) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(TUTORIAL_STEP_KEY, String(step))
  } catch (_) {}
}

let currentStep = readStoredStep()
const listeners = new Set()

export const getTutorialStep = () => currentStep

export const setTutorialStep = (nextStep) => {
  const normalized = Math.max(0, Math.floor(Number(nextStep) || 0))
  if (normalized === currentStep) return
  currentStep = normalized
  writeStoredStep(currentStep)
  listeners.forEach((listener) => {
    try {
      listener(currentStep)
    } catch (err) {
      console.error('[tutorial] listener error', err)
    }
  })
}

export const onTutorialStepChange = (handler) => {
  listeners.add(handler)
  return () => {
    listeners.delete(handler)
  }
}

export { DEFAULT_TUTORIAL_STEP, TOTAL_TUTORIAL_STEPS }
