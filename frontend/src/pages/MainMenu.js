import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import Button from '../components/Button'
import { loadSkyboxCube } from '../three/Skybox.jsx'
import { getLocalStorageItem } from '../utils/storage'
import { navigate } from '../utils/navigation'
import socketClient from '../utils/socketClient'
import { getTutorialStep, setTutorialStep as updateStoredTutorialStep } from '../utils/tutorialStepState'
import { TutorialOverlay, TutorialHighlightOverlay } from '../components/TutorialOverlays'

const TOTAL_TUTORIAL_STEPS = 18
const USERNAME_KEY = 'username'
const KICK_NOTICE_KEY = 'kick.notice'

// Testable helpers
export function readUsername() {
  return getLocalStorageItem(USERNAME_KEY, '') || ''
}

export function navToMultiplayer() { navigate('/multiplayer') }
export function navToSingleplayer() { navigate('/singleplayer') }
export function navToShop() { navigate('/shop') }
export function navToLeaderboard() { navigate('/leaderboard') }

export function attachReady(promise, setReady) {
  let mounted = true
  promise
    .then(() => { if (mounted) setReady(true) })
    .catch(() => { if (mounted) setReady(true) })
  return () => { mounted = false }
}

export default function MainMenu() {
  const username = useMemo(() => readUsername(), [])
  const storedTutorialStep = useMemo(() => getTutorialStep(), [])
  const [bgReady, setBgReady] = useState(false)
  const [kickedMessage, setKickedMessage] = useState('')
  const [logoReady, setLogoReady] = useState(false)
  const [tutorialStep, setTutorialStepState] = useState(storedTutorialStep)
  const [needsTutorial, setNeedsTutorial] = useState(false)
  const [utilityTab, setUtilityTab] = useState(null)
  const initialStepRef = useRef(storedTutorialStep)
  const setTutorialStep = useCallback((value) => setTutorialStepState(value), [])
  const writeTutorialStep = useCallback((value) => updateStoredTutorialStep(value), [])
  useEffect(() => attachReady(loadSkyboxCube(), setBgReady), [])

  useEffect(() => {
    try {
      const msg = sessionStorage.getItem(KICK_NOTICE_KEY)
      if (msg) setKickedMessage(msg)
    } catch (_) {}
  }, [])

  useEffect(() => {
    if (!username) return
    socketClient.sendCommand('get_user_by_player_name', { playerName: username })
      .then((res) => {
        console.log('get_user_by_player_name response', res)
        const userRow = res?.data?.user?.[0] || null
        const hasSeenFlag = userRow?.hasSeenTutorial ?? userRow?.has_seen_tutorial ?? true
        setNeedsTutorial(hasSeenFlag === false)
      })
      .catch((err) => {
        console.error('get_user_by_player_name error', err)
      })
  }, [username])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (event) => {
      const tab = event?.detail?.tab ?? null
      setUtilityTab(tab)
      if (!needsTutorial) return
      if (tutorialStep === 2 && tab === 'inventory') {
        setTutorialStep(3)
      } else if (tutorialStep === 4 && tab === 'spawn') {
        setTutorialStep(5)
      } else if (tutorialStep === 6 && tab === 'stats') {
        setTutorialStep(7)
      }
    }
    window.addEventListener('utilityDockTabChanged', handler)
    return () => window.removeEventListener('utilityDockTabChanged', handler)
  }, [needsTutorial, tutorialStep])

  useEffect(() => {
    if (!needsTutorial && tutorialStep !== 0) {
      setTutorialStep(0)
    }
  }, [needsTutorial, tutorialStep])

  useEffect(() => {
    if (!needsTutorial) return
    if (tutorialStep > 0) return
    if (initialStepRef.current > 0) {
      setTutorialStep(initialStepRef.current)
    } else {
      setTutorialStep(1)
    }
  }, [needsTutorial, tutorialStep])

  useEffect(() => {
    if (typeof window === 'undefined' || tutorialStep !== 8) return
    const updatePath = () => {
      if (window.location.pathname !== '/') {
        setTutorialStep((prev) => (prev === 8 ? 9 : prev))
      }
    }
    updatePath()
    window.addEventListener('popstate', updatePath)
    return () => window.removeEventListener('popstate', updatePath)
  }, [tutorialStep])

  useEffect(() => {
    if (tutorialStep === 0 && needsTutorial && initialStepRef.current > 0) return
    writeTutorialStep(tutorialStep)
  }, [tutorialStep, needsTutorial, writeTutorialStep])

  const handleSkipTutorial = async () => {
    if (username) {
      try {
        await socketClient.setHasSeenTutorial(username, true)
      } catch (err) {
        console.error('Failed to skip tutorial', err)
      }
    }
    dispatchUtilityTab(null)
    setNeedsTutorial(false)
    setTutorialStep(0)
  }

  const handleNextTutorial = () => {
    setTutorialStep(2)
  }

  const dispatchUtilityTab = useCallback((tab) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('utilityDockSetTab', { detail: { tab } }))
  }, [])

  const dismissKicked = () => {
    setKickedMessage('')
    try { sessionStorage.removeItem(KICK_NOTICE_KEY) } catch (_) {}
  }

  const handleInventoryNext = () => {
    dispatchUtilityTab(null)
    setTutorialStep(4)
  }

  const handleSpawnNext = () => {
    dispatchUtilityTab(null)
    setTutorialStep(6)
  }

  const handleStatsNext = () => {
    dispatchUtilityTab(null)
    setTutorialStep(8)
  }

  const showStepOneOverlay = needsTutorial && tutorialStep === 1
  const showStepTwoHighlight = needsTutorial && tutorialStep === 2
  const showStepThreeHighlight = needsTutorial && tutorialStep === 3 && utilityTab === 'inventory'
  const showStepFourHighlight = needsTutorial && tutorialStep === 4
  const showStepFiveHighlight = needsTutorial && tutorialStep === 5 && utilityTab === 'spawn'
  const showStepSixHighlight = needsTutorial && tutorialStep === 6
  const showStepSevenHighlight = needsTutorial && tutorialStep === 7 && utilityTab === 'stats'
  const showStepEightHighlight = needsTutorial && tutorialStep === 8
  const showStepSixteenHighlight = needsTutorial && tutorialStep === 16 && bgReady && logoReady

  return (
    <div className="mm-root">

      {/* Skybox is rendered persistently by Router; just overlay here */}
      <div className="mm-overlay" />

      {/* content */}
      <div className={`mm-content ${bgReady ? 'mm-ready' : ''}`}>
        <img className="mm-logo" src="/ui/Craftetris.png" alt="Craftetris" onLoad={() => setLogoReady(true)} />
        <div className="mm-primary">
          <Button
            data-tutorial-target="singleplayer"
            onClick={() => {
              if (needsTutorial && tutorialStep === 16) {
                setTutorialStep(17)
                updateStoredTutorialStep(17)
              }
              navToSingleplayer()
            }}
          >
            Singleplayer
          </Button>
          <Button onClick={() => navToMultiplayer()}>Multiplayer</Button>
          <Button onClick={() => navToShop()} data-tutorial-target="trade-outpost">
            <span className="btn-inline"><img className="btn-emerald" src="/blocks/EmeraldItem.png" alt="" />Trading outpost</span>
          </Button>
        </div>
        <div className="mm-row">
          <div className="mm-row-center">
            <Button className="ui-btn-narrow" onClick={() => { navigate('/options') }}>Options...</Button>
            <Button className="ui-btn-narrow">Quit game</Button>
          </div>
          <Button size="small" className="mm-leader" title="Leaderboard" onClick={() => navToLeaderboard()}>🏆</Button>
        </div>
      </div>

      {/* footer line similar to screenshot */}
      <div className="mm-bottom">
      </div>

      {kickedMessage ? (
        <div className="game-modal-backdrop">
          <div className="game-modal">
            <div className="game-modal-title">Kicked</div>
            <div className="game-modal-body">{kickedMessage}</div>
            <div className="game-modal-actions">
              <Button onClick={dismissKicked}>Close</Button>
            </div>
          </div>
        </div>
      ) : null}
      {showStepOneOverlay && (
        <TutorialOverlay stepNumber={1} onSkip={handleSkipTutorial} onNext={handleNextTutorial} />
      )}
      {showStepTwoHighlight && (
        <TutorialHighlightOverlay
          onSkip={handleSkipTutorial}
          anchorSelector='.shop-utility-button[aria-label="Inventory"]'
          title="First, let's check your inventory."
          message="Click the highlighted Inventory button (top left) to continue."
          stepNumber={2}
        />
      )}
      {showStepThreeHighlight && (
        <TutorialHighlightOverlay
          onSkip={handleSkipTutorial}
          onNext={handleInventoryNext}
          anchorSelector='.utility-panel-inventory'
          title="Here is your inventory."
          message="You can see your emeralds, owned resources, and items here. Emeralds are the main leaderboard currency."
          stepNumber={3}
        />
      )}
      {showStepFourHighlight && (
        <TutorialHighlightOverlay
          onSkip={handleSkipTutorial}
          anchorSelector='.shop-utility-button[aria-label="Spawn Rate"]'
          title="Now, let's check your spawn rates."
          message="Click the highlighted Spawn Rate button to continue."
          stepNumber={4}
        />
      )}
      {showStepFiveHighlight && (
        <TutorialHighlightOverlay
          onSkip={handleSkipTutorial}
          onNext={handleSpawnNext}
          anchorSelector='.utility-panel-spawn'
          title="This is your spawn-rate panel."
          message="Only dirt will spawn for now, but later you can unlock rare resources and adjust their odds right here."
          stepNumber={5}
        />
      )}
      {showStepSixHighlight && (
        <TutorialHighlightOverlay
          onSkip={handleSkipTutorial}
          anchorSelector='.shop-utility-button[aria-label="Statistics"]'
          title="Lastly, let's check your statistics."
          message="Click the highlighted Statistics button to continue."
          stepNumber={6}
        />
      )}
      {showStepSevenHighlight && (
        <TutorialHighlightOverlay
          onSkip={handleSkipTutorial}
          onNext={handleStatsNext}
          anchorSelector='.utility-panel-stats'
          title="Here are your statistics."
          message="Track your items, shop perks, and progress here."
          stepNumber={7}
        />
      )}
      {showStepEightHighlight && (
        <TutorialHighlightOverlay
          onSkip={handleSkipTutorial}
          anchorSelector='[data-tutorial-target="trade-outpost"]'
          title="Let's take a look at the shop!"
          message="Click the highlighted Trading Outpost button to continue."
          stepNumber={8}
        />
      )}
      {showStepSixteenHighlight && (
        <TutorialHighlightOverlay
          onSkip={handleSkipTutorial}
          anchorSelector='.mm-primary button[data-tutorial-target="singleplayer"]'
          title="Singleplayer"
          message="You can gather resources in Singleplayer or Multiplayer. Let’s start with Singleplayer."
          stepNumber={16}
        />
      )}
    </div>
  )
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
