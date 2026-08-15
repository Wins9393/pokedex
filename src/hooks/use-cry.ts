import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Un seul élément audio pour toute l'appli : jouer un nouveau cri coupe
 * le précédent au lieu de les superposer.
 */
let shared: HTMLAudioElement | null = null

function getAudio(): HTMLAudioElement {
  shared ??= new Audio()
  return shared
}

export function useCry(volume = 0.4) {
  const [isPlaying, setIsPlaying] = useState(false)
  const tokenRef = useRef(0)

  const play = useCallback(
    (url: string | null) => {
      if (!url) return

      const audio = getAudio()
      const token = ++tokenRef.current

      audio.pause()
      audio.src = url
      audio.volume = volume
      audio.currentTime = 0

      const done = () => {
        if (tokenRef.current === token) setIsPlaying(false)
      }
      audio.onended = done
      audio.onerror = done

      setIsPlaying(true)
      void audio.play().catch(done)
    },
    [volume],
  )

  useEffect(
    () => () => {
      tokenRef.current += 1
    },
    [],
  )

  return { play, isPlaying }
}
