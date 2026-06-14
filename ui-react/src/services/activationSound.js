let sharedAudioContext = null;

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }

  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    sharedAudioContext = new AudioContextClass();
  }

  return sharedAudioContext;
}

export function createActivationSoundService() {
  return {
    async play() {
      if (typeof window === "undefined") {
        return;
      }

      const audioContext = getAudioContext();
      if (!audioContext) {
        return;
      }

      if (audioContext.state === "suspended") {
        try {
          await audioContext.resume();
        } catch {
          return;
        }
      }

      const now = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(784, now);
      oscillator.frequency.exponentialRampToValueAtTime(988, now + 0.08);
      oscillator.frequency.exponentialRampToValueAtTime(740, now + 0.16);

      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.exponentialRampToValueAtTime(0.028, now + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.22);
    },
  };
}
